<?php

// Department / position / section "members" endpoints: query count must not grow with the row count.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EmployeeMembersQueryCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_members_query_count_does_not_grow_with_rows(): void
    {
        $viewer = User::factory()->create(['role' => 'super']);
        $department = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $position = Position::create(['title' => 'Engineer']);
        $section = Section::create(['name' => 'Support', 'department_id' => $department->id]);

        $add = function (int $from, int $to) use ($department, $position, $section): void {
            foreach (range($from, $to) as $i) {
                $e = Employee::create([
                    'code' => "9100{$i}", 'first_name' => "M{$i}", 'last_name' => 'Test', 'status' => 'active',
                    'department_id' => $department->id, 'position_id' => $position->id, 'section_id' => $section->id,
                ]);
                User::factory()->create(['role' => 'user', 'employee_id' => $e->id]);
            }
        };
        $count = function (string $url) use ($viewer): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($viewer)->getJson($url)->assertOk();

            return count(DB::getQueryLog());
        };
        $urls = [
            "/api/departments/{$department->id}/members",
            "/api/positions/{$position->id}/members",
            "/api/sections/{$section->id}/members",
        ];

        $add(1, 3);
        $few = [];
        foreach ($urls as $url) {
            $count($url); // warm the per-request caches
            $few[$url] = $count($url);
        }
        $add(4, 6);

        foreach ($urls as $url) {
            $this->assertSame($few[$url], $count($url), $url);
        }
    }
}
