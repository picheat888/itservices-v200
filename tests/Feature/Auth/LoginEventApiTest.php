<?php

// The Login log tab API (system.view_logins): gate, search, filters, paging, and the migration that hands the key to audit viewers.

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginEventApiTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private function asViewer(string ...$permissions): static
    {
        $role = Role::create(['key' => 'viewer', 'name' => 'Viewer', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $this->actingAs(User::factory()->create(['role' => 'viewer']))->withHeader('Origin', self::ORIGIN);
    }

    private function asAdmin(): static
    {
        return $this->actingAs(User::factory()->create(['role' => 'super']))->withHeader('Origin', self::ORIGIN);
    }

    /** @param  array<string, mixed>  $attributes */
    private function event(array $attributes = []): LoginEvent
    {
        return LoginEvent::create([
            'user_id' => null,
            'event' => LoginEventType::SignedIn,
            'ip' => '203.150.12.85',
            'location' => 'Head office',
            'os' => 'Windows',
            'browser' => 'Chrome',
            'created_at' => '2026-10-10 09:00:00',
            ...$attributes,
        ]);
    }

    /** @return list<int> */
    private function ids(string $query = ''): array
    {
        return array_column($this->getJson('/api/login-events'.$query)->assertOk()->json('data'), 'id');
    }

    public function test_the_log_needs_the_view_logins_key(): void
    {
        $this->event();

        $this->asViewer('system.manage_permissions', 'system.view_audit')->getJson('/api/login-events')->assertForbidden();
    }

    public function test_a_holder_of_the_key_and_a_super_admin_can_read_it(): void
    {
        $this->event();

        $this->asViewer('system.manage_permissions', 'system.view_logins')->getJson('/api/login-events')->assertOk()->assertJsonCount(1, 'data');
        $this->asAdmin()->getJson('/api/login-events')->assertOk();
    }

    public function test_guests_are_refused(): void
    {
        $this->getJson('/api/login-events')->assertUnauthorized();
    }

    public function test_a_row_carries_who_what_and_where(): void
    {
        $employee = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'email' => 'somchai@inaba.co.th']);
        $user = User::factory()->create(['name' => 'Somchai Jaidee', 'username' => 'somchai', 'employee_id' => $employee->id]);
        $row = $this->event(['user_id' => $user->id, 'event' => LoginEventType::ForcedOut, 'reason' => DeviceEndReason::Profile, 'remembered' => true]);
        $this->event(['event' => LoginEventType::Failed, 'login_name' => 'ghost']);

        $data = $this->asAdmin()->getJson('/api/login-events?sort=created_at')->assertOk()->json('data');

        $this->assertSame([
            'id' => $row->id,
            'created_at' => '2026-10-10T09:00:00+07:00',
            'event' => 'forced_out',
            'reason' => 'profile',
            'remembered' => true,
            'login_name' => null,
            'user' => ['id' => $user->id, 'name' => 'Somchai Jaidee', 'name_th' => 'สมชาย ใจดี', 'username' => 'somchai'],
            'ip' => '203.150.12.85',
            'location' => 'Head office',
            'os' => 'Windows',
            'browser' => 'Chrome',
        ], $data[0]);
        $this->assertNull($data[1]['user']);
        $this->assertSame('ghost', $data[1]['login_name']);
        $this->assertSame('failed', $data[1]['event']);
    }

    public function test_the_list_is_newest_first_and_can_be_turned_around(): void
    {
        $old = $this->event(['created_at' => '2026-10-01 08:00:00']);
        $new = $this->event(['created_at' => '2026-10-12 08:00:00']);
        $tied = $this->event(['created_at' => '2026-10-12 08:00:00']);

        $this->asAdmin();

        $this->assertSame([$tied->id, $new->id, $old->id], $this->ids());
        $this->assertSame([$tied->id, $new->id, $old->id], $this->ids('?sort=-created_at'));
        $this->assertSame([$old->id, $new->id, $tied->id], $this->ids('?sort=created_at'));
        $this->getJson('/api/login-events?sort=ip')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    public function test_search_finds_a_username_an_ip_a_typed_name_and_a_place(): void
    {
        $somchai = User::factory()->create(['name' => 'Somchai', 'username' => 'somchai.j']);
        $malee = User::factory()->create(['name' => 'Malee', 'username' => 'malee.k']);
        $byUsername = $this->event(['user_id' => $somchai->id, 'ip' => '10.1.1.1', 'location' => null]);
        $byIp = $this->event(['user_id' => $malee->id, 'ip' => '172.20.5.9', 'location' => null]);
        $byTypedName = $this->event(['event' => LoginEventType::Failed, 'login_name' => 'admin_guess', 'ip' => '10.2.2.2', 'location' => null]);
        $byPlace = $this->event(['user_id' => $malee->id, 'ip' => '10.3.3.3', 'location' => 'Chiang Mai, Thailand']);

        $this->asAdmin();

        $this->assertSame([$byUsername->id], $this->ids('?search=somchai.j'));
        $this->assertSame([$byIp->id], $this->ids('?search=172.20'));
        $this->assertSame([$byTypedName->id], $this->ids('?search=admin_guess'));
        $this->assertSame([$byPlace->id], $this->ids('?search='.rawurlencode('chiang mai')));
        $this->assertSame([], $this->ids('?search=nobody'));
    }

    public function test_search_finds_an_employee_by_thai_or_english_name_and_ands_the_words(): void
    {
        $withThai = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'email' => 'a@inaba.co.th']);
        $withoutThai = Employee::create(['first_name' => 'Malee', 'last_name' => 'Suk', 'email' => 'b@inaba.co.th']);
        $thaiUser = User::factory()->create(['name' => 'S. J.', 'username' => 'sj', 'employee_id' => $withThai->id]);
        $plainUser = User::factory()->create(['name' => 'M. S.', 'username' => 'ms', 'employee_id' => $withoutThai->id]);
        $thaiRow = $this->event(['user_id' => $thaiUser->id, 'location' => null, 'ip' => '10.1.1.1']);
        $plainRow = $this->event(['user_id' => $plainUser->id, 'location' => null, 'ip' => '10.2.2.2']);

        $this->asAdmin();

        $this->assertSame([$thaiRow->id], $this->ids('?search='.rawurlencode('สมชาย')));
        $this->assertSame([$thaiRow->id], $this->ids('?search='.rawurlencode('สมชายใจดี')));
        $this->assertSame([$thaiRow->id], $this->ids('?search=Somchai'));
        $this->assertSame([$plainRow->id], $this->ids('?search=Malee'));
        $this->assertSame([$plainRow->id], $this->ids('?search=malee+10.2'));
        $this->assertSame([], $this->ids('?search=malee+10.1'));
    }

    public function test_the_event_filter_keeps_one_kind(): void
    {
        $failed = $this->event(['event' => LoginEventType::Failed]);
        $locked = $this->event(['event' => LoginEventType::Locked]);
        $this->event(['event' => LoginEventType::SignedIn]);

        $this->asAdmin();

        $this->assertSame([$failed->id], $this->ids('?event=failed'));
        $this->assertSame([$locked->id], $this->ids('?event=locked'));
        $this->getJson('/api/login-events?event=bogus')->assertUnprocessable()->assertJsonValidationErrors('event');
    }

    public function test_the_date_range_includes_both_end_days(): void
    {
        $before = $this->event(['created_at' => '2026-10-09 23:59:59']);
        $first = $this->event(['created_at' => '2026-10-10 00:00:00']);
        $last = $this->event(['created_at' => '2026-10-11 23:59:59']);
        $after = $this->event(['created_at' => '2026-10-12 00:00:00']);

        $this->asAdmin();

        $this->assertSame([$last->id, $first->id], $this->ids('?from=2026-10-10&to=2026-10-11'));
        $this->assertSame([$first->id], $this->ids('?from=2026-10-10&to=2026-10-10'));
        $this->assertSame([$after->id, $last->id, $first->id], $this->ids('?from=2026-10-10'));
        $this->assertSame([$last->id, $first->id, $before->id], $this->ids('?to=2026-10-11'));
        $this->getJson('/api/login-events?from=not-a-date')->assertUnprocessable()->assertJsonValidationErrors('from');
    }

    public function test_paging_reports_its_totals_and_keeps_to_the_bounds(): void
    {
        foreach (range(1, 25) as $minute) {
            $this->event(['created_at' => now()->subHour()->addMinutes($minute)->toDateTimeString()]);
        }

        $this->asAdmin();

        $this->getJson('/api/login-events')->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2);
        $this->getJson('/api/login-events?per_page=10&page=3')->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.last_page', 3);
        $this->getJson('/api/login-events?per_page=100')->assertOk()->assertJsonCount(25, 'data');
        $this->getJson('/api/login-events?per_page=9')->assertUnprocessable()->assertJsonValidationErrors('per_page');
        $this->getJson('/api/login-events?per_page=101')->assertUnprocessable()->assertJsonValidationErrors('per_page');
        $this->getJson('/api/login-events?page=0')->assertUnprocessable()->assertJsonValidationErrors('page');
    }

    public function test_the_default_roles_and_the_catalogue_know_the_key(): void
    {
        $this->assertContains('system.view_logins', Permissions::all());
        $this->assertContains('system.view_logins', Permissions::defaults()['it_supervisorleader']);
        $this->assertNotContains('system.view_logins', Permissions::defaults()['admin']);
    }

    private function migration(): Migration
    {
        return require database_path('migrations/2026_10_20_000004_grant_view_logins_to_audit_viewers.php');
    }

    /** @param  list<string>  $held */
    private function roleHolding(string $key, array $held, bool $allowed = true): Role
    {
        $role = Role::create(['key' => $key, 'name' => ucfirst($key), 'is_system' => false]);
        foreach ($held as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => $allowed]);
        }

        return $role;
    }

    private function holdsLogins(Role $role): bool
    {
        return RolePermission::where('role_id', $role->id)->where('permission', 'system.view_logins')->where('allowed', true)->exists();
    }

    public function test_the_migration_grants_the_key_to_audit_viewers_only(): void
    {
        $auditor = $this->roleHolding('auditor', ['system.manage_permissions', 'system.view_audit']);
        $switchedOff = $this->roleHolding('switched_off', ['system.view_audit'], allowed: false);
        $editor = $this->roleHolding('editor', ['system.manage_permissions', 'system.manage_roles', 'tickets.view_all']);
        $alreadyOff = $this->roleHolding('already_off', ['system.view_audit']);
        RolePermission::create(['role_id' => $alreadyOff->id, 'permission' => 'system.view_logins', 'allowed' => false]);

        $this->migration()->up();

        $this->assertTrue($this->holdsLogins($auditor));
        $this->assertTrue($this->holdsLogins($alreadyOff), 'a template save that wrote the key as off is turned on');
        $this->assertFalse($this->holdsLogins($switchedOff));
        $this->assertFalse($this->holdsLogins($editor));
        $this->assertSame(2, RolePermission::where('permission', 'system.view_logins')->where('allowed', true)->count());
    }

    public function test_the_migration_can_run_twice_and_leaves_other_grants_alone(): void
    {
        $auditor = $this->roleHolding('auditor', ['system.manage_permissions', 'system.view_audit']);

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, RolePermission::where('role_id', $auditor->id)->where('permission', 'system.view_logins')->count());
        $this->assertSame(3, RolePermission::where('role_id', $auditor->id)->count());
        $this->assertTrue(RolePermission::where('role_id', $auditor->id)->where('permission', 'system.view_audit')->value('allowed'));
    }

    public function test_rolling_the_migration_back_removes_only_that_key(): void
    {
        $auditor = $this->roleHolding('auditor', ['system.manage_permissions', 'system.view_audit']);
        $this->migration()->up();

        $this->migration()->down();

        $this->assertFalse(RolePermission::where('permission', 'system.view_logins')->exists());
        $this->assertSame(2, RolePermission::where('role_id', $auditor->id)->count());
    }
}
