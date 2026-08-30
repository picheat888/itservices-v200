<?php

namespace Tests\Feature;

use App\Enums\Ticket\TicketCategory;
use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\TicketSlaAlertNotification;
use App\Services\Ticket\TicketService;
use App\Services\Ticket\TicketSlaAlertService;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use ReflectionObject;
use Tests\TestCase;

/**
 * The two mails that end a case, and the note that goes in them.
 *
 * A completed case has always mailed the requester; a cancelled one used to stop at the bell,
 * on the grounds that the reason showed in the drawer. That is the one outcome the requester
 * most needs told — their case is closed and the thing they asked about was not done — and
 * "it is in the app somewhere" is not telling them.
 *
 * Both carry {{ticket.resolution}}: the fix on a completed case, the reason on a cancelled
 * one. It is free text somebody typed into a form and it lands in an HTML email, so it is
 * escaped here rather than trusted.
 */
class TicketClosureEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** A requester with a login, so the mail has somewhere to go. */
    private function ticketFor(string $email = 'somchai@inaba.co.th'): Ticket
    {
        $employee = Employee::create([
            'code' => 'EMP-1042', 'first_name' => 'Somchai', 'last_name' => 'Suksawat', 'status' => 'active',
        ]);
        User::factory()->create(['employee_id' => $employee->id, 'email' => $email, 'name' => 'Somchai Suksawat']);

        return Ticket::create([
            'subject' => 'Printer not responding',
            'description' => "Paper jam error\nbut no paper inside.",
            'category' => TicketCategory::Hardware->value,
            'status' => 'open',
            'requester_id' => $employee->id,
        ]);
    }

    private function close(Ticket $ticket, bool $complete, string $resolution): void
    {
        app(TicketService::class)->resolve($ticket, $complete, $resolution);
    }

    /** @return array{key: string, html: string, subject: string}|null the closure mail queued */
    private function closureMail(): ?array
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => in_array(
                $this->prop($queued, 'templateKey'),
                ['ticket.resolved', 'ticket.cancelled'],
                true,
            ));

        return $job === null ? null : [
            'key' => $this->prop($job, 'templateKey'),
            'html' => $this->prop($job, 'html'),
            'subject' => $this->prop($job, 'subject'),
        ];
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_a_cancelled_case_mails_the_requester_with_the_reason(): void
    {
        Bus::fake();
        $this->close($this->ticketFor(), false, 'Duplicate of TKT-2850.');

        $mail = $this->closureMail();
        $this->assertNotNull($mail, 'A cancelled case sent nothing.');
        $this->assertSame('ticket.cancelled', $mail['key']);
        $this->assertStringContainsString('has been Cancelled', $mail['subject']);
        $this->assertStringContainsString('Duplicate of TKT-2850.', $mail['html']);
        $this->assertStringNotContainsString('{{', $mail['html']);
    }

    public function test_a_completed_case_still_mails_the_requester_with_the_fix(): void
    {
        Bus::fake();
        $this->close($this->ticketFor(), true, 'Replaced the fuser roller.');

        $mail = $this->closureMail();
        $this->assertNotNull($mail);
        $this->assertSame('ticket.resolved', $mail['key']);
        $this->assertStringContainsString('Replaced the fuser roller.', $mail['html']);
    }

    public function test_the_resolution_note_is_escaped_and_keeps_its_line_breaks(): void
    {
        Bus::fake();
        // Typed into a form by IT, rendered into an HTML email. A stray tag must arrive as
        // text, and a note written over two lines must not arrive as one run-on sentence.
        $this->close($this->ticketFor(), true, "Swapped the <b>fuser</b>\nTested 20 pages.");

        $html = $this->closureMail()['html'];
        $this->assertStringContainsString('&lt;b&gt;fuser&lt;/b&gt;', $html);
        $this->assertStringNotContainsString('<b>fuser</b>', $html);
        $this->assertStringContainsString("Swapped the &lt;b&gt;fuser&lt;/b&gt;<br />\nTested 20 pages.", $html);
    }

    public function test_a_closure_with_no_note_reads_as_a_dash_not_a_gap(): void
    {
        Bus::fake();
        $this->close($this->ticketFor(), false, '');

        // The template prints "Resolution:" whatever happens, so an empty note would leave a
        // label with nothing after it.
        $this->assertStringContainsString('Resolution:</strong> -', $this->closureMail()['html']);
    }

    public function test_a_breached_case_bells_the_team_without_mailing_them(): void
    {
        Bus::fake();
        Notification::fake();

        // Somebody who would have been mailed under the old behaviour: they can take this
        // case, and its response deadline went by long ago.
        $roleId = Role::firstOrCreate(['key' => 'itrole'], ['name' => 'IT', 'is_system' => false])->id;
        foreach (['tickets.resolve', 'tickets.level_hardware'] as $permission) {
            RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission], ['allowed' => true]);
        }
        User::factory()->create(['role' => 'itrole', 'email' => 'it@inaba.co.th']);

        // forceFill, because created_at is guarded and the SLA state is computed from it.
        $ticket = $this->ticketFor();
        $ticket->forceFill([
            'created_at' => now()->subMonth(),
            'sla_response_due_at' => now()->subMonth(),
        ])->saveQuietly();

        app(TicketSlaAlertService::class)->run();

        // The tray still hears about it — that half was never in question.
        Notification::assertSentTimes(TicketSlaAlertNotification::class, 1);
        // Nothing is mailed, and in particular nothing is mailed against a key with no row
        // behind it, which sendTemplate() would swallow in silence.
        Bus::assertNothingDispatched();
        $this->assertNull(
            collect(EmailTemplates::all())->firstWhere('key', 'ticket.sla_breach'),
            'ticket.sla_breach is still in the catalogue.'
        );
    }
}
