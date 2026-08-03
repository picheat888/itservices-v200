<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Models\Workflow\Workflow;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Workflows admin surface: gated by workflows.manage, replaces steps with
 * shape validation, and previews a step list along a real reporting line.
 */
class WorkflowAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(WorkflowSeeder::class);

        $role = Role::firstOrCreate(['key' => 'wfadmin', 'name' => 'WF Admin', 'color' => '#000', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'workflows.manage'], ['allowed' => true]);
        $this->admin = User::factory()->create(['role' => 'wfadmin']);
    }

    public function test_endpoints_require_the_manage_permission(): void
    {
        $plain = User::factory()->create(['role' => 'nobody']);
        $workflow = Workflow::firstOrFail();

        $this->actingAs($plain)->getJson('/api/workflows')->assertForbidden();
        $this->actingAs($plain)->putJson("/api/workflows/{$workflow->id}", [])->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/workflows')
            ->assertOk()->assertJsonCount(11, 'data');
    }

    public function test_update_replaces_steps_and_validates_the_shape(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();

        // No approval step at all.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'fulfillment', 'sla_days' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // Fulfillment not last.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                ['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'fulfillment', 'sla_days' => 1],
                ['actor_type' => 'chain', 'label' => 'Boss', 'kind' => 'approval', 'sla_days' => 1],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // Owner step on a type whose resources carry no owner.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [['actor_type' => 'owner', 'label' => 'Owner', 'kind' => 'approval', 'sla_days' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // A valid replacement persists in order with renumbered positions.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'name' => 'Hardware Request',
            'active' => true,
            'auto_ticket' => false,
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Team Lead', 'kind' => 'approval', 'sla_days' => 0.5],
                ['actor_type' => 'chain', 'label' => 'Director', 'kind' => 'approval', 'sla_days' => 2],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment', 'sla_days' => 1],
            ],
        ])->assertOk()
            ->assertJsonPath('data.name', 'Hardware Request')
            ->assertJsonPath('data.auto_ticket', false)
            ->assertJsonPath('data.steps.0.label', 'Team Lead')
            ->assertJsonPath('data.steps.2.kind', 'fulfillment');

        $this->assertSame([1, 2, 3], $workflow->fresh()->steps->pluck('position')->all());
    }

    public function test_preview_resolves_steps_along_the_reporting_line(): void
    {
        $vp = Employee::create(['first_name' => 'Vp']);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $vp->id]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id]);
        foreach ([$vp, $sup] as $e) {
            User::factory()->create(['role' => 'nobody', 'employee_id' => $e->id]);
        }

        $response = $this->actingAs($this->admin)->postJson('/api/workflows/preview', [
            'request_type' => 'computer',
            'employee_id' => $staff->id,
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'sla_days' => 1],
                ['actor_type' => 'chain', 'label' => 'Manager', 'kind' => 'approval', 'sla_days' => 1],
                ['actor_type' => 'chain', 'label' => 'VP', 'kind' => 'approval', 'sla_days' => 1],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment', 'sla_days' => 1],
            ],
        ])->assertOk();

        $rows = $response->json('data.rows');
        // Two managers cover three chain steps: Sup, then Vp merged over Manager+VP.
        $this->assertCount(3, $rows);
        $this->assertSame('Sup', $rows[0]['approver_name']);
        $this->assertSame('Vp', $rows[1]['approver_name']);
        $this->assertSame('Manager · VP', $rows[1]['label']);
        $this->assertSame('it_staff', $rows[2]['actor_type']);
        $this->assertSame('Staff', $response->json('data.employee.name'));
    }
}
