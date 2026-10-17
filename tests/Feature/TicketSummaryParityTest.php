<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Characterization of GET /tickets/summary over a seeded set hitting every branch; the expected JSON
 * was captured from the Eloquent implementation. Regenerate only on purpose:
 * WRITE_SUMMARY_FIXTURE=1 vendor/bin/phpunit --filter TicketSummaryParityTest
 */
class TicketSummaryParityTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-25 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        TicketSla::flush();
    }

    /** @return array<string, array{0: string}> */
    public static function nows(): array
    {
        return ['whole second' => [self::NOW], 'with microseconds' => ['2026-09-25 10:00:00.5']];
    }

    private function rules(): void
    {
        SlaTarget::create(['scope' => 'request_type', 'match_value' => 'computer', 'resolve_hours' => 24, 'clock' => 'business', 'enabled' => true]);
        SlaTarget::create(['scope' => 'request_type', 'match_value' => 'email', 'resolve_hours' => 48, 'clock' => 'calendar', 'enabled' => true]);
        SlaTarget::create(['scope' => 'priority', 'match_value' => 'critical', 'resolve_hours' => 4, 'clock' => 'business', 'enabled' => true]);
        SlaTarget::create(['scope' => 'work_class', 'match_value' => 'hardware:repair_internal', 'resolve_hours' => 720, 'clock' => 'calendar', 'enabled' => true]);
        SlaTarget::create(['scope' => 'work_class', 'match_value' => 'network:repair_vendor', 'resolve_hours' => 40, 'clock' => 'business', 'enabled' => true]);
        SlaTarget::create(['scope' => 'work_class', 'match_value' => 'software:repair_vendor', 'resolve_hours' => 40, 'clock' => 'business', 'enabled' => false]);
    }

    private function viewer(string $role, array $permissions): User
    {
        $created = Role::create(['key' => $role, 'name' => $role, 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $created->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role, 'employee_id' => Employee::create(['first_name' => 'Boss', 'last_name' => $role, 'status' => 'active'])->id]);
    }

    /** One ticket per spec; every instant is a whole second. */
    private function make(int $i, int $created, string $status, ?int $taken, ?int $resolved, array $extra = []): void
    {
        $stamp = fn (?int $ts) => $ts === null ? null : date('Y-m-d H:i:s', $ts);
        $requester = Employee::query()->value('id');
        $ticket = Ticket::factory()->create([
            'requester_id' => $requester,
            'status' => $status,
            'created_at' => $stamp($created),
            'responded_at' => $stamp($taken),
            'resolved_at' => $stamp($resolved),
            ...$extra,
        ]);

        if (($extra['source'] ?? 'manual') === 'auto_request') {
            $types = array_map(fn (RequestType $t) => $t->value, RequestType::cases());
            ServiceRequest::create([
                'reference' => sprintf('RQ-2026-%04d', $i), 'type' => $types[$i % count($types)], 'origin' => 'direct',
                'requester_name' => 'Anan', 'title' => "Request {$i}", 'reason' => 'Needed for work.',
                'status' => 'approved', 'ticket_id' => $ticket->id,
            ]);
        }
    }

    private function seedTickets(): void
    {
        Employee::create(['first_name' => 'Anan', 'last_name' => 'User']);
        $this->rules();
        mt_srand(20260925);
        $categories = ['hardware', 'software', 'network', 'other'];
        $priorities = [null, 'critical', 'high', 'medium', 'low'];
        $classes = ['standard', 'standard', 'repair_internal', 'repair_vendor'];
        $statuses = ['open', 'in_progress', 'in_progress', 'completed', 'completed', 'completed', 'canceled'];
        $start = strtotime('2025-05-01 00:00:00');
        $now = strtotime(self::NOW);
        $dueOffsets = [-1, 0, 1, 600, -600, 86400];

        for ($i = 0; $i < 320; $i++) {
            $created = $start + mt_rand(0, $now - $start);
            $this->makeRandom($i, $created, $statuses[mt_rand(0, 6)], $categories, $priorities, $classes, $dueOffsets, $now);
        }

        // Tickets on every window edge: created, taken and closed one second either side
        $edges = [];
        $nowCarbon = Carbon::parse(self::NOW);
        foreach ([7, 30, 90] as $days) {
            $edges[] = $nowCarbon->copy()->subDays($days)->getTimestamp();
            $edges[] = $nowCarbon->copy()->subDays($days * 2)->getTimestamp();
        }
        $edges[] = strtotime('2026-01-01 00:00:00');
        $edges[] = strtotime('2026-01-01 00:00:00') - (int) $nowCarbon->diffInSeconds(Carbon::parse('2026-01-01'));
        $edges[] = strtotime('2026-08-01 00:00:00');
        $edges[] = strtotime('2026-09-20 23:59:59');
        $edges[] = $now;
        foreach ($edges as $k => $edge) {
            foreach ([-1, 0, 1] as $j => $shift) {
                $idx = 1000 + $k * 10 + $j;
                $at = $edge + $shift;
                $this->make($idx, $at, 'completed', $at, $at, ['category' => 'software', 'sla_resolve_due_at' => date('Y-m-d H:i:s', $at)]);
                $this->make($idx + 500, $at - 7200, 'in_progress', $at, null, ['category' => 'hardware', 'work_class' => 'repair_internal', 'sla_resolve_due_at' => date('Y-m-d H:i:s', $now + $shift)]);
                $this->make($idx + 900, $at - 90000, 'completed', $at - 80000, $at, ['category' => 'network', 'work_class' => 'repair_vendor', 'priority' => 'high', 'source' => 'manual']);
            }
        }
    }

    /** @param list<string> $categories @param list<?string> $priorities @param list<string> $classes @param list<int> $dueOffsets */
    private function makeRandom(int $i, int $created, string $status, array $categories, array $priorities, array $classes, array $dueOffsets, int $now): void
    {
        $taken = mt_rand(0, 5) > 0 ? $created + mt_rand(0, 4) * 900 + (mt_rand(0, 3) === 0 ? 86400 : 0) + (mt_rand(0, 4) === 0 ? 7200 * 5 : 0) : null;
        $closed = in_array($status, ['completed', 'canceled'], true);
        $resolved = $closed && mt_rand(0, 12) > 0 ? ($taken ?? $created) + mt_rand(0, 400000) : null;
        if ($status === 'open') {
            $taken = mt_rand(0, 5) === 0 ? $taken : null;
        }
        if ($status === 'in_progress' && $taken === null) {
            $taken = $created + 600;
        }
        $resolveDue = match (mt_rand(0, 4)) {
            0 => null,
            1 => $now + $dueOffsets[mt_rand(0, 5)],
            2 => $resolved,
            default => $created + mt_rand(3600, 900000),
        };
        $responseDue = mt_rand(0, 7) === 0 ? null : $created + 7200 + $dueOffsets[mt_rand(0, 5)];
        $stamp = fn (?int $ts) => $ts === null ? null : date('Y-m-d H:i:s', $ts);
        $this->make($i, $created, $status, $taken, $resolved, [
            'category' => $categories[mt_rand(0, 3)],
            'priority' => $priorities[mt_rand(0, 4)],
            'work_class' => $classes[mt_rand(0, 3)],
            'source' => mt_rand(0, 2) === 0 ? 'auto_request' : 'manual',
            'sla_response_due_at' => $stamp($responseDue),
            'sla_resolve_due_at' => $stamp($resolveDue),
        ]);
    }

    /** @return array<string, mixed> */
    private function capture(): array
    {
        $out = [];
        $viewers = [
            'super' => $this->viewer('sum_all', ['tickets.view_dashboard', 'tickets.view_all', 'tickets.level_hardware', 'tickets.level_software', 'tickets.level_network', 'tickets.level_other']),
            'software_only' => $this->viewer('sum_sw', ['tickets.view_dashboard', 'tickets.level_software']),
        ];
        $queries = ['days=7', 'days=30', 'days=90', 'days=year', 'days=45', 'from=2026-08-01&to=2026-09-20', 'from=2026-09-25&to=2026-09-25'];

        foreach ($viewers as $name => $viewer) {
            $this->actingAs($viewer);
            foreach ($queries as $query) {
                $response = $this->getJson('/api/tickets/summary?'.$query);
                $out["{$name}.{$query}"] = $response->assertOk()->json();
            }
        }

        return $out;
    }

    #[DataProvider('nows')]
    public function test_summary_matches_the_captured_output(string $now): void
    {
        $this->seedTickets();
        $this->travelTo(Carbon::parse($now));

        $actual = json_encode($this->capture(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        $path = __DIR__.'/fixtures/ticket-summary-'.(str_contains($now, '.') ? 'micro' : 'whole').'.json';

        if (getenv('WRITE_SUMMARY_FIXTURE') === '1') {
            @mkdir(dirname($path), 0777, true);
            file_put_contents($path, $actual);
        }

        $this->assertFileExists($path);
        $this->assertSame(file_get_contents($path), $actual);
    }
}
