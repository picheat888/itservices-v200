<?php

// Staff whose last working day has passed are out of every Ticket hand-off: pickers, assign, alerts and the digest (TKT-3).

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketSlaAlertService;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TicketResignedStaffTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = ['tickets.module', 'tickets.view_all', 'tickets.resolve', 'tickets.level_network'];

    /** An account on its own role with exactly the given permissions; $lastDay set = resigned. */
    private function staff(string $name, array $permissions = self::BASE, ?string $lastDay = null, bool $resigned = false): User
    {
        $employee = Employee::create([
            'first_name' => $name, 'last_name' => 'Test',
            'status' => $resigned ? 'resigned' : 'active',
            'last_day' => $lastDay,
        ]);
        $user = User::factory()->create(['name' => $name, 'role' => 'role_'.strtolower($name), 'employee_id' => $employee->id]);
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => $key], ['allowed' => true]);
        }

        return $user;
    }

    private function gone(string $name, array $permissions = self::BASE): User
    {
        return $this->staff($name, $permissions, today()->subDay()->toDateString(), true);
    }

    public function test_the_staff_picker_leaves_out_people_who_have_left(): void
    {
        $this->staff('Active');
        $this->gone('Gone');
        // Still serving notice: the last day is a working day
        $this->staff('Leaving', self::BASE, today()->toDateString(), true);
        $assigner = $this->staff('Boss', ['tickets.module', 'tickets.assign']);

        $names = array_column($this->actingAs($assigner)->getJson('/api/tickets/staff?category=network')->assertOk()->json('data'), 'name');

        $this->assertContains('Active', $names);
        $this->assertContains('Leaving', $names);
        $this->assertNotContains('Gone', $names);
    }

    public function test_a_case_cannot_be_assigned_or_forwarded_to_someone_who_has_left(): void
    {
        $gone = $this->gone('Gone');
        $assigner = $this->staff('Boss', ['tickets.module', 'tickets.view_all', 'tickets.assign', 'tickets.forward', 'tickets.level_network']);
        $open = Ticket::factory()->create(['category' => 'network', 'status' => 'open']);
        $working = Ticket::factory()->create(['category' => 'network', 'status' => 'in_progress', 'priority' => 'medium', 'assignee_id' => $this->staff('Holder')->id]);

        $this->actingAs($assigner)->postJson("/api/tickets/{$open->id}/assign", ['assignee_id' => $gone->id, 'priority' => 'medium'])
            ->assertStatus(422)->assertJsonPath('message', 'target_has_left');
        $this->actingAs($assigner)->postJson("/api/tickets/{$working->id}/forward", ['assignee_id' => $gone->id])
            ->assertStatus(422)->assertJsonPath('message', 'target_has_left');

        $this->assertNull($open->fresh()->assignee_id);
    }

    public function test_a_new_case_is_not_sent_to_someone_who_has_left(): void
    {
        Queue::fake();
        EmailTemplate::updateOrCreate(['key' => 'ticket.new_case'], [
            'name' => 'ticket.new_case', 'subject' => 'New', 'body_html' => '<p>{{ticket.id}}</p>', 'enabled' => true, 'cadence' => 'realtime',
        ]);
        $active = $this->staff('Active');
        $gone = $this->gone('Gone');

        $this->actingAs($this->staff('Requester', ['tickets.module', 'tickets.create']))->postJson('/api/tickets', [
            'subject' => 'VPN client will not authenticate',
            'description' => 'Fails since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ])->assertCreated();

        $to = Queue::pushed(SendTemplatedEmail::class)->filter(fn ($j) => $j->templateKey === 'ticket.new_case')->pluck('toEmail')->all();
        $this->assertSame([$active->email], $to);
        $this->assertSame(0, $gone->notifications()->count());
    }

    public function test_the_weekly_digest_skips_someone_who_has_left(): void
    {
        Queue::fake();
        EmailTemplate::updateOrCreate(['key' => 'ticket.weekly_digest'], [
            'name' => 'ticket.weekly_digest', 'subject' => 'Digest', 'body_html' => '<p>{{digest.total}}</p>', 'enabled' => true, 'cadence' => 'realtime',
        ]);
        $active = $this->staff('Active');
        $this->gone('Gone');
        Ticket::factory()->create(['category' => 'network', 'status' => 'open']);

        $this->artisan('tickets:send-weekly-digest')->assertExitCode(0);

        $to = Queue::pushed(SendTemplatedEmail::class)->filter(fn ($j) => $j->templateKey === 'ticket.weekly_digest')->pluck('toEmail')->all();
        $this->assertSame([$active->email], $to);
    }

    public function test_sla_alerts_skip_someone_who_has_left(): void
    {
        TicketSla::flush();
        $this->travelTo('2026-01-14 12:00:00');
        $taker = $this->staff('Taker');
        $goneTaker = $this->gone('GoneTaker');
        $assigner = $this->staff('Boss', ['tickets.module', 'tickets.assign']);
        $goneAssigner = $this->gone('GoneBoss', ['tickets.module', 'tickets.assign']);
        $holder = $this->staff('Holder');

        // Nobody took it for hours: the response clock warns whoever could take it
        Ticket::factory()->create(['category' => 'network', 'status' => 'open', 'created_at' => '2026-01-13 08:00:00']);
        // Critical case past its resolve deadline: escalates to everyone who can re-assign
        Ticket::factory()->create([
            'category' => 'network', 'status' => 'in_progress', 'priority' => 'critical', 'assignee_id' => $holder->id,
            'created_at' => '2026-01-13 08:00:00', 'responded_at' => '2026-01-13 08:05:00',
        ]);

        app(TicketSlaAlertService::class)->run();

        $this->assertGreaterThan(0, $taker->notifications()->count());
        $this->assertGreaterThan(0, $assigner->notifications()->count());
        $this->assertSame(0, $goneTaker->notifications()->count());
        $this->assertSame(0, $goneAssigner->notifications()->count());
    }
}
