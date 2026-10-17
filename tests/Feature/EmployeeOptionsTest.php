<?php

// The lightweight employee picker list and the query budget of the full employee list.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EmployeeOptionsTest extends TestCase
{
    use RefreshDatabase;

    private function picker(): User
    {
        $role = Role::create(['key' => 'picker_'.uniqid(), 'name' => 'Picker', 'is_system' => false]);

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_options_expose_only_picker_fields_to_any_signed_in_user(): void
    {
        $dept = Department::create(['name' => 'Finance', 'name_th' => 'การเงิน', 'tag' => 'FIN']);
        $pos = Position::create(['title' => 'Analyst']);
        Employee::create([
            'code' => '680001', 'first_name' => 'Somchai', 'last_name' => 'Jaidee',
            'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'email' => 'somchai@abcd.co.th',
            'phone' => '0811111111', 'department_id' => $dept->id, 'position_id' => $pos->id, 'status' => 'active',
        ]);

        $row = $this->actingAs($this->picker())->getJson('/api/employees/options')->assertOk()->json('data.0');

        $this->assertEqualsCanonicalizing(
            ['id', 'code', 'name', 'name_th', 'photo_url', 'department_id', 'department', 'department_th', 'position', 'status'],
            array_keys($row),
        );
        $this->assertSame('Somchai Jaidee', $row['name']);
        $this->assertSame('สมชาย ใจดี', $row['name_th']);
        $this->assertSame('Finance', $row['department']);
        $this->assertSame('Analyst', $row['position']);
    }

    public function test_options_keep_the_directory_order_and_resigned_staff(): void
    {
        Employee::create(['code' => '680001', 'first_name' => 'Old', 'last_name' => 'Gone', 'status' => 'resigned']);
        Employee::create(['code' => '520001', 'first_name' => 'Older', 'last_name' => 'Active', 'status' => 'active']);
        Employee::create(['code' => '680002', 'first_name' => 'Newer', 'last_name' => 'Active', 'status' => 'active']);

        $codes = collect($this->actingAs($this->picker())->getJson('/api/employees/options')->assertOk()->json('data'))->pluck('code')->all();

        $this->assertSame(['680002', '520001', '680001'], $codes);
    }

    public function test_options_search_matches_thai_and_english_words_in_any_order(): void
    {
        Employee::create(['code' => '680001', 'first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'status' => 'active']);
        Employee::create(['code' => '680002', 'first_name' => 'Somying', 'last_name' => 'Jaidee', 'status' => 'active']);
        $user = $this->picker();

        $find = fn (string $q) => collect($this->actingAs($user)->getJson('/api/employees/options?'.http_build_query(['search' => $q]))->assertOk()->json('data'))->pluck('code')->all();

        $this->assertSame(['680001'], $find('ใจดี สมชาย'));
        $this->assertSame(['680001'], $find('jaidee somchai'));
        $this->assertEqualsCanonicalizing(['680001', '680002'], $find('Jaidee'));
    }

    public function test_full_list_query_count_does_not_grow_with_the_row_count(): void
    {
        $viewer = User::factory()->create(['role' => 'super']);
        $count = function () use ($viewer): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($viewer)->getJson('/api/employees?page=1&per_page=100')->assertOk();

            return count(DB::getQueryLog());
        };
        foreach (range(1, 3) as $i) {
            $e = Employee::create(['code' => "70000{$i}", 'first_name' => "A{$i}", 'last_name' => 'Test', 'status' => 'active']);
            User::factory()->create(['role' => 'super', 'employee_id' => $e->id]);
        }
        $count(); // warm the per-request caches
        $few = $count();
        foreach (range(4, 12) as $i) {
            $e = Employee::create(['code' => "70000{$i}", 'first_name' => "A{$i}", 'last_name' => 'Test', 'status' => 'active']);
            User::factory()->create(['role' => 'super', 'employee_id' => $e->id]);
        }

        $this->assertSame($few, $count());
    }

    public function test_directory_page_filters_and_orders_on_the_server(): void
    {
        $admin = User::factory()->create(['role' => 'super']);
        $it = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $hr = Department::create(['name' => 'HR', 'tag' => 'HR']);
        Employee::create(['code' => '680001', 'first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned', 'department_id' => $it->id]);
        Employee::create(['code' => '520001', 'first_name' => 'Old', 'last_name' => 'Timer', 'first_name_th' => 'สมชาย', 'status' => 'active', 'department_id' => $it->id]);
        Employee::create(['code' => '680002', 'first_name' => 'New', 'last_name' => 'Hire', 'status' => 'active', 'department_id' => $hr->id]);
        $withLogin = Employee::create(['code' => '680003', 'first_name' => 'Has', 'last_name' => 'Login', 'status' => 'active', 'department_id' => $it->id]);
        User::factory()->create(['role' => 'super', 'employee_id' => $withLogin->id]);

        $page = fn (array $q) => $this->actingAs($admin)->getJson('/api/employees?'.http_build_query(['page' => 1, 'per_page' => 10, ...$q]))->assertOk();
        $codes = fn (array $q) => $page($q)->json('data.*.code');

        // No-account staff first, then those with a login, resigned last; newest code first within a group.
        $this->assertSame(['680002', '520001', '680003', '680001'], $codes([]));
        $this->assertSame(['520001', '680003', '680001'], $codes(['department_id' => $it->id]));
        $this->assertSame(['680002', '520001'], $codes(['status' => 'no_account']));
        $this->assertSame(['680003'], $codes(['status' => 'has_account']));
        $this->assertSame(['680001'], $codes(['status' => 'resigned']));
        $this->assertSame(['520001'], $codes(['search' => 'สมชาย']));
        $this->assertSame(4, $page([])->json('meta.total'));
        $this->assertSame(2, $page(['per_page' => 10, 'status' => 'no_account'])->json('meta.total'));
    }
}
