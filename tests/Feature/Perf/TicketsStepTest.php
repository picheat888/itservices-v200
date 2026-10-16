<?php

namespace Tests\Feature\Perf;

use App\Enums\Request\RequestType;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Support\Perf\Access;
use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use App\Support\Perf\Requests;
use App\Support\Perf\Stock;
use App\Support\Perf\Tickets;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Database\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Feature tests for the perf Tickets step (auto and manual tickets, updates, attachments, SLA deadlines)
class TicketsStepTest extends TestCase
{
    use RefreshDatabase;

    private Connection $db;

    private $ctx;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
        [$this->ctx, $this->db] = PerfImport::run([Copy::class, Org::class, Assets::class, Stock::class, Access::class, Requests::class, Tickets::class], 0.1);
    }

    public function test_status_and_timestamps_are_consistent(): void
    {
        $valid = array_map(fn (TicketStatus $s): string => $s->value, TicketStatus::cases());
        $itUsers = $this->ctx->reg->get('it_user_ids');
        $shortCodes = [];
        foreach (TicketCategory::cases() as $c) {
            $shortCodes[$c->value] = $c->shortCode();
        }

        $this->assertSame(6000, $this->db->table('tickets')->count());
        foreach ($this->db->table('tickets')->get() as $t) {
            $this->assertContains($t->status, $valid);
            $this->assertMatchesRegularExpression('/^TKT-(SW|HW|NW|CCTV|TEL|OTH)-\d{6}-\d{3,}$/', $t->ticket_no);
            $this->assertStringStartsWith('TKT-'.$shortCodes[$t->category].'-', $t->ticket_no);
            $this->assertGreaterThan($t->created_at, $t->sla_response_due_at);
            $this->assertGreaterThan($t->created_at, $t->sla_resolve_due_at);
            $this->assertContains($t->sla_response_alert_level, [null, 'near_due', 'over_sla']);
            $this->assertContains($t->sla_resolve_alert_level, [null, 'near_due', 'over_sla']);
            $this->assertLessThanOrEqual('2026-10-16 08:00:00', $t->updated_at);

            if ($t->status === 'open') {
                $this->assertNull($t->assignee_id);
                $this->assertNull($t->responded_at);
                $this->assertNull($t->resolved_at);
            } else {
                $this->assertContains($t->assignee_id, $itUsers);
                $this->assertGreaterThanOrEqual($t->created_at, $t->responded_at);
            }
            if (in_array($t->status, ['completed', 'canceled'], true)) {
                $this->assertNotNull($t->resolved_at);
                $this->assertNotNull($t->resolution);
                $this->assertGreaterThanOrEqual($t->responded_at, $t->resolved_at);
            }
        }
        $this->assertSame($this->db->table('tickets')->count(), $this->db->table('tickets')->distinct()->count('ticket_no'));
    }

    public function test_auto_request_tickets_carry_no_priority(): void
    {
        // The app refuses a priority on a case opened from a request
        $this->assertSame(0, $this->db->table('tickets')->where('source', 'auto_request')->whereNotNull('priority')->count());
        $this->assertGreaterThan(0, $this->db->table('tickets')->where('source', 'manual')->whereNotNull('priority')->count());
    }

    public function test_auto_tickets_mirror_their_requests(): void
    {
        $plans = $this->ctx->reg->get('auto_tickets');
        $this->assertNotEmpty($plans);
        $tickets = $this->db->table('tickets')->get()->keyBy('id');
        $requests = $this->db->table('service_requests')->get()->keyBy('id');

        foreach ($plans as $p) {
            $r = $requests[$p['request_id']];
            $this->assertNotNull($r->ticket_id, "request {$r->reference} has no ticket");
            $t = $tickets[$r->ticket_id];
            $this->assertSame('auto_request', $t->source);
            $this->assertStringStartsWith('['.$r->reference.']', $t->subject);
            $this->assertSame(RequestType::from($r->type)->ticketCategory()->value, $t->category);
            $this->assertSame($t->created_at, $r->approved_at);
            match ($r->status) {
                'completed' => $this->assertSame('completed', $t->status),
                'cancelled' => $this->assertSame('canceled', $t->status),
                'approved' => $this->assertContains($t->status, ['open', 'in_progress']),
            };
        }
        $this->assertSame(count($plans), $tickets->where('source', 'auto_request')->count());
        $this->assertSame(0, $requests->whereNotNull('ticket_id')->count() - count($plans));
    }

    public function test_every_month_has_tickets_and_mix_holds(): void
    {
        $n = $this->db->table('tickets')->count();
        $months = $this->db->table('tickets')->get()->map(fn ($t) => substr($t->created_at, 0, 7))->unique();
        $this->assertCount(36, $months);

        $completed = $this->db->table('tickets')->where('status', 'completed')->count();
        $this->assertGreaterThanOrEqual(0.82 * $n, $completed);
        $this->assertLessThanOrEqual(0.95 * $n, $completed);
        $this->assertSame(0, $this->db->table('tickets')->whereIn('status', ['open', 'in_progress'])->where('created_at', '<', '2026-09-16')->count());

        $manual = $this->db->table('tickets')->where('source', 'manual')->count();
        $this->assertEqualsWithDelta(0.70, $manual / $n, 0.08);
    }

    public function test_updates_and_attachments(): void
    {
        foreach ($this->db->table('ticket_updates')->get() as $u) {
            $this->assertContains($u->kind, ['note', 'forwarded']);
            $this->assertNotNull($u->author_name);
            if ($u->kind === 'forwarded') {
                $meta = json_decode($u->meta, true);
                $this->assertArrayHasKey('from', $meta);
                $this->assertArrayHasKey('to', $meta);
            }
        }
        $this->assertGreaterThan(1.5 * $this->db->table('tickets')->count(), $this->db->table('ticket_updates')->count());

        $n = $this->db->table('tickets')->count();
        $withFile = $this->db->table('ticket_attachments')->distinct()->count('ticket_id');
        $this->assertEqualsWithDelta(0.15, $withFile / $n, 0.06);
        $this->assertGreaterThan(0, $this->db->table('ticket_attachments')->whereNotNull('request_attachment_id')->count());
    }
}
