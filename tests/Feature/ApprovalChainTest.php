<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use App\Services\ApprovalChainService;
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

    private function positionAt(int $level): Position
    {
        return Position::create(['title' => "L{$level}", 'level' => $level]);
    }

    public function test_chain_is_empty_when_no_manager(): void
    {
        $solo = Employee::create(['name' => 'Solo', 'position_id' => $this->positionAt(1)->id]);

        $this->assertCount(0, app(ApprovalChainService::class)->chainFor($solo));
    }

    public function test_chain_climbs_every_manager_to_the_root(): void
    {
        $vp = Employee::create(['name' => 'VP']);
        $mgr = Employee::create(['name' => 'Manager', 'manager_id' => $vp->id]);
        $sup = Employee::create(['name' => 'Supervisor', 'manager_id' => $mgr->id]);
        $leader = Employee::create(['name' => 'Leader', 'manager_id' => $sup->id]);
        $staff = Employee::create(['name' => 'Staff', 'manager_id' => $leader->id]);

        $chain = app(ApprovalChainService::class)->chainFor($staff);

        $this->assertSame(['Leader', 'Supervisor', 'Manager', 'VP'], $chain->pluck('name')->all());
    }

    public function test_chain_terminates_on_a_cycle(): void
    {
        $a = Employee::create(['name' => 'A']);
        $b = Employee::create(['name' => 'B', 'manager_id' => $a->id]);
        $a->update(['manager_id' => $b->id]); // A <-> B loop

        $chain = app(ApprovalChainService::class)->chainFor($a);

        // Climbs B then A(self repeat) -> stops; never infinite-loops.
        $this->assertSame(['B'], $chain->pluck('name')->all());
    }

    public function test_endpoint_returns_the_chain_ordered(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $vp = Employee::create(['name' => 'VP', 'position_id' => $this->positionAt(4)->id]);
        $mgr = Employee::create(['name' => 'Mgr', 'position_id' => $this->positionAt(3)->id, 'manager_id' => $vp->id]);
        $staff = Employee::create(['name' => 'Staff', 'position_id' => $this->positionAt(1)->id, 'manager_id' => $mgr->id]);

        $this->getJson("/api/employees/{$staff->id}/approval-chain")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Mgr')
            ->assertJsonPath('data.0.photo_url', null)
            ->assertJsonPath('data.1.name', 'VP');
    }

    public function test_endpoint_requires_authentication(): void
    {
        $staff = Employee::create(['name' => 'Staff']);
        $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertUnauthorized();
    }

    public function test_endpoint_requires_employees_view_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $staff = Employee::create(['name' => 'Staff']);
        $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertForbidden();
    }

    public function test_position_level_accepts_14_and_rejects_15(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/positions', ['title' => 'Vice President', 'level' => 14])
            ->assertStatus(201);

        $this->postJson('/api/positions', ['title' => 'Too High', 'level' => 15])
            ->assertStatus(422)
            ->assertJsonValidationErrors('level');
    }
}
