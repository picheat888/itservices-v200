<?php

// Desk actions on a case that another action already moved: the stale one is refused, nothing is overwritten.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class TicketActionRaceTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $first = 'Staff', ?string $firstTh = null): User
    {
        $employee = Employee::create(['first_name' => $first, 'last_name' => 'Test', 'first_name_th' => $firstTh, 'last_name_th' => $firstTh ? 'ทดสอบ' : null, 'status' => 'active']);

        return User::factory()->create(['role' => 'super', 'name' => "{$first} Test", 'employee_id' => $employee->id]);
    }

    private function assertRefused(string $code, callable $action): void
    {
        try {
            $action();
            $this->fail("Expected the action to be refused with {$code}");
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame($code, $e->getMessage());
        }
    }

    public function test_a_second_take_on_a_stale_copy_is_refused(): void
    {
        $first = $this->staff('First');
        $second = $this->staff('Second');
        $ticket = Ticket::factory()->create(['status' => 'open', 'assignee_id' => null, 'priority' => null]);
        $stale = Ticket::find($ticket->id);
        $service = app(TicketService::class);

        $service->take($ticket, $first, null, null, null);
        $this->assertRefused('not_open_for_taking', fn () => $service->take($stale, $second, null, null, null));
        $this->assertRefused('not_open', fn () => $service->assign($stale, $second, null));

        $this->assertSame($first->id, $ticket->fresh()->assignee_id);
    }

    public function test_closing_a_case_that_was_forwarded_meanwhile_is_refused(): void
    {
        $holder = $this->staff('Holder');
        $next = $this->staff('Next');
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $holder->id]);
        $stale = Ticket::find($ticket->id);
        $service = app(TicketService::class);

        $service->forward($ticket, $next, $next);
        $this->assertRefused('case_moved', fn () => $service->resolve($stale, true, 'Closing a case I no longer hold.'));

        $this->assertSame('in_progress', $ticket->fresh()->status->value);
        $this->assertSame($next->id, $ticket->fresh()->assignee_id);
    }

    public function test_forwarding_a_case_that_was_closed_meanwhile_is_refused(): void
    {
        $holder = $this->staff('Holder');
        $next = $this->staff('Next');
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $holder->id]);
        $stale = Ticket::find($ticket->id);
        $service = app(TicketService::class);

        $service->resolve($ticket, true, 'Fixed the cable and tested.');
        $this->assertRefused('not_in_progress', fn () => $service->forward($stale, $next, $holder));

        $this->assertSame($holder->id, $ticket->fresh()->assignee_id);
        $this->assertSame(0, $ticket->updates()->count());
    }

    public function test_the_api_reports_a_stale_take_as_already_taken(): void
    {
        $taker = $this->staff('Taker');
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $this->staff('Other')->id]);
        $this->actingAs($taker);

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'high'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'not_open_for_taking');
    }

    public function test_progress_notes_carry_the_author_thai_name(): void
    {
        $holder = $this->staff('Nattaya', 'ณัฐยา');
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $holder->id]);
        $this->actingAs($holder);

        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Waiting for the spare part.'])
            ->assertCreated()
            ->assertJsonPath('data.updates.0.author_name', 'Nattaya Test')
            ->assertJsonPath('data.updates.0.author_name_th', 'ณัฐยา ทดสอบ');

        $this->getJson("/api/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.updates.0.author_name_th', 'ณัฐยา ทดสอบ');
    }

    public function test_a_forward_records_both_names_in_thai_too(): void
    {
        $holder = $this->staff('Nattaya', 'ณัฐยา');
        $next = $this->staff('Anong', 'อนงค์');
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $holder->id]);

        app(TicketService::class)->forward($ticket, $next, $holder);

        $this->assertSame(
            ['from' => 'Nattaya Test', 'from_th' => 'ณัฐยา ทดสอบ', 'to' => 'Anong Test', 'to_th' => 'อนงค์ ทดสอบ'],
            $ticket->updates()->first()->meta,
        );
    }
}
