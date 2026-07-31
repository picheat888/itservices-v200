<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EmployeeCredentialsManageTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployeeWithAccount(string $code = 'EMP-7001', string $username = 'old_name'): Employee
    {
        $employee = Employee::create(['code' => $code, 'first_name' => 'Cred', 'last_name' => 'Test', 'username' => $username]);
        User::factory()->create(['employee_id' => $employee->id, 'username' => $username]);

        return $employee;
    }

    public function test_username_change_updates_user_and_employee(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount();

        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'new_name'])->assertOk();

        $this->assertSame('new_name', $employee->fresh()->user->username);
        $this->assertSame('new_name', $employee->fresh()->username);
    }

    public function test_username_unique_ignores_own_account_but_rejects_others(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount();
        User::factory()->create(['username' => 'taken_name']);

        // Re-submitting the current username is fine.
        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'old_name'])->assertOk();
        // Someone else's username is rejected.
        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'taken_name'])
            ->assertStatus(422)->assertJsonValidationErrors('username');
    }

    /** Logins are case-insensitive, so "John_Do" must not slip past an existing "john_do". */
    public function test_username_uniqueness_ignores_letter_case(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7012', 'case_owner');
        User::factory()->create(['username' => 'john_do']);

        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'John_Do'])
            ->assertStatus(422)->assertJsonValidationErrors('username');

        $fresh = Employee::create(['code' => 'EMP-7013', 'first_name' => 'Case', 'last_name' => 'Clash']);
        $this->postJson("/api/employees/{$fresh->id}/credentials", [
            'username' => 'JOHN_DO',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertStatus(422)->assertJsonValidationErrors('username');
    }

    /** A reset without a password generates one that satisfies the policy; a typed one wins. */
    public function test_reset_generates_a_compliant_password_and_a_custom_one_wins(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7002', 'reset_me');

        $generated = $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])
            ->assertOk()->json('new_password');

        $this->assertNotSame('EMP-7002', $generated, 'the employee code must never be used as a password');
        $this->assertTrue(Hash::check($generated, $employee->fresh()->user->password));
        // Same policy the endpoint enforces on a typed password.
        $this->assertMatchesRegularExpression('/[a-z]/', $generated);
        $this->assertMatchesRegularExpression('/[A-Z]/', $generated);
        $this->assertMatchesRegularExpression('/\d/', $generated);
        $this->assertMatchesRegularExpression('/[^A-Za-z0-9]/', $generated);
        $this->assertGreaterThanOrEqual(8, strlen($generated));

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => 'Custom-Secret9'])
            ->assertOk()->assertJsonPath('new_password', 'Custom-Secret9');
        $this->assertTrue(Hash::check('Custom-Secret9', $employee->fresh()->user->password));
    }

    /**
     * A reset is the usual response to a suspected takeover, so it must evict whoever is
     * already signed in — otherwise the live session survives the reset and, on the forced
     * change screen, could set a password without ever knowing the one the admin issued.
     */
    public function test_reset_signs_the_account_out_everywhere(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7014', 'evict_me');
        $user = $employee->user;

        // A live session row and an API token for that account.
        DB::table('sessions')->insert([
            'id' => 'session-under-test',
            'user_id' => $user->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'phpunit',
            'payload' => '',
            'last_activity' => time(),
        ]);
        $user->createToken('device')->plainTextToken;

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])->assertOk();

        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_force_change_flag_is_set_and_cleared_per_reset(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7003', 'force_me');

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'force_change' => true])->assertOk();
        $user = $employee->fresh()->user;
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertNull($user->password_changed_at);

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'force_change' => false])->assertOk();
        $this->assertFalse((bool) $employee->fresh()->user->must_change_password);
    }

    public function test_endpoint_rejects_employee_without_account_and_empty_payload(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $bare = Employee::create(['code' => 'EMP-7004', 'first_name' => 'No', 'last_name' => 'Account']);

        $this->putJson("/api/employees/{$bare->id}/credentials", ['username' => 'whatever'])
            ->assertStatus(422)->assertJsonPath('message', 'no_account');

        $withAccount = $this->makeEmployeeWithAccount('EMP-7005', 'noop_user');
        $this->putJson("/api/employees/{$withAccount->id}/credentials", [])->assertStatus(422);
    }

    public function test_field_level_permission_gates(): void
    {
        // Role with reset_password but NOT set_credentials.
        $role = Role::firstOrCreate(['key' => 'pw_only'], ['name' => 'PW Only']);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'employees.reset_password'], ['allowed' => true]);
        $this->actingAs(User::factory()->create(['role' => 'pw_only']));
        $employee = $this->makeEmployeeWithAccount('EMP-7006', 'gate_user');

        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'sneaky'])->assertForbidden();
        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])->assertOk();
    }

    /**
     * Login names are English-only: they must start with a letter, end with a letter or digit,
     * and may use . _ - in between. Short shared names like "hr" stay valid.
     */
    public function test_username_format_is_enforced(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7008', 'format_user');

        foreach (['สมชาย', 'john doe', 'john@doe', '1john', '_john', 'john_', 'j', str_repeat('a', 31)] as $bad) {
            $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('username');
        }

        foreach (['hr', 'john.doe', 'john_do2', 'John-Doe'] as $good) {
            $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => $good])->assertOk();
        }
    }

    /**
     * Admin-set passwords follow the AD-style complexity policy: 8+ characters with mixed
     * case, a digit and a symbol — the same set the forms tick off in their live checklist.
     */
    public function test_password_policy_is_enforced(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7010', 'policy_pw');

        $rejected = [
            'Sec12!',          // too short
            'secret123!',      // no uppercase
            'SECRET123!',      // no lowercase
            'SecretPass!',     // no digit
            'SecretPass1',     // no symbol
        ];
        foreach ($rejected as $bad) {
            $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => 'SecretPass1!'])
            ->assertOk();

        // The same policy applies when the account is first created.
        $fresh = Employee::create(['code' => 'EMP-7011', 'first_name' => 'Weak', 'last_name' => 'Pass']);
        $this->postJson("/api/employees/{$fresh->id}/credentials", [
            'username' => 'weak_pw',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_create_credentials_rejects_a_non_english_username(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['code' => 'EMP-7009', 'first_name' => 'Thai', 'last_name' => 'Name']);

        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'สมชาย',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertStatus(422)->assertJsonValidationErrors('username');

        $this->assertFalse($employee->fresh()->user()->exists());
    }

    public function test_create_credentials_accepts_force_change(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['code' => 'EMP-7007', 'first_name' => 'New', 'last_name' => 'Account']);

        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'fresh_user',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
            'force_change' => true,
        ])->assertCreated();

        $user = $employee->fresh()->user;
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertNull($user->password_changed_at);
    }
}
