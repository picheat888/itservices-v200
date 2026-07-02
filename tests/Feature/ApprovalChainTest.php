<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\User;
use App\Services\Employee\ApprovalChainService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalChainTest extends TestCase
{
    use RefreshDatabase;

    public function test_position_stores_title_and_auto_code(): void
    {
        $p = Position::create(['title' => 'Manager']);

        $this->assertSame('Manager', $p->fresh()->title);
        $this->assertStringStartsWith('PST-', $p->fresh()->code);
    }

    public function test_manager_and_subordinate_relations(): void
    {
        $boss = Employee::create(['first_name' => 'Boss']);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $boss->id]);

        $this->assertSame($boss->id, $staff->manager->id);
        $this->assertTrue($boss->subordinates->contains($staff));
        $this->assertTrue($boss->isAncestorOf($staff->fresh()));
        $this->assertFalse($staff->isAncestorOf($boss->fresh()));
    }

    private function positionAt(int $n): Position
    {
        // Approval chains are built from manager_id, not position depth, so a flat
        // position per employee is enough here.
        return Position::create(['title' => "L{$n}"]);
    }

    public function test_chain_is_empty_when_no_manager(): void
    {
        $solo = Employee::create(['first_name' => 'Solo', 'position_id' => $this->positionAt(1)->id]);

        $this->assertCount(0, app(ApprovalChainService::class)->chainFor($solo));
    }

    public function test_chain_climbs_every_manager_to_the_root(): void
    {
        $vp = Employee::create(['first_name' => 'VP']);
        $mgr = Employee::create(['first_name' => 'Manager', 'manager_id' => $vp->id]);
        $sup = Employee::create(['first_name' => 'Supervisor', 'manager_id' => $mgr->id]);
        $leader = Employee::create(['first_name' => 'Leader', 'manager_id' => $sup->id]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $leader->id]);

        $chain = app(ApprovalChainService::class)->chainFor($staff);

        $this->assertSame(['Leader', 'Supervisor', 'Manager', 'VP'], $chain->pluck('name')->all());
    }

    public function test_chain_terminates_on_a_cycle(): void
    {
        $a = Employee::create(['first_name' => 'A']);
        $b = Employee::create(['first_name' => 'B', 'manager_id' => $a->id]);
        $a->update(['manager_id' => $b->id]); // A <-> B loop

        $chain = app(ApprovalChainService::class)->chainFor($a);

        // Climbs B then A(self repeat) -> stops; never infinite-loops.
        $this->assertSame(['B'], $chain->pluck('name')->all());
    }

    public function test_endpoint_returns_the_chain_ordered(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $vp = Employee::create(['first_name' => 'VP', 'position_id' => $this->positionAt(4)->id]);
        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $this->positionAt(3)->id, 'manager_id' => $vp->id]);
        $staff = Employee::create(['first_name' => 'Staff', 'position_id' => $this->positionAt(1)->id, 'manager_id' => $mgr->id]);

        $this->getJson("/api/employees/{$staff->id}/approval-chain")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Mgr')
            ->assertJsonPath('data.0.photo_url', null)
            ->assertJsonPath('data.1.name', 'VP');
    }

    public function test_endpoint_requires_authentication(): void
    {
        $staff = Employee::create(['first_name' => 'Staff']);
        $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertUnauthorized();
    }

    public function test_endpoint_requires_employees_view_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $staff = Employee::create(['first_name' => 'Staff']);
        $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertForbidden();
    }

    public function test_creating_a_position_via_api(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/positions', ['title' => 'QA Lead'])
            ->assertStatus(201)
            ->assertJsonPath('data.title', 'QA Lead');
    }
}
