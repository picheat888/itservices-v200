<?php

namespace Tests\Feature;

use App\Enums\Request\RequestStatus;
use App\Enums\Ticket\TicketCategory;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Ticket\TicketService;
use Database\Seeders\PositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * The Auto Ticket bridge: final approval opens a linked IT ticket (per the
 * workflow's submit-time snapshot), and a ticket failure rolls the whole
 * approval back instead of leaving a half-approved request.
 */
class RequestAutoTicketTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;

    private User $bossUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        // The boss holds the Supervisor rung the Computer route asks for first; the
        // Manager rung above finds nobody and is skipped, which is enough to approve.
        $boss = Employee::create([
            'first_name' => 'Boss',
            'position_id' => Position::where('title', 'Supervisor')->firstOrFail()->id,
        ]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $boss->id]);

        $role = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'requests.submit'], ['allowed' => true]);
        $this->requester = User::factory()->create(['role' => 'user', 'employee_id' => $staff->id]);
        $this->bossUser = User::factory()->create(['role' => 'user', 'employee_id' => $boss->id]);
    }

    /**
     * The seeded "Desktop PC" choice. The computer form's device list is managed
     * data (Settings → Request data), so the payload carries an option id.
     */
    private function deviceOptionId(): int
    {
        return (int) RequestOption::where('request_type', 'computer')
            ->where('label_en', 'Desktop PC')->value('id');
    }

    private function submitComputer(): ServiceRequest
    {
        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'Replacement desktop for finance',
            'reason' => 'The old machine no longer boots after the last power outage.',
            'priority' => 'high',
            'fields' => ['device_id' => $this->deviceOptionId(), 'qty' => 1],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_final_approval_opens_a_linked_hardware_ticket(): void
    {
        $request = $this->submitComputer();

        // Boss covers both chain steps (merged) — one approval finishes the chain.
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $request->refresh();
        $this->assertSame(RequestStatus::Approved, $request->status);
        $this->assertNotNull($request->ticket_id);

        $ticket = $request->ticket;
        $this->assertSame(TicketCategory::Hardware, $ticket->category);
        $this->assertStringContainsString($request->reference, $ticket->subject);
        $this->assertSame($request->employee_id, $ticket->requester_id);
        $this->assertStringContainsString('Device type: Desktop PC', $ticket->description);
    }

    public function test_no_ticket_when_the_snapshot_flag_is_off(): void
    {
        Workflow::where('request_type', 'computer')->firstOrFail()->update(['auto_ticket' => false]);
        $request = $this->submitComputer();

        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $request->refresh();
        $this->assertSame(RequestStatus::Approved, $request->status);
        $this->assertNull($request->ticket_id);
    }

    public function test_a_ticket_failure_rolls_the_whole_approval_back(): void
    {
        $request = $this->submitComputer();

        $this->mock(TicketService::class)
            ->shouldReceive('create')
            ->andThrow(new RuntimeException('ticket store offline'));

        $this->actingAs($this->bossUser)
            ->postJson("/api/service-requests/{$request->id}/approve")
            ->assertStatus(500);

        $request->refresh();
        $this->assertSame(RequestStatus::Pending, $request->status);
        $this->assertNull($request->ticket_id);
        // The step is still current, so the approver simply retries.
        $this->assertNotNull($request->currentApproval());
    }
}
