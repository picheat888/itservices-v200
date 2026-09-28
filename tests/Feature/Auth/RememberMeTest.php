<?php

namespace Tests\Feature\Auth;

use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * "Remember me": the cookie lasts 7 days, a remembered sign-in is not cut short by the
 * idle timeout (that is what ticking the box asks for), a sign-in without it is — even
 * when the browser still holds an old remember cookie — and a password change or an
 * admin reset ends every remembered sign-in on other devices.
 */
class RememberMeTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private function login(User $user, bool $remember): TestResponse
    {
        return $this->withHeader('Origin', self::ORIGIN)
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password', 'remember' => $remember])
            ->assertOk();
    }

    /** The recaller cookie value the guard would issue for this user. */
    private function recaller(User $user): string
    {
        return $user->id.'|'.$user->getRememberToken().'|'.$user->getAuthPassword();
    }

    public function test_the_remember_cookie_lasts_seven_days(): void
    {
        $user = User::factory()->create();

        $cookie = $this->login($user, true)->getCookie(Auth::guard('web')->getRecallerName(), false);

        $this->assertNotNull($cookie);
        $days = ($cookie->getExpiresTime() - time()) / 86400;
        $this->assertEqualsWithDelta(7, $days, 0.01, "the remember cookie lasts {$days} days");
    }

    public function test_the_session_knows_whether_the_sign_in_was_remembered(): void
    {
        $this->login(User::factory()->create(), true)->assertSessionHas('_sec_remembered', true);
        $this->login(User::factory()->create(), false)->assertSessionHas('_sec_remembered', false);
    }

    public function test_a_remembered_sign_in_is_not_cut_short_by_the_idle_timeout(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Origin', self::ORIGIN)
            ->withSession(['_sec_last_activity' => time() - 31 * 60, '_sec_remembered' => true])
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.remembered', true);
    }

    public function test_a_sign_in_restored_from_the_remember_cookie_counts_as_remembered(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $user = User::factory()->create(['remember_token' => 'token-from-last-week']);

        // No session at all — the browser comes back with only the remember cookie.
        $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials() // JSON requests only send cookies when asked
            ->withCookie(Auth::guard('web')->getRecallerName(), $this->recaller($user))
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.remembered', true);
    }

    public function test_an_idle_sign_in_without_remember_still_expires(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->withHeader('Origin', self::ORIGIN)
            ->withSession(['_sec_last_activity' => time() - 31 * 60, '_sec_remembered' => false])
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJsonPath('message', 'session_expired');
    }

    public function test_changing_your_password_signs_out_every_other_device(): void
    {
        $user = User::factory()->create(['remember_token' => 'old-token']);
        DB::table('sessions')->insert(['id' => 'other-device', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $oldRecaller = $this->recaller($user);

        $this->actingAs($user)
            ->withHeader('Origin', self::ORIGIN)
            ->putJson('/api/password', ['current_password' => 'password', 'password' => 'N3w-Passw0rd!', 'password_confirmation' => 'N3w-Passw0rd!'])
            ->assertOk();

        $this->assertNotSame('old-token', $user->fresh()->getRememberToken(), 'the remember token must rotate');
        $this->assertDatabaseMissing('sessions', ['id' => 'other-device']);

        // The other device's remember cookie no longer signs anybody in.
        Auth::forgetGuards();
        $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials() // JSON requests only send cookies when asked
            ->withCookie(Auth::guard('web')->getRecallerName(), $oldRecaller)
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_an_admin_password_reset_ends_remembered_sign_ins(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $employee = Employee::create(['code' => 'EMP-7101', 'first_name' => 'Rem', 'last_name' => 'Ember', 'username' => 'rem_ember']);
        $target = User::factory()->create(['employee_id' => $employee->id, 'username' => 'rem_ember', 'remember_token' => 'old-token']);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])
            ->assertOk();

        $this->assertNotSame('old-token', $target->fresh()->getRememberToken());
    }
}
