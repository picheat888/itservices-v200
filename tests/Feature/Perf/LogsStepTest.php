<?php

namespace Tests\Feature\Perf;

use App\Models\Report\ReportExport;
use App\Models\Ticket\Ticket;
use App\Notifications\ContractExpiryNotification;
use App\Notifications\RequestWorkflowNotification;
use App\Notifications\StockAlertNotification;
use App\Notifications\TicketCreatedNotification;
use App\Notifications\TicketOwnerNotification;
use App\Support\Perf\Access;
use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Logs;
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

// Feature tests for the perf Logs step (notifications, email logs, audit logs, report rows)
class LogsStepTest extends TestCase
{
    use RefreshDatabase;

    private Connection $db;

    private $ctx;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
        [$this->ctx, $this->db] = PerfImport::run([Copy::class, Org::class, Assets::class, Stock::class, Access::class, Requests::class, Tickets::class, Logs::class], 0.1);
    }

    public function test_notification_payloads_match_the_app(): void
    {
        $users = $this->db->table('users')->pluck('id')->all();
        $expected = [
            TicketCreatedNotification::class => ['type', 'ticket_id', 'ticket_no', 'subject'],
            TicketOwnerNotification::class => ['type', 'event', 'ticket_id', 'ticket_no', 'subject', 'by'],
            RequestWorkflowNotification::class => ['type', 'subtype', 'service_request_id', 'reference', 'title', 'request_type', 'origin', 'requester_name', 'step_label', 'actor_name', 'remark', 'ticket_id', 'ticket_no', 'employee_id', 'employee_name', 'stalled_days'],
            StockAlertNotification::class => ['type', 'subtype', 'stock_item_id', 'sku', 'name', 'qty'],
            ContractExpiryNotification::class => ['type', 'subtype', 'contract_id', 'contract_code', 'contract_vendor', 'contract_name', 'days_remaining'],
        ];

        $seen = [];
        $ids = [];
        foreach ($this->db->table('notifications')->get() as $n) {
            $this->assertTrue(class_exists($n->type), "{$n->type} is not a class");
            $this->assertSame('App\Models\User', $n->notifiable_type);
            $this->assertContains($n->notifiable_id, $users);
            $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $n->id);
            $this->assertLessThanOrEqual('2026-10-16 08:00:00', $n->created_at);
            $ids[$n->id] = true;
            $seen[$n->type] = true;
            if (isset($expected[$n->type])) {
                $this->assertEqualsCanonicalizing($expected[$n->type], array_keys(json_decode($n->data, true)), $n->type);
            }
        }
        $this->assertCount($this->db->table('notifications')->count(), $ids);
        foreach ([TicketCreatedNotification::class, TicketOwnerNotification::class, RequestWorkflowNotification::class] as $type) {
            $this->assertArrayHasKey($type, $seen);
        }

        $total = $this->db->table('notifications')->count();
        $unread = $this->db->table('notifications')->whereNull('read_at')->count();
        $this->assertGreaterThan(0.08 * $total, $unread);
        $this->assertLessThan(0.25 * $total, $unread);
    }

    public function test_email_and_audit_logs(): void
    {
        $keys = $this->ctx->reg->get('email_template_keys');
        $emails = $this->db->table('email_logs')->get();
        $this->assertGreaterThan(0, $emails->count());
        foreach ($emails as $e) {
            $this->assertContains($e->template_key, $keys);
            $this->assertContains($e->status, ['sent', 'failed', 'skipped']);
            if ($e->status === 'skipped') {
                $this->assertNull($e->to_email);
                $this->assertSame('Recipient has no email address', $e->error);
            }
        }
        $this->assertGreaterThanOrEqual(0.9 * $emails->count(), $emails->where('status', 'sent')->count());
        $this->assertArrayNotHasKey('updated_at', (array) $emails->first());

        $actions = $this->db->table('audit_logs')->pluck('action')->unique()->all();
        foreach (['Created ticket', 'Took ticket', 'Resolved ticket', 'Transferred asset', 'Stock receive', 'Signed in', 'Signed out', 'Submitted service request', 'Approved service request step'] as $action) {
            $this->assertContains($action, $actions);
        }
        $this->assertSame(Ticket::class, $this->db->table('audit_logs')->where('action', 'Created ticket')->value('subject_type'));
        $this->assertSame('software', $this->db->table('audit_logs')->where('action', 'Created software')->value('subject_type'));

        $total = $this->db->table('audit_logs')->count();
        $sign = $this->db->table('audit_logs')->whereIn('action', ['Signed in', 'Signed out'])->count();
        $this->assertEqualsWithDelta(0.40, $sign / $total, 0.03);
        foreach ($this->db->table('audit_logs')->whereNotNull('details')->limit(500)->pluck('details') as $details) {
            $this->assertNotNull(json_decode($details, true));
        }
    }

    public function test_report_rows(): void
    {
        $this->assertSame(50, $this->db->table('report_exports')->count());
        foreach ($this->db->table('report_exports')->get() as $r) {
            $this->assertContains($r->status, [ReportExport::QUEUED, ReportExport::RUNNING, ReportExport::READY, ReportExport::FAILED]);
            $this->assertContains($r->format, ['xlsx', 'pdf']);
        }
        $this->assertSame(2, $this->db->table('report_schedules')->count());
        foreach ($this->db->table('report_schedules')->where('active', 1)->get() as $s) {
            $this->assertGreaterThan('2026-10-16 08:00:00', $s->next_run_at);
        }
    }
}
