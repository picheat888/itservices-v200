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
 * The two mails that keep a requester informed while their case is being worked.
 *
 * They used to hear nothing between filing and closing — "we have it", then silence, then
 * "it is done". A case could pass through three technicians and the person waiting on it
 * would see none of it unless they went looking in the portal.
 *
 * Taken and forwarded are separate templates rather than one: the second has to name both
 * ends of the handover, because the requester may have been talking to the technician who
 * just let go of it.
 */
class TicketProgressEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** A case whose requester has a login, so the mail has somewhere to go. */
    private function ticket(): Ticket
    {
        $requester = Employee::create([
            'code' => 'EMP-1042', 'first_name' => 'Somchai', 'last_name' => 'Suksawat', 'status' => 'active',
        ]);
        User::factory()->create([
            'employee_id' => $requester->id, 'email' => 'somchai@inaba.co.th', 'name' => 'Somchai Suksawat',
        ]);

        return Ticket::create([
            'subject' => 'Printer not responding',
            'description' => "Paper jam error,\nbut no paper inside.",
            'category' => TicketCategory::Hardware->value,
            'status' => 'open',
            'requester_id' => $requester->id,
        ]);
    }

    /** @return array{html: string, subject: string, to: string, url: string}|null */
    private function mail(string $key): ?array
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === $key);

        return $job === null ? null : [
            'html' => $this->prop($job, 'html'),
            'subject' => $this->prop($job, 'subject'),
            'to' => $this->prop($job, 'toEmail'),
            'url' => $this->prop($job, 'actionUrl'),
        ];
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_taking_a_case_tells_its_requester_who_has_it(): void
    {
        Bus::fake();
        $ticket = $this->ticket();
        $staff = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);

        app(TicketService::class)->take($ticket, $staff, TicketPriority::Medium, null, null);

        $mail = $this->mail('ticket.owner_taken');
        $this->assertNotNull($mail, 'The requester was told nothing.');
        $this->assertSame('somchai@inaba.co.th', $mail['to'], 'it goes to the requester, not the technician');
        $this->assertStringContainsString('Hi Somchai', $mail['html']);
        $this->assertStringContainsString('Piches Srisuk', $mail['html']);
        // The case itself travels with it, so the mail stands on its own.
        $this->assertStringContainsString('Printer not responding', $mail['html']);
        $this->assertStringContainsString('Hardware', $mail['html']);
        $this->assertStringNotContainsString('{{', $mail['html']);
        // Their own list, not the All tab the staff mails point at.
        $this->assertSame(url("/tickets?tab=my&view={$ticket->id}"), $mail['url']);
    }

    public function test_assigning_a_case_tells_the_requester_the_same_thing(): void
    {
        Bus::fake();
        $ticket = $this->ticket();
        $staff = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);

        app(TicketService::class)->assign($ticket, $staff, TicketPriority::Medium, User::factory()->create());

        // Who chose the technician is IT's business; that somebody now has it is theirs.
        $this->assertStringContainsString('Piches Srisuk', $this->mail('ticket.owner_taken')['html']);
    }

    public function test_forwarding_names_both_ends_of_the_handover(): void
    {
        Bus::fake();
        $ticket = $this->ticket();
        $first = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);
        $second = User::factory()->create(['name' => 'Anong Wattana', 'email' => 'anong@inaba.co.th']);

        app(TicketService::class)->take($ticket, $first, TicketPriority::Medium, null, null);
        Bus::fake();  // forget the take mail; this test is about what forwarding sends
        app(TicketService::class)->forward($ticket->fresh(), $second);

        $mail = $this->mail('ticket.owner_forwarded');
        $this->assertNotNull($mail, 'The requester was not told their case changed hands.');
        $this->assertSame('somchai@inaba.co.th', $mail['to']);
        $this->assertStringContainsString('Anong Wattana', $mail['html'], 'who holds it now');
        $this->assertStringContainsString('Piches Srisuk', $mail['html'], 'who held it before');
        $this->assertStringNotContainsString('{{', $mail['html']);

        // And never the "somebody picked it up" one — a handover is not a fresh start.
        $this->assertNull($this->mail('ticket.owner_taken'));
    }

    public function test_forwarding_an_untaken_case_leaves_no_dangling_label(): void
    {
        Bus::fake();
        $ticket = $this->ticket();
        $staff = User::factory()->create(['name' => 'Anong Wattana', 'email' => 'anong@inaba.co.th']);

        // Nobody held it before, so "Previously:" has nothing to name.
        app(TicketService::class)->forward($ticket, $staff);

        $text = html_entity_decode(strip_tags($this->mail('ticket.owner_forwarded')['html']));
        $this->assertStringContainsString('Previously: -', $text);
    }

    public function test_a_requester_with_no_address_is_recorded_rather_than_dropped(): void
    {
        Bus::fake();
        $requester = Employee::create([
            'code' => 'EMP-1099', 'first_name' => 'Manee', 'last_name' => 'Jaidee', 'status' => 'active',
        ]);
        $ticket = Ticket::create([
            'subject' => 'No network', 'description' => 'Cable unplugged.',
            'category' => TicketCategory::Network->value, 'status' => 'open', 'requester_id' => $requester->id,
        ]);

        app(TicketService::class)->take($ticket, User::factory()->create(), TicketPriority::Medium, null, null);

        $this->assertNull($this->mail('ticket.owner_taken'), 'nothing can be queued with nowhere to send it');
        $this->assertDatabaseHas('email_logs', [
            'template_key' => 'ticket.owner_taken',
            'to_email' => null,
            'recipient_name' => 'Manee Jaidee',
            'status' => 'skipped',
        ]);
    }
}
