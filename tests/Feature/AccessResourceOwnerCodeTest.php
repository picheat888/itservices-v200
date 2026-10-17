<?php

// Email-group and file-share list rows carry the owner's employee code for client search.

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessResourceOwnerCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_registry_rows_carry_the_owner_code(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $dept = Department::create(['name' => 'Accounting', 'tag' => 'ACC']);
        $owner = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J', 'code' => 'EMP-0042']);
        EmailGroup::create(['name' => 'Acc team', 'email' => 'acc@x.co', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id]);
        FileShare::create(['name' => 'Acc share', 'path' => '\srv\acc', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id]);

        foreach (['/api/email-groups', '/api/file-shares'] as $url) {
            $this->assertSame('EMP-0042', $this->getJson($url)->assertOk()->json('data.0.owner_code'));
        }
    }
}
