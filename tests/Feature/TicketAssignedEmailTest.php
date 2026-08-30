<?php

namespace Tests\Feature;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * The mail somebody gets when a case is handed to them.
 *
 * Being handed a case is not the same as picking one up, and the mail has to answer the two
 * questions that follow from that: who handed it over, and what the case actually is. It
 * used to carry neither — the body was a copy of the requester's confirmation ("We've
 * received your ticket and assigned it to our team"), addressed to the IT staff.
 *
 * Only assign() sends it. take() is somebody choosing the case for themselves, and telling
 * them what they just did would be noise.
 */
class TicketAssignedEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function ticket(): Ticket
    {
        $requester = Employee::create([
            'code' => 'EMP-1042', 'first_name' => 'Somchai', 'last_name' => 'Suksawat', 'status' => 'active',
        ]);

        return Ticket::create([
            'subject' => 'Printer not responding',
            'description' => "The printer on the 3rd floor shows a paper jam error,\nbut there is no paper stuck inside.",
            'category' => TicketCategory::Hardware->value,
            'status' => 'open',
            'requester_id' => $requester->id,
        ]);
    }

    /** @return array{html: string, subject: string, to: string}|null */
    private function assignedMail(): ?array
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'ticket.assigned');

        return $job === null ? null : [
            'html' => $this->prop($job, 'html'),
            'subject' => $this->prop($job, 'subject'),
            'to' => $this->prop($job, 'toEmail'),
        ];
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_it_names_who_assigned_the_case_and_what_the_case_is(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);
        $admin = User::factory()->create(['name' => 'Anong Wattana', 'email' => 'anong@inaba.co.th']);

        app(TicketService::class)->assign($this->ticket(), $staff, TicketPriority::Medium, $admin);

        $mail = $this->assignedMail();
        $this->assertNotNull($mail, 'Assigning a case sent nothing.');
        $this->assertSame('piches@inaba.co.th', $mail['to']);
        $this->assertStringContainsString('Hi Piches', $mail['html']);

        // Who handed it over — the question the old body could not answer.
        $this->assertStringContainsString('Anong Wattana', $mail['html']);
        // And what the case is, without having to open the portal first.
        $this->assertStringContainsString('Printer not responding', $mail['html']);
        $this->assertStringContainsString('Hardware', $mail['html']);
        $this->assertStringContainsString('paper jam error', $mail['html']);
        $this->assertStringNotContainsString('{{', $mail['html']);
    }

    public function test_the_description_is_escaped_and_keeps_its_line_breaks(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['email' => 'piches@inaba.co.th']);
        $ticket = $this->ticket();
        $ticket->update(['description' => "Broke after <b>update</b>\nSecond line."]);

        app(TicketService::class)->assign($ticket, $staff, TicketPriority::Medium, User::factory()->create());

        // The requester typed this; it lands in an HTML email.
        $html = $this->assignedMail()['html'];
        $this->assertStringContainsString('&lt;b&gt;update&lt;/b&gt;', $html);
        $this->assertStringNotContainsString('<b>update</b>', $html);
        $this->assertStringContainsString('<br />', $html);
    }

    public function test_an_assignment_with_no_actor_recorded_reads_as_a_dash(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['email' => 'piches@inaba.co.th']);

        // The parameter is optional, so the label must never be left hanging.
        app(TicketService::class)->assign($this->ticket(), $staff, TicketPriority::Medium);

        // Read as text, not markup: the label is bolded in the template and an administrator
        // may re-bold it. What must hold is that the label never stands with nothing after it.
        $text = html_entity_decode(strip_tags($this->assignedMail()['html']));
        $this->assertStringContainsString('Assigned by: -', $text);
    }

    public function test_taking_a_case_for_yourself_sends_nothing(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['email' => 'piches@inaba.co.th']);

        app(TicketService::class)->take($this->ticket(), $staff, TicketPriority::Medium, null, null);

        // Telling somebody what they themselves just did is noise.
        $this->assertNull($this->assignedMail());
    }
}
