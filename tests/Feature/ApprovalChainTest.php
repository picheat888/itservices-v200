<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalChainTest extends TestCase
{
    use RefreshDatabase;

    public function test_position_stores_a_level(): void
    {
        $p = Position::create(['title' => 'Manager', 'level' => 3]);

        $this->assertSame(3, $p->fresh()->level);
    }

    public function test_manager_and_subordinate_relations(): void
    {
        $boss = Employee::create(['name' => 'Boss']);
        $staff = Employee::create(['name' => 'Staff', 'manager_id' => $boss->id]);

        $this->assertSame($boss->id, $staff->manager->id);
        $this->assertTrue($boss->subordinates->contains($staff));
        $this->assertTrue($boss->isAncestorOf($staff->fresh()));
        $this->assertFalse($staff->isAncestorOf($boss->fresh()));
    }
}
