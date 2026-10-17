<?php

// Access registry lists carry the Thai twins (department_th, owner_th) next to the English names.

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_registry_rows_carry_department_and_owner_thai_twins(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $dept = Department::create(['name' => 'Accounting', 'name_th' => 'บัญชี', 'tag' => 'ACC']);
        $owner = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        EmailGroup::create(['name' => 'Acc team', 'email' => 'acc@x.co', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id]);
        FileShare::create(['name' => 'Acc share', 'path' => '\\srv\acc', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id]);

        foreach (['/api/email-groups', '/api/file-shares'] as $url) {
            $row = $this->getJson($url)->assertOk()->json('data.0');
            $this->assertSame('บัญชี', $row['department_th']);
            $this->assertSame('สมชาย ใจดี', $row['owner_th']);
        }
    }

    public function test_twins_are_null_without_thai_names(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $dept = Department::create(['name' => 'Accounting', 'tag' => 'ACC']);
        $owner = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J']);
        EmailGroup::create(['name' => 'Acc team', 'email' => 'acc@x.co', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id]);

        $row = $this->getJson('/api/email-groups')->assertOk()->json('data.0');

        $this->assertNull($row['department_th']);
        $this->assertNull($row['owner_th']);
    }
}
