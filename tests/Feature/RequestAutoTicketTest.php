<?php

namespace Tests\Feature;

use App\Enums\Request\RequestStatus;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Request\RequestService;
use App\Services\Ticket\TicketService;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
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
        $this->seed(EmployeePositionSeeder::class);
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
        // One fact per line, and the typed fields among them: a case that says only
        // "Computer" sends the technician back to the request to find out which machine.
        $this->assertSame([
            'Auto-opened',
            '-----',
            "Service request {$request->reference} (Approved).",
            'Type: Computer',
            'Requester: Staff',
            // Only device_id: `qty` is not in the computer schema, so submit dropped it.
            'Device type: Desktop PC',
            '',
            'Reason:',
            $request->reason,
        ], explode("\n", $ticket->description));
        // Priority is not in here: requests stopped carrying one, and the case gets its
        // own when a technician takes it.
        $this->assertStringNotContainsString('Priority:', $ticket->description);
        // Nothing marks a new hire here, because this is an ordinary request.
        $this->assertStringNotContainsString('New employee', $ticket->subject);
        $this->assertStringNotContainsString('New employee', $ticket->description);
    }

    /**
     * A case opened for somebody who does not work here yet needs saying so on the two
     * lines a technician actually reads: the subject in their queue, and the first line of
     * the body. Nothing else on a ticket carries the request's origin — there is no field
     * for it, so it has to be in the words.
     */
    public function test_a_case_opened_for_a_new_hire_says_so_in_the_subject_and_the_body(): void
    {
        $newHire = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Jaidee', 'manager_id' => $this->bossUser->employee_id]);

        $request = app(RequestService::class)->submitFor($newHire, $this->requester, [
            'type' => 'computer',
            'reason' => 'Starting on the production line and needs a workstation from day one.',
            'fields' => ['device_id' => $this->deviceOptionId()],
        ]);

        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $ticket = $request->fresh()->ticket;
        $this->assertNotNull($ticket);
        $this->assertSame("[{$request->reference}] Computer for Somchai Jaidee (New employee)", $ticket->subject);
        $this->assertSame('Auto-opened (New employee)', explode("\n", $ticket->description)[0]);
    }

    /**
     * The request-workflow bells this account received, by subtype.
     *
     * Unordered on purpose. The final approval and the settlement land in the same
     * second, and `notifications()` orders by created_at alone, so which of the two
     * comes back last is arbitrary — asserting on position made this flaky. What the
     * tests below need is that the bell was raised at all.
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

        // No priority: a case opened from an approved request is judged on what was asked
        // for, and the endpoint refuses one outright rather than quietly ignoring it.
        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/take", [])->assertOk();

        return [$request, $tech];
    }

    /**
     * A case opened from a request is a snapshot of what was approved — the subject
     * carries the reference, the body carries the typed fields somebody signed for.
     * Letting the requester rewrite it turns the approval into a record of something
     * that was never agreed, so the edit is refused however Open the case still is.
     *
     * The permission is granted here on purpose: without it the request would be
     * refused for being unpermitted, and the rule under test would go unexercised.
     */
    public function test_the_requester_cannot_rewrite_the_case_their_request_opened(): void
    {
        $request = $this->submitComputer();
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        RolePermission::updateOrCreate(
            ['role_id' => $this->requester->role_id, 'permission' => 'tickets.edit_own'],
            ['allowed' => true],
        );

        $ticket = $request->refresh()->ticket;
        $this->assertSame(TicketStatus::Open, $ticket->status, 'still the one state an edit is ever allowed in');
        $this->assertSame($this->requester->employee_id, $ticket->requester_id, 'and it is their own case');

        $this->actingAs($this->requester)->putJson("/api/tickets/{$ticket->id}", [
            'subject' => 'Actually I want a laptop instead',
            'description' => 'Changed my mind after the approval went through.',
            'category' => 'hardware',
            'callback_phone' => '1234',
        ])->assertForbidden();

        $this->assertStringContainsString($request->reference, $ticket->refresh()->subject);
    }

    /** A case nobody's request opened is still the requester's to correct. */
    public function test_an_ordinary_case_is_still_editable_by_the_person_who_opened_it(): void
    {
        RolePermission::updateOrCreate(
            ['role_id' => $this->requester->role_id, 'permission' => 'tickets.edit_own'],
            ['allowed' => true],
        );
        RolePermission::updateOrCreate(
            ['role_id' => $this->requester->role_id, 'permission' => 'tickets.create'],
            ['allowed' => true],
        );

        $ticket = app(TicketService::class)->create([
            'subject' => 'Printer jams on tray 2',
            'description' => 'It jams every third page since this morning.',
            'category' => 'hardware',
        ], $this->requester->employee);

        $this->actingAs($this->requester)->putJson("/api/tickets/{$ticket->id}", [
            'subject' => 'Printer jams on tray 2 and tray 3',
            'description' => 'It jams every third page since this morning, both trays.',
            'category' => 'hardware',
            'callback_phone' => '1234',
        ])->assertOk();
    }

    public function test_closing_the_ticket_completes_the_request_it_came_from(): void
    {
        [$request, $tech] = $this->approveAndAssignTicket();

        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/resolve", [
            'mode' => 'complete',
            'resolution' => 'Desktop delivered and set up at the desk.',
        ])->assertOk();

        // Closing the case IS the delivery — nobody has to go and press Complete after it.
        $request->refresh();
        $this->assertSame(RequestStatus::Completed, $request->status);
        $this->assertNotNull($request->completed_at);

        // The technician's own words, on the step that was waiting for the work.
        $queueRow = $request->approvals()->where('kind', 'completion')->firstOrFail();
        $this->assertSame('Desktop delivered and set up at the desk.', $queueRow->note);
        $this->assertSame($tech->id, $queueRow->acted_by_user_id);

        // …and the requester hears about it, exactly as pressing Complete would have told
        // them. Closing from the ticket must not become the quiet way to finish a request.
        $this->assertContains('completed', $this->requestBells($this->requester));
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
            $request->approvals()->where('kind', 'completion')->value('note'),
        );

        // The requester has to be told their approved request is not coming. The
        // completion row is an IT-queue step with no person on it, so the approver-facing
        // cancellation notice reached nobody and this closed in silence.
        $this->assertContains('cancelled', $this->requestBells($this->requester));

        // Carrying IT's reason, so the bell answers "why" without opening anything.
        $notice = $this->requester->notifications()->get()
            ->last(fn ($n) => ($n->data['subtype'] ?? null) === 'cancelled');
        $this->assertStringContainsString('Model discontinued', (string) $notice?->data['remark']);
    }

    /**
     * The mail that goes with that bell has to say more than "it is cancelled": who
     * cancelled it, when, why, and what the request was — the same shape as the reject
     * and complete mails, since the reader has no other copy of any of it.
     */
    public function test_the_cancellation_mail_carries_the_reason_the_case_and_the_approvals(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        [$request, $tech] = $this->approveAndAssignTicket();
        Bus::fake();

        $this->actingAs($tech)->postJson("/api/tickets/{$request->ticket_id}/resolve", [
            'mode' => 'cancel',
            'resolution' => 'Model discontinued; the requester will pick another one.',
        ])->assertOk();

        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->jobProp($queued, 'templateKey') === 'request.not_delivered');
        $this->assertNotNull($job, 'The requester was told nothing by mail.');

        $html = $this->jobProp($job, 'html');
        $this->assertStringContainsString('Model discontinued', $html);
        $this->assertStringContainsString($tech->name, $html, 'the mail does not say who cancelled it');
        $this->assertStringContainsString(now()->format('d-m-Y'), $html, 'the mail does not say when');
        $this->assertStringContainsString($request->reference, $html);
        $this->assertStringContainsString((string) $request->ticket->ticket_no, $html);
        // It cleared every step before IT stopped it, and the table is what shows that.
        $this->assertStringContainsString('Already approved', $html);
        // Every variable in the body has to be one emailUser() actually sends.
        $this->assertStringNotContainsString('{{', $html);
        $this->assertSame(
            preg_match_all('/<p(\s[^>]*)?>/i', $html),
            substr_count(strtolower($html), '</p>'),
            'the message ends with a paragraph still open',
        );
    }

    /** Read a queued mail job's private field, the way the other mail tests do. */
    private function jobProp(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
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

    /**
     * An IT account holding the completion queue's own permission. Kept on its own
     * role so it is not the technician from approveAndAssignTicket() — the point of
     * these tests is what the manual button does, not what the case's owner can do.
     */
    private function completer(): User
    {
        $role = Role::firstOrCreate(['key' => 'it_lead'], ['name' => 'IT Lead', 'color' => '#7c3aed', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'requests.complete'], ['allowed' => true]);

        return User::factory()->create([
            'role' => 'it_lead',
            'employee_id' => Employee::create(['first_name' => 'Lead'])->id,
        ]);
    }

    public function test_complete_is_refused_while_the_linked_case_is_still_in_progress(): void
    {
        [$request] = $this->approveAndAssignTicket();
        $lead = $this->completer();

        $this->actingAs($lead)->postJson("/api/service-requests/{$request->id}/complete")->assertStatus(422);

        // Refused, and still in the queue the closing case will settle: the technician
        // is mid-delivery, so finishing the request here would close it behind their
        // back and leave the case open — settleFromTicket's mismatch, mirrored.
        $request->refresh();
        $this->assertSame(RequestStatus::Approved, $request->status);
        $this->assertNull($request->completed_at);

        // And the button is gone rather than sitting there to return this 422.
        $this->actingAs($lead)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.can_complete', false);
    }

    public function test_complete_is_refused_while_the_linked_case_waits_to_be_picked_up(): void
    {
        $request = $this->submitComputer();
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        // Nobody has taken it: the delivery has not started, let alone finished.
        $this->assertSame(TicketStatus::Open, $request->refresh()->ticket->status);

        $this->actingAs($this->completer())->postJson("/api/service-requests/{$request->id}/complete")->assertStatus(422);

        $this->assertSame(RequestStatus::Approved, $request->refresh()->status);
    }

    public function test_complete_still_closes_a_request_whose_case_was_closed_before_this_rule(): void
    {
        [$request] = $this->approveAndAssignTicket();
        // The shape rows from before settleFromTicket are left in: the case was closed,
        // but nothing carried the request along with it. Refusing on "has a case" rather
        // than on the case's state would strand every one of them for good.
        $request->ticket->update(['status' => TicketStatus::Completed->value]);

        $this->actingAs($this->completer())->postJson("/api/service-requests/{$request->id}/complete")->assertOk();

        $this->assertSame(RequestStatus::Completed, $request->refresh()->status);
    }

    public function test_complete_is_the_only_way_through_for_a_workflow_that_opens_no_case(): void
    {
        Workflow::where('request_type', 'computer')->firstOrFail()->update(['auto_ticket' => false]);
        $request = $this->submitComputer();
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        // With no case to close, the manual queue is the whole delivery record — this is
        // what the permission is still for after the rule above.
        $this->actingAs($this->completer())->postJson("/api/service-requests/{$request->id}/complete")->assertOk();

        $this->assertSame(RequestStatus::Completed, $request->refresh()->status);
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
