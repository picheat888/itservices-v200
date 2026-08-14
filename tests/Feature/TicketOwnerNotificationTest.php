<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\TicketOwnerNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The case owner's feedback loop: a bell on every move of their case
 * (taken / assigned / forwarded / resolved / cancelled) and the templated
 * confirmation emails on create and successful close.
 */
class TicketOwnerNotificationTest extends TestCase
{
    use RefreshDatabase;

    /** A login account linked to a fresh employee (super bypasses gates). */
    private function userWithEmployee(string $role = 'super', string $name = 'Staff'): User
    {
        return User::factory()->create([
            'role' => $role,
            'employee_id' => Employee::create(['first_name' => $name, 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);
    }

    /** The requester's login account + a ticket they filed. */
    private function ownerAndTicket(array $overrides = []): array
    {
        $owner = User::factory()->create([
            'role' => 'user',
            'employee_id' => Employee::create([
                'first_name' => 'Owner', 'last_name' => 'Person', 'status' => 'active',
                'email' => 'owner@example.test',
            ])->id,
        ]);
        $ticket = Ticket::factory()->create(array_merge(['requester_id' => $owner->employee_id], $overrides));

        return [$owner, $ticket];
    }

    /**
     * Ensures an enabled email template with this key exists so sendTemplate() queues.
     *
     * updateOrCreate, not create: the standard catalog is inserted by migration now, so the
     * table already holds these keys before any test touches it.
     */
    private function template(string $key): void
    {
        EmailTemplate::updateOrCreate(
            ['key' => $key],
            [
                'name' => $key,
                'subject' => 'Ticket {{ticket.id}}',
                'body_html' => '<p>Hi {{user.first_name}} — {{reference.id}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
        );
    }

    /** Asserts the owner got exactly one ticket_owner bell with the given event. */
    private function assertOwnerBell(User $owner, string $event, ?string $by = null): void
    {
        Notification::assertSentTo($owner, TicketOwnerNotification::class, function ($n) use ($owner, $event, $by) {
            $data = $n->toDatabase($owner);

            return $data['event'] === $event && ($by === null || $data['by'] === $by);
        });
    }

    public function test_taking_a_case_bells_its_owner(): void
    {
        Notification::fake();
        [$owner, $ticket] = $this->ownerAndTicket();
        $staff = $this->userWithEmployee();

        $this->actingAs($staff)
            ->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'high'])
            ->assertOk();

        $this->assertOwnerBell($owner, 'taken', $staff->name);
    }

    public function test_assigning_a_case_bells_its_owner_and_emails_the_staff(): void
    {
        Notification::fake();
        Queue::fake();
        $this->template('ticket.assigned');
        [$owner, $ticket] = $this->ownerAndTicket();
        $staff = $this->userWithEmployee('super', 'Assignee');

        $this->actingAs($this->userWithEmployee('super', 'Dispatcher'))
            ->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $staff->id, 'priority' => 'medium'])
            ->assertOk();

        $this->assertOwnerBell($owner, 'taken', $staff->name);
        Queue::assertPushed(SendTemplatedEmail::class, fn ($job) => $job->toEmail === $staff->email && $job->templateKey === 'ticket.assigned');
    }

    public function test_forwarding_a_case_bells_its_owner_and_emails_the_receiver(): void
    {
        Notification::fake();
        Queue::fake();
        $this->template('ticket.forwarded');
        [$owner, $ticket] = $this->ownerAndTicket();
        $from = $this->userWithEmployee('super', 'From');
        $to = $this->userWithEmployee('super', 'Receiver');
        $ticket->update(['status' => 'in_progress', 'assignee_id' => $from->id, 'priority' => 'medium']);

        $this->actingAs($from)
            ->postJson("/api/tickets/{$ticket->id}/forward", ['assignee_id' => $to->id])
            ->assertOk();

        $this->assertOwnerBell($owner, 'forwarded', $to->name);
        Queue::assertPushed(SendTemplatedEmail::class, fn ($job) => $job->toEmail === $to->email && $job->templateKey === 'ticket.forwarded');
    }

    public function test_closing_a_case_bells_its_owner_and_emails_them(): void
    {
        Notification::fake();
        Queue::fake();
        $this->template('ticket.resolved');
        [$owner, $ticket] = $this->ownerAndTicket();
        $staff = $this->userWithEmployee();
        $ticket->update(['status' => 'in_progress', 'assignee_id' => $staff->id, 'priority' => 'medium']);

        $this->actingAs($staff)
            ->postJson("/api/tickets/{$ticket->id}/resolve", ['mode' => 'complete', 'resolution' => 'Replaced the faulty patch cable.'])
            ->assertOk();

        $this->assertOwnerBell($owner, 'resolved');
        Queue::assertPushed(SendTemplatedEmail::class, fn ($job) => $job->toEmail === $owner->email && $job->templateKey === 'ticket.resolved');
    }

    public function test_cancelling_a_case_bells_its_owner_without_the_resolved_email(): void
    {
        Notification::fake();
        Queue::fake();
        $this->template('ticket.resolved');
        [$owner, $ticket] = $this->ownerAndTicket();
        $staff = $this->userWithEmployee();
        $ticket->update(['status' => 'in_progress', 'assignee_id' => $staff->id, 'priority' => 'medium']);

        $this->actingAs($staff)
            ->postJson("/api/tickets/{$ticket->id}/resolve", ['mode' => 'cancel', 'resolution' => 'Duplicate of an existing case.'])
            ->assertOk();

        $this->assertOwnerBell($owner, 'cancelled');
        Queue::assertNotPushed(SendTemplatedEmail::class);
    }

    public function test_creating_a_ticket_emails_the_requester_a_confirmation(): void
    {
        Queue::fake();
        $this->template('ticket.created');
        $requester = $this->userWithEmployee('super', 'Requester');

        $this->actingAs($requester)->postJson('/api/tickets', [
            'subject' => 'Cannot connect to production VPN',
            'description' => 'VPN client fails to authenticate since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ])->assertCreated();

        Queue::assertPushed(SendTemplatedEmail::class, fn ($job) => $job->toEmail === $requester->email && $job->templateKey === 'ticket.created');
    }

    public function test_an_owner_without_a_login_account_breaks_nothing(): void
    {
        Notification::fake();
        // Factory requester is a bare employee with no user account and no email.
        $ticket = Ticket::factory()->create();
        $staff = $this->userWithEmployee();

        $this->actingAs($staff)
            ->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])
            ->assertOk();

        Notification::assertNotSentTo($staff, TicketOwnerNotification::class);
    }
}
