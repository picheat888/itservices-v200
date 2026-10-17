<?php

namespace Tests\Feature\Report;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Ticket\TicketManualSlaReport;
use App\Services\Report\Ticket\TicketRequestSlaReport;
use App\Support\TicketSla;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * Characterization of the two SLA reports' breakdown, summary tiles and grouped sheet over a seeded
 * set that hits every verdict branch; the expected JSON was captured from the Eloquent implementation.
 * Regenerate only on purpose: WRITE_SLA_FIXTURE=1 vendor/bin/phpunit --filter TicketSlaBreakdownParityTest
 */
class TicketSlaBreakdownParityTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    private const NOW = '2026-09-25 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        TicketSla::flush();
    }

    private function reader(): User
    {
        $role = Role::create(['key' => 'rep_parity', 'name' => 'Report Test', 'is_system' => false]);
        foreach ([...$this->reportRights('tickets'), 'tickets.level_hardware', 'tickets.level_software', 'tickets.level_other'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** A deterministic spread of tickets: every status, taken/untaken, deadline missing/equal/past/future. */
    private function seedTickets(): void
    {
        mt_srand(20260925);
        $people = [null, User::factory()->create(['name' => 'Kan'])->id, User::factory()->create(['name' => 'Som'])->id, User::factory()->create(['name' => 'Ant'])->id];
        $requester = Employee::create(['first_name' => 'Anan', 'last_name' => 'User'])->id;
        $categories = ['hardware', 'software', 'software', 'other', 'network'];
        $priorities = [null, 'critical', 'high', 'medium', 'low'];
        $classes = ['standard', 'standard', 'repair_internal', 'repair_vendor'];
        $statuses = ['open', 'in_progress', 'in_progress', 'completed', 'completed', 'canceled'];
        $types = array_map(fn (RequestType $t) => $t->value, RequestType::cases());
        $base = strtotime('2026-09-01 00:00:00');
        $now = strtotime(self::NOW);
        $stamp = fn (int $ts) => date('Y-m-d H:i:s', $ts);
        $offsets = [-1, 0, 1, 0, 600, -600, 7200, 86400];

        for ($i = 0; $i < 260; $i++) {
            $created = $base + mt_rand(0, 24 * 86400) - ($i % 17 === 0 ? 0 : 0);
            $status = $statuses[mt_rand(0, 5)];
            $taken = mt_rand(0, 4) > 0 ? $created + mt_rand(0, 3) * 900 + (mt_rand(0, 3) === 0 ? 86400 : 0) : null;
            $responseDue = mt_rand(0, 9) === 0 ? null : $created + 7200 + $offsets[mt_rand(0, 7)] * (mt_rand(0, 2) === 0 ? 1 : 0);
            $resolved = in_array($status, ['completed', 'canceled'], true) && mt_rand(0, 9) > 0 ? ($taken ?? $created) + mt_rand(0, 200000) : null;
            $resolveDue = match (mt_rand(0, 5)) {
                0 => null,
                1 => $resolved,
                2 => $now,
                3 => $now + 1,
                4 => $now - 1,
                default => $created + mt_rand(3600, 700000),
            };
            $source = mt_rand(0, 2) === 0 ? 'auto_request' : 'manual';
            $ticket = Ticket::factory()->create([
                'requester_id' => $requester,
                'category' => $categories[mt_rand(0, 4)],
                'priority' => $priorities[mt_rand(0, 4)],
                'work_class' => $classes[mt_rand(0, 3)],
                'status' => $status,
                'source' => $source,
                'assignee_id' => $people[mt_rand(0, 3)],
                'created_at' => $stamp($created),
                'responded_at' => $taken === null ? null : $stamp($taken),
                'resolved_at' => $resolved === null ? null : $stamp($resolved),
                'sla_response_due_at' => $responseDue === null ? null : $stamp($responseDue),
                'sla_resolve_due_at' => $resolveDue === null ? null : $stamp($resolveDue),
            ]);

            if ($source === 'auto_request' && $i % 11 !== 0) {
                ServiceRequest::create([
                    'reference' => sprintf('RQ-2026-%04d', $i), 'type' => $types[mt_rand(0, count($types) - 1)], 'origin' => 'direct',
                    'requester_name' => 'Anan', 'title' => "Request {$i}", 'reason' => 'Needed for work.',
                    'status' => 'approved', 'ticket_id' => $ticket->id,
                ]);
            }
        }
    }

    /** @return array<string, mixed> */
    private function capture(): array
    {
        $viewer = $this->reader();
        $range = ['from' => '2026-09-01', 'to' => '2026-09-30'];
        $manual = app(TicketManualSlaReport::class);
        $request = app(TicketRequestSlaReport::class);
        $out = [];

        foreach ([...TicketManualSlaReport::DIMENSIONS, 'bogus'] as $by) {
            $filters = [...$range, 'by' => $by];
            $out["manual.{$by}"] = $manual->breakdown($viewer, $filters);
            $out["manual.{$by}.sheet"] = $manual->exportSections($viewer, $filters);
        }
        $narrow = [...$range, 'by' => 'priority', 'category' => 'software', 'work_class' => 'repair_vendor'];
        $out['manual.narrow'] = $manual->breakdown($viewer, $narrow);
        $out['manual.assignee_none'] = $manual->breakdown($viewer, [...$range, 'by' => 'category', 'assignee' => 'none', 'priority' => 'none']);
        $out['manual.summary'] = array_map(fn ($s) => $s->toArray(), $manual->summary($manual->query($viewer, $range), $range));
        $out['manual.summary_narrow'] = array_map(fn ($s) => $s->toArray(), $manual->summary($manual->query($viewer, $narrow), $narrow));

        $out['request'] = $request->breakdown($viewer, $range);
        $out['request.sheet'] = $request->exportSections($viewer, $range);
        $out['request.type'] = $request->breakdown($viewer, [...$range, 'request_type' => 'email']);
        $out['request.assignee'] = $request->breakdown($viewer, [...$range, 'assignee' => $this->firstAssignee()]);
        $out['request.summary'] = array_map(fn ($s) => $s->toArray(), $request->summary($request->query($viewer, $range), $range));

        return $out;
    }

    private function firstAssignee(): int
    {
        return (int) Ticket::query()->whereNotNull('assignee_id')->value('assignee_id');
    }

    /** @return array<string, array{0: string}> */
    public static function nows(): array
    {
        return ['whole second' => ['2026-09-25 10:00:00'], 'with microseconds' => ['2026-09-25 10:00:00.5']];
    }

    #[DataProvider('nows')]
    public function test_breakdown_summary_and_sheet_match_the_captured_output(string $now): void
    {
        $this->seedTickets();
        $this->travelTo(Carbon::parse($now));

        $actual = json_encode($this->capture(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        $path = __DIR__.'/fixtures/ticket-sla-breakdown-'.(str_contains($now, '.') ? 'micro' : 'whole').'.json';

        if (getenv('WRITE_SLA_FIXTURE') === '1') {
            @mkdir(dirname($path), 0777, true);
            file_put_contents($path, $actual);
        }

        $this->assertFileExists($path);
        $this->assertSame(file_get_contents($path), $actual);
    }
}
