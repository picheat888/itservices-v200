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

    /**
     * The request-workflow bells this account received, by subtype.
     *
     * @return list<string>
     */
    private function requestBells(User $user): array
    {
        return $user->notifications()->get()
            ->map(fn ($n) => (string) ($n->data['subtype'] ?? ''))
            ->filter()->values()->all();
    }

    /**
     * Takes the request through approval, then has an IT staff take and close its
     * ticket the way the Tickets screen does.
     *
     * @return array{0: ServiceRequest, 1: User}
     */
    private function approveAndAssignTicket(): array
    {
        $request = $this->submitComputer();
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $request->refresh();

        $itEmployee = Employee::create(['first_name' => 'Tech']);
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'IT', 'color' => '#0284c7', 'is_system' => false]);
        foreach (['tickets.resolve', 'tickets.level_hardware'] as $permission) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }
        $tech = User::factory()->create(['role' => 'admin', 'employee_id' => $itEmployee->id]);

        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/take", ['priority' => 'medium'])->assertOk();

        return [$request, $tech];
    }

    public function test_closing_the_ticket_fulfils_the_request_it_came_from(): void
    {
        [$request, $tech] = $this->approveAndAssignTicket();

        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/resolve", [
            'mode' => 'complete',
            'resolution' => 'Desktop delivered and set up at the desk.',
        ])->assertOk();

        // Closing the case IS the delivery — nobody has to go and press Fulfil after it.
        $request->refresh();
        $this->assertSame(RequestStatus::Fulfilled, $request->status);
        $this->assertNotNull($request->fulfilled_at);

        // The technician's own words, on the step that was waiting for the work.
        $queueRow = $request->approvals()->where('kind', 'fulfillment')->firstOrFail();
        $this->assertSame('Desktop delivered and set up at the desk.', $queueRow->note);
        $this->assertSame($tech->id, $queueRow->acted_by_user_id);

        // …and the requester hears about it, exactly as pressing Fulfil would have told
        // them. Closing from the ticket must not become the quiet way to finish a request.
        $bells = $this->requestBells($this->requester);
        $this->assertSame('fulfilled', end($bells));
    }

    public function test_cancelling_the_ticket_cancels_the_request_rather_than_rejecting_it(): void
    {
        [$request, $tech] = $this->approveAndAssignTicket();

        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/resolve", [
            'mode' => 'cancel',
            'resolution' => 'Model discontinued; the requester will pick another one.',
        ])->assertOk();

        // NOT Rejected: every approver said yes, and only then could IT not deliver.
        // Counting it as a rejection would misreport the approval chain.
        $request->refresh();
        $this->assertSame(RequestStatus::Cancelled, $request->status);
        $this->assertNotNull($request->cancelled_at);

        // Same reason on both sides, which is what makes the pair checkable later.
        $this->assertSame(
            $request->ticket->resolution,
            $request->approvals()->where('kind', 'fulfillment')->value('note'),
        );

        // The requester has to be told their approved request is not coming. The
        // fulfilment row is an IT-queue step with no person on it, so the approver-facing
        // cancellation notice reached nobody and this closed in silence.
        $bells = $this->requestBells($this->requester);
        $this->assertSame('cancelled', end($bells));

        // Carrying IT's reason, so the bell answers "why" without opening anything.
        $notice = $this->requester->notifications()->get()
            ->last(fn ($n) => ($n->data['subtype'] ?? null) === 'cancelled');
        $this->assertStringContainsString('Model discontinued', (string) $notice?->data['remark']);
    }

    public function test_a_ticket_that_belongs_to_no_request_settles_nothing(): void
    {
        [$request, $tech] = $this->approveAndAssignTicket();
        // Unlink it, as a ticket opened straight from the Tickets screen would be.
        $ticketId = $request->ticket_id;
        $request->update(['ticket_id' => null]);

        $this->actingAs($tech)->postJson("/api/tickets/{$ticketId}/resolve", [
            'mode' => 'complete',
            'resolution' => 'Handled outside of any request.',
        ]);

        $this->assertSame(RequestStatus::Approved, $request->refresh()->status);
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
