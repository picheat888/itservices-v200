<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
