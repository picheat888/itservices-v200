<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Employee\EmployeeStatus;
use App\Http\Middleware\CheckSessionTimeout;
use App\Models\Auth\UserDevice;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Direct-URL access control: a guest who hits a protected API endpoint
 * directly (deep link / bookmarked URL / curl) before signing in must be
 * rejected with 401 — never served data. The SPA's client-side redirect to
 * /login is convenience only; this is the real boundary.
 */
class GuestAccessTest extends TestCase
{
    use RefreshDatabase;

    /** The SPA's origin: it is what gives an API request its session. */
    private const ORIGIN = 'http://localhost:8000';

    /** A representative protected GET endpoint from every major module. */
    public static function protectedEndpoints(): array
    {
        return [
            'me' => ['/api/me'],
            'employees' => ['/api/employees'],
            'tickets' => ['/api/tickets'],
            'contracts' => ['/api/contracts'],
            'assets' => ['/api/assets'],
            'stock items' => ['/api/stock-items'],
            'stock requests' => ['/api/stock-requests'],
            'email templates' => ['/api/email-templates'],
            'audit logs' => ['/api/audit-logs'],
            'notifications' => ['/api/notifications'],
            'permissions' => ['/api/permissions'],
            'group roles' => ['/api/group-roles'],
        ];
    }

    #[DataProvider('protectedEndpoints')]
    public function test_guests_are_blocked_from_protected_endpoints(string $url): void
    {
        $this->getJson($url)->assertUnauthorized(); // 401, no data
    }

    #[DataProvider('protectedEndpoints')]
    public function test_authenticated_users_can_reach_those_endpoints(string $url): void
    {
        // Same URLs return non-401 once signed in (proves the 401 above is the
        // auth guard, not a missing route). A 403 (permission) is still "past auth".
        $status = $this->actingAs(User::factory()->create())->getJson($url)->status();

        $this->assertNotSame(401, $status, "{$url} should be reachable when authenticated");
        $this->assertNotSame(404, $status, "{$url} should be a real route");
    }

    /** The branding settings endpoint is intentionally public (it themes the login page). */
    public function test_public_settings_endpoint_is_reachable_by_guests(): void
    {
        $this->getJson('/api/settings')->assertOk()->assertJsonPath('message', 'success');
    }

    /** That public endpoint must not leak SMTP credentials or other secrets. */
    public function test_public_settings_does_not_leak_secrets(): void
    {
        $data = $this->getJson('/api/settings')->json('data');
        $flat = strtolower(json_encode($data));

        foreach (['password', 'smtp', 'mail_host', 'secret', 'token'] as $needle) {
            $this->assertStringNotContainsString($needle, $flat, "settings payload should not expose '{$needle}'");
        }
    }

    /**
     * Before sign-in the page needs its name, logo and theme — nothing about the company
     * behind it (legal name, tax ID, address) or how the desk runs (SLA targets).
     */
    public function test_a_guest_gets_branding_and_theme_only(): void
    {
        $data = $this->getJson('/api/settings')->assertOk()->json('data');

        $this->assertEqualsCanonicalizing(
            ['brand_name', 'brand_sub', 'logo_url', 'theme_accent', 'theme_density', 'theme_radius'],
            array_keys($data),
        );

        $signedIn = $this->actingAs(User::factory()->create())->getJson('/api/settings')->assertOk()->json('data');
        foreach (['company_name', 'legal_name', 'tax_id', 'address', 'ticket_sla'] as $key) {
            $this->assertArrayHasKey($key, $signedIn);
        }
    }

    /** A session past the idle timeout is answered like every other API call, not with the full settings. */
    public function test_an_idle_session_gets_session_expired_from_settings(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        Cache::put(CheckSessionTimeout::clockKey('idle-clock'), time() - 40 * 60, 3600);

        $this->actingAs(User::factory()->create())
            ->withHeader('Origin', self::ORIGIN)
            ->withSession([CheckSessionTimeout::IDLE_CLOCK => 'idle-clock'])
            ->getJson('/api/settings')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'session_expired');
    }

    public function test_a_closed_account_gets_account_closed_from_settings(): void
    {
        $employee = Employee::create(['first_name' => 'Leaver', 'status' => EmployeeStatus::Resigned, 'last_day' => now()->subWeek()->toDateString()]);

        $this->actingAs(User::factory()->create(['employee_id' => $employee->id]))
            ->getJson('/api/settings')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'account_closed');
    }

    public function test_an_ended_device_gets_its_reason_from_settings(): void
    {
        $device = UserDevice::factory()->ended(DeviceEndReason::Profile)->create();

        $this->actingAs($device->user)
            ->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(config('session.cookie'), Str::random(40))
            ->withSession([DeviceService::SESSION_KEY => $device->id])
            ->getJson('/api/settings')
            ->assertUnauthorized()
            ->assertJsonPath('reason', 'profile');
    }
}
