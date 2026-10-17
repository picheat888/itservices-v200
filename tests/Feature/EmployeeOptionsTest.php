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
            $this->actingAs($viewer)->getJson('/api/employees')->assertOk();

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
}
