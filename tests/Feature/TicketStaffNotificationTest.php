<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * What the IT team is told about cases: the mail sent the moment one is raised, and the
 * Monday summary of everything still open. Both go to the people allowed to work that
 * type of case, and to nobody else.
 */
class TicketStaffNotificationTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = ['tickets.module', 'tickets.view_all', 'tickets.resolve'];

    /**
     * An account with an email address and exactly the given permissions.
     *
     * Each one gets its own role, because permissions hang off the role: two accounts
     * sharing "admin" would quietly share each other's grants, and these tests exist to
     * tell apart who is allowed what.
     */
    private function accountWith(array $permissions, string $name): User
    {
        $user = User::factory()->create([
            'name' => $name,
            'role' => 'role_'.strtolower($name),
            'employee_id' => Employee::create(['first_name' => $name, 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(
                ['role_id' => $user->role_id, 'permission' => $key],
                ['allowed' => true],
            );
        }

        return $user;
    }

    /** Somebody who may raise a case and nothing else. */
    private function requester(string $name = 'Requester'): User
    {
        return $this->accountWith(['tickets.module', 'tickets.create'], $name);
    }

    /** Replaces a standard template with one whose body is easy to assert against. */
    private function template(string $key, string $body): void
    {
        EmailTemplate::updateOrCreate(
            ['key' => $key],
            [
                'name' => $key,
                'subject' => 'Ticket '.$key,
                'body_html' => $body,
                'enabled' => true,
                'cadence' => 'realtime',
            ],
        );
    }

    /** @return list<SendTemplatedEmail> */
    private function pushedFor(string $templateKey): array
    {
        return Queue::pushed(SendTemplatedEmail::class)
            ->filter(fn (SendTemplatedEmail $job) => $job->templateKey === $templateKey)
            ->values()
            ->all();
    }

    public function test_a_new_case_emails_the_staff_who_can_take_it(): void
    {
        Queue::fake();
        $this->template('ticket.new_case', '<p>{{ticket.id}} {{ticket.subject}} {{ticket.requester}}</p>');
        $taker = $this->accountWith([...self::BASE, 'tickets.level_network'], 'Taker');
        $requester = $this->requester();

        $this->actingAs($requester)->postJson('/api/tickets', [
            'subject' => 'VPN client will not authenticate',
            'description' => 'Fails since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ])->assertCreated();

        $jobs = $this->pushedFor('ticket.new_case');
        $this->assertCount(1, $jobs);
        $this->assertSame($taker->email, $jobs[0]->toEmail);
        $this->assertStringContainsString('VPN client will not authenticate', $jobs[0]->html);
        $this->assertStringContainsString('Requester', $jobs[0]->html);
        // The tab travels with the link: ?view= alone opens the case, but closing it would
        // drop the reader on the dashboard rather than the list the case came from.
        $this->assertStringContainsString('/tickets?tab=all&view=', (string) $jobs[0]->actionUrl);
    }

    public function test_a_new_case_skips_staff_without_the_matching_level(): void
    {
        Queue::fake();
        $this->template('ticket.new_case', '<p>{{ticket.id}}</p>');
        $this->accountWith([...self::BASE, 'tickets.level_hardware'], 'WrongLevel');
        $requester = $this->requester();

        $this->actingAs($requester)->postJson('/api/tickets', [
            'subject' => 'VPN client will not authenticate',
            'description' => 'Fails since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ])->assertCreated();

        $this->assertCount(0, $this->pushedFor('ticket.new_case'));
    }

    /**
     * Each copy greets the person it is addressed to. The mail carries both names — the
     * recipient's and the requester's — and reusing the requester-facing variables here
     * once made every IT staff be greeted as the person who raised the case.
     */
    public function test_each_recipient_is_greeted_by_their_own_name(): void
    {
        Queue::fake();
        $this->template('ticket.new_case', '<p>Hi {{user.first_name}}, raised by {{ticket.requester}}</p>');
        $this->accountWith([...self::BASE, 'tickets.level_network'], 'Anong');
        $requester = $this->requester('Chaiwat');

        $this->actingAs($requester)->postJson('/api/tickets', [
            'subject' => 'VPN client will not authenticate',
            'description' => 'Fails since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ])->assertCreated();

        $jobs = $this->pushedFor('ticket.new_case');
        $this->assertCount(1, $jobs);
        $this->assertStringContainsString('Hi Anong,', $jobs[0]->html);
        $this->assertStringContainsString('raised by Chaiwat', $jobs[0]->html);
    }

    public function test_the_weekly_digest_lists_untaken_and_unfinished_cases(): void
    {
        Queue::fake();
        $this->template('ticket.weekly_digest', '<p>{{digest.open_count}}|{{digest.working_count}}</p>{{digest.open_table}}{{digest.working_table}}');
        $reader = $this->accountWith([...self::BASE, 'tickets.level_network'], 'Reader');
        $holder = $this->accountWith([...self::BASE, 'tickets.level_network'], 'Holder');

        Ticket::factory()->create(['category' => 'network', 'status' => 'open', 'subject' => 'Nobody has taken this']);
        Ticket::factory()->create([
            'category' => 'network', 'status' => 'in_progress', 'priority' => 'medium',
            'assignee_id' => $holder->id, 'subject' => 'Somebody is on this',
        ]);
        // Finished cases and other levels are none of this reader's business.
        Ticket::factory()->create(['category' => 'network', 'status' => 'completed', 'subject' => 'Already finished']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'open', 'subject' => 'Different level']);

        $this->artisan('tickets:send-weekly-digest')->assertExitCode(0);

        $jobs = $this->pushedFor('ticket.weekly_digest');
        $this->assertCount(2, $jobs, 'both readers of this level get their own copy');
        $mine = collect($jobs)->firstWhere('toEmail', $reader->email);
        $this->assertNotNull($mine);
        $this->assertStringContainsString('1|1', $mine->html);
        $this->assertStringContainsString('Nobody has taken this', $mine->html);
        $this->assertStringContainsString('Somebody is on this', $mine->html);
        // Team-wide, so a case in a colleague's hands has to name them.
        $this->assertStringContainsString('Holder', $mine->html);
        $this->assertStringContainsString('tab=all&amp;view=', $mine->html, 'each row links to the case on the All tab');
        $this->assertStringNotContainsString('Already finished', $mine->html);
        $this->assertStringNotContainsString('Different level', $mine->html);
    }

    public function test_the_weekly_digest_skips_staff_who_cannot_work_any_open_case(): void
    {
        Queue::fake();
        $this->template('ticket.weekly_digest', '<p>{{digest.open_count}}</p>');
        // Can resolve, but only hardware — and the only live case is a network one.
        $this->accountWith([...self::BASE, 'tickets.level_hardware'], 'HardwareOnly');
        // Has every level but is not allowed to work cases at all.
        $this->accountWith(['tickets.module', 'tickets.level_network'], 'NoResolve');
        Ticket::factory()->create(['category' => 'network', 'status' => 'open']);

        $this->artisan('tickets:send-weekly-digest')->assertExitCode(0);

        $this->assertCount(0, $this->pushedFor('ticket.weekly_digest'));
    }

    public function test_nothing_is_sent_when_no_case_is_outstanding(): void
    {
        Queue::fake();
        $this->template('ticket.weekly_digest', '<p>{{digest.open_count}}</p>');
        $this->accountWith([...self::BASE, 'tickets.level_network'], 'Reader');
        Ticket::factory()->create(['category' => 'network', 'status' => 'completed']);

        $this->artisan('tickets:send-weekly-digest')->assertExitCode(0);

        $this->assertCount(0, $this->pushedFor('ticket.weekly_digest'));
    }
}
