<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Monitor\MonitorBoardService;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MonitorBoardServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        Cache::flush();
        // A Wednesday noon: SLA math counts working time
        $this->travelTo('2026-01-14 12:00:00');
    }

    private function board(): array
    {
        return app(MonitorBoardService::class)->board();
    }

    private function resolver(string $first = 'Somchai', ?string $firstTh = 'สมชาย', ?string $lastTh = 'กิตติ', string $status = 'active', ?string $lastDay = null): User
    {
        $user = User::factory()->create([
            'role' => 'resolver',
            'employee_id' => Employee::create([
                'first_name' => $first, 'last_name' => 'Test',
                'first_name_th' => $firstTh, 'last_name_th' => $lastTh,
                'status' => $status, 'last_day' => $lastDay,
            ])->id,
        ]);
        RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => 'tickets.resolve'], ['allowed' => true]);

        return $user;
    }

    private function overdueOpen(): Ticket
    {
        return Ticket::factory()->create(['status' => 'open', 'priority' => 'high', 'created_at' => '2026-01-13 08:00:00']);
    }

    private function overdueInProgress(?User $assignee = null): Ticket
    {
        return Ticket::factory()->create([
            'status' => 'in_progress', 'priority' => 'critical', 'assignee_id' => $assignee?->id,
            'created_at' => '2026-01-13 08:00:00', 'responded_at' => '2026-01-13 08:05:00',
        ]);
    }

    private function nearDueInProgress(?User $assignee = null): Ticket
    {
        return Ticket::factory()->create([
            'status' => 'in_progress', 'priority' => 'critical', 'assignee_id' => $assignee?->id,
            'created_at' => '2026-01-14 08:40:00', 'responded_at' => '2026-01-14 08:45:00',
        ]);
    }

    private function calmInProgress(?User $assignee = null): Ticket
    {
        return Ticket::factory()->create([
            'status' => 'in_progress', 'priority' => 'low', 'assignee_id' => $assignee?->id,
            'created_at' => '2026-01-14 11:00:00', 'responded_at' => '2026-01-14 11:00:00',
        ]);
    }

    private function freshOpen(string $at): Ticket
    {
        return Ticket::factory()->create(['status' => 'open', 'priority' => 'medium', 'created_at' => $at]);
    }

    public function test_groups_and_orders_rows(): void
    {
        $staff = $this->resolver();
        $later = $this->freshOpen('2026-01-14 11:50:00');
        $sooner = $this->freshOpen('2026-01-14 11:30:00');
        $calm = $this->calmInProgress($staff);
        $near = $this->nearDueInProgress($staff);
        $lateWork = $this->overdueInProgress($staff);
        $lateOpen = $this->overdueOpen();

        $rows = $this->board()['rows'];

        $this->assertSame(['overdue', 'overdue', 'near', 'waiting', 'waiting'], array_column($rows, 'group'));
        $this->assertSame([$lateOpen->id, $lateWork->id, $near->id, $sooner->id, $later->id], array_column($rows, 'id'));
        $this->assertNotContains($calm->id, array_column($rows, 'id'));
        $this->assertSame(['response', 'resolve', 'resolve', 'response', 'response'], array_column($rows, 'clock'));
        $this->assertNull($rows[0]['assignee']);
        $this->assertSame(['id' => $staff->id, 'name' => 'สมชาย ก.', 'initials' => 'สก'], $rows[1]['assignee']);
    }

    public function test_row_carries_ticket_fields_and_requester_department(): void
    {
        $department = Department::create(['code' => 'ACC', 'name' => 'Accounting', 'name_th' => 'บัญชี']);
        $requester = Employee::create([
            'first_name' => 'Nok', 'last_name' => 'Test', 'first_name_th' => 'วรรณา', 'last_name_th' => 'ทองดี',
            'status' => 'active', 'department_id' => $department->id,
        ]);
        $ticket = Ticket::factory()->create([
            'status' => 'open', 'priority' => 'high', 'subject' => 'Printer jam',
            'requester_id' => $requester->id, 'created_at' => '2026-01-14 11:30:00',
        ]);

        $row = $this->board()['rows'][0];

        $this->assertSame($ticket->ticket_no, $row['ticket_no']);
        $this->assertSame('Printer jam', $row['subject']);
        $this->assertSame('high', $row['priority']);
        $this->assertSame('บัญชี', $row['department']);
        $this->assertSame('วรรณา ท.', $row['requester']);
        $this->assertSame(TicketSla::forTicket($ticket->fresh())['response_due_at'], $row['due_at']);
    }

    public function test_near_due_open_ticket_stays_in_waiting(): void
    {
        // 100 of 120 response minutes used
        $this->freshOpen('2026-01-14 10:20:00');

        $board = $this->board();

        $this->assertSame(['waiting'], array_column($board['rows'], 'group'));
        $this->assertSame(0, $board['kpis']['near_due']);
    }

    public function test_kpis_count_live_and_today(): void
    {
        $staff = $this->resolver();
        $this->freshOpen('2026-01-14 11:30:00');
        $this->freshOpen('2026-01-14 11:50:00');
        $this->overdueOpen();
        $this->overdueInProgress($staff);
        $this->calmInProgress($staff);
        // Closed today on time, closed today late, closed yesterday, canceled today
        Ticket::factory()->create(['status' => 'completed', 'priority' => 'low', 'created_at' => '2026-01-14 08:00:00', 'responded_at' => '2026-01-14 08:10:00', 'resolved_at' => '2026-01-14 09:00:00']);
        Ticket::factory()->create(['status' => 'completed', 'priority' => 'critical', 'created_at' => '2026-01-12 08:00:00', 'responded_at' => '2026-01-12 08:10:00', 'resolved_at' => '2026-01-14 11:00:00']);
        Ticket::factory()->create(['status' => 'completed', 'priority' => 'low', 'created_at' => '2026-01-13 08:00:00', 'responded_at' => '2026-01-13 08:10:00', 'resolved_at' => '2026-01-13 15:00:00']);
        Ticket::factory()->create(['status' => 'canceled', 'priority' => 'low', 'created_at' => '2026-01-14 08:00:00', 'resolved_at' => '2026-01-14 09:00:00']);

        $kpis = $this->board()['kpis'];

        $this->assertSame(3, $kpis['waiting']);
        $this->assertSame('2026-01-13T08:00:00+07:00', $kpis['waiting_oldest_at']);
        $this->assertSame(2, $kpis['in_progress']);
        $this->assertSame(1, $kpis['busy_staff']);
        $this->assertSame(2, $kpis['overdue']);
        $this->assertSame(1, $kpis['overdue_response']);
        $this->assertSame(1, $kpis['overdue_resolve']);
        $this->assertSame(0, $kpis['near_due']);
        $this->assertSame(2, $kpis['closed_today']);
        $this->assertSame(1, $kpis['closed_today_met']);
    }

    public function test_team_lists_every_resolver_with_held_count(): void
    {
        $busy = $this->resolver('Somchai', 'สมชาย', 'กิตติ');
        $idle = $this->resolver('Wipa', null, null);
        $left = $this->resolver('Gone', 'ออก', 'ไป', 'resigned', '2026-01-01');
        User::factory()->create(['role' => 'user']);
        $this->calmInProgress($busy);
        $this->calmInProgress($busy);
        $this->nearDueInProgress($busy);
        $this->calmInProgress($left);
        $this->freshOpen('2026-01-14 11:30:00');

        $team = $this->board()['team'];

        $this->assertSame([$busy->id, $idle->id], array_column($team, 'id'));
        $this->assertSame([3, 0], array_column($team, 'count'));
        $this->assertSame('สมชาย ก.', $team[0]['name']);
        $this->assertSame('Wipa T.', $team[1]['name']);
        $this->assertSame('WT', $team[1]['initials']);
    }

    public function test_short_names_skip_thai_leading_vowels(): void
    {
        $user = $this->resolver('Kiat', 'เกียรติ', 'ใจดี');

        $this->assertSame(['id' => $user->id, 'name' => 'เกียรติ จ.', 'initials' => 'กจ', 'count' => 0], $this->board()['team'][0]);
    }

    public function test_query_count_does_not_grow_with_the_number_of_cases(): void
    {
        $count = function (): int {
            Cache::flush();
            TicketSla::flush();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->board();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };
        $staff = $this->resolver();
        $this->freshOpen('2026-01-14 11:30:00');
        $this->calmInProgress($staff);
        $few = $count();

        foreach (range(1, 5) as $i) {
            $this->freshOpen('2026-01-14 11:4'.$i.':00');
            $this->calmInProgress($staff);
            Ticket::factory()->create(['status' => 'completed', 'priority' => 'low', 'created_at' => '2026-01-14 08:00:00', 'responded_at' => '2026-01-14 08:10:00', 'resolved_at' => '2026-01-14 09:0'.$i.':00']);
        }

        $this->assertSame($few, $count());
    }

    public function test_board_is_cached_for_five_seconds(): void
    {
        $this->freshOpen('2026-01-14 11:30:00');
        $this->board();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->board();
        $this->assertCount(0, DB::getQueryLog());

        $this->travel(6)->seconds();
        $this->board();
        $this->assertNotEmpty(DB::getQueryLog());
    }

    public function test_board_reports_server_time_and_bell_sound(): void
    {
        $board = $this->board();

        $this->assertSame('2026-01-14T12:00:00+07:00', $board['generated_at']);
        $this->assertSame(['key' => 'pluck', 'enabled' => true], $board['sound']);
    }
}
