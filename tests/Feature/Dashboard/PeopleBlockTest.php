<?php

namespace Tests\Feature\Dashboard;

use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Services\Dashboard\PeopleBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Staff per department and the activity feed. */
class PeopleBlockTest extends TestCase
{
    use RefreshDatabase;

    public function test_headcount_by_department_keeps_staff_without_one_as_their_own_count(): void
    {
        $it = Department::create(['code' => 'DEP-9001', 'tag' => 'IT9', 'name' => 'Information Technology', 'name_th' => 'ไอที']);
        Department::create(['code' => 'DEP-9002', 'tag' => 'EM9', 'name' => 'Empty']);
        Employee::create(['first_name' => 'A', 'status' => 'active', 'department_id' => $it->id]);
        Employee::create(['first_name' => 'B', 'status' => 'active']);
        Employee::create(['first_name' => 'C', 'status' => 'resigned', 'department_id' => $it->id]);

        $hr = app(PeopleBlock::class)->headcount();

        // Departments with nobody active are left out rather than drawn as empty bars.
        $this->assertSame([['id' => $it->id, 'name' => 'Information Technology', 'name_th' => 'ไอที', 'count' => 1]], $hr['by_department']);
        $this->assertSame(1, $hr['no_department']);
        $this->assertSame(2, $hr['headcount']);
    }

    public function test_activity_lists_the_six_latest_and_counts_today(): void
    {
        $this->freezeTime();
        foreach (range(1, 7) as $i) {
            AuditLog::record("Action {$i}", "Target {$i}");
        }
        AuditLog::query()->orderBy('id')->first()->forceFill(['created_at' => now()->subDay()])->save();

        $feed = app(PeopleBlock::class)->activity();

        $this->assertCount(6, $feed['items']);
        $this->assertSame('Action 7', $feed['items'][0]['action']);
        $this->assertSame('Target 7', $feed['items'][0]['target']);
        $this->assertSame(6, $feed['today_count']);
    }
}
