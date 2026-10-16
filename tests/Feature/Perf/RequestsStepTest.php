<?php

namespace Tests\Feature\Perf;

use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Support\Perf\Access;
use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use App\Support\Perf\Requests;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Database\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Feature tests for the perf Requests step (service requests, approval chains, auto-ticket plans)
class RequestsStepTest extends TestCase
{
    use RefreshDatabase;

    private Connection $db;

    private $ctx;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
        [$this->ctx, $this->db] = PerfImport::run([Copy::class, Org::class, Assets::class, Access::class, Requests::class], 0.1);
    }

    public function test_pending_requests_have_one_current_step(): void
    {
        $this->assertSame(2400, $this->db->table('service_requests')->count());
        $kinds = ['approval', 'completion'];
        $actors = array_map(fn (StepActorType $t): string => $t->value, StepActorType::cases());
        $skips = array_map(fn (ApprovalSkipReason $r): string => $r->value, ApprovalSkipReason::cases());

        $byRequest = $this->db->table('request_approvals')->orderBy('service_request_id')->orderBy('position')->get()->groupBy('service_request_id');
        foreach ($this->db->table('service_requests')->get() as $r) {
            $rows = $byRequest[$r->id];
            $this->assertSame(range(1, $rows->count()), $rows->pluck('position')->map(fn ($p) => (int) $p)->all(), "positions of {$r->reference}");
            foreach ($rows as $a) {
                $this->assertContains($a->kind, $kinds);
                $this->assertContains($a->actor_type, $actors);
                $this->assertTrue($a->skip_reason === null || in_array($a->skip_reason, $skips, true));
            }
            $current = $rows->where('status', 'current');
            switch ($r->status) {
                case 'pending':
                    $this->assertCount(1, $current, "pending {$r->reference}");
                    $expected = $rows->first(fn ($a) => ! in_array($a->status, ['approved', 'skipped'], true));
                    $this->assertSame($expected->id, $current->first()->id);
                    break;
                case 'approved':
                    $this->assertCount(1, $current);
                    $this->assertSame('completion', $current->first()->kind);
                    break;
                default:
                    $this->assertCount(0, $current, "{$r->status} {$r->reference}");
            }
        }
    }

    public function test_chain_steps_resolve_to_the_requester_line(): void
    {
        $managers = $this->db->table('employees')->pluck('manager_id', 'id')->all();
        $emp = $this->db->table('service_requests')->pluck('employee_id', 'id')->all();
        $checked = 0;
        foreach ($this->db->table('request_approvals')->where('actor_type', 'chain')->whereNotNull('approver_employee_id')->get() as $a) {
            $line = [];
            for ($cur = $managers[$emp[$a->service_request_id]] ?? null; $cur !== null && count($line) < 12; $cur = $managers[$cur] ?? null) {
                $line[] = $cur;
            }
            $this->assertContains($a->approver_employee_id, $line, "approval {$a->id} is not on the manager line");
            $checked++;
        }
        $this->assertGreaterThan(100, $checked);
    }

    public function test_auto_ticket_plans_and_field_display(): void
    {
        $plans = $this->ctx->reg->get('auto_tickets');
        $this->assertNotEmpty($plans);
        $requests = $this->db->table('service_requests')->get()->keyBy('id');
        foreach ($plans as $p) {
            $r = $requests[$p['request_id']];
            $this->assertSame(1, (int) $r->auto_ticket);
            $this->assertNotSame('other', $r->type);
            $this->assertContains($p['outcome'], ['completed', 'cancelled', 'open']);
            $this->assertSame(RequestType::from($r->type)->ticketCategory()->value, $p['category']);
            $this->assertSame($p['outcome'] === 'completed', $r->status === 'completed');
        }
        $this->assertSame(0, $this->db->table('service_requests')->where('type', 'other')->where('auto_ticket', 1)->count());

        $n = $requests->count();
        $this->assertGreaterThanOrEqual(0.75 * $n, $requests->where('status', 'completed')->count());
        $this->assertLessThanOrEqual(0.08 * $n, $requests->where('status', 'pending')->count());
        foreach ($requests as $r) {
            $this->assertMatchesRegularExpression('/^RQ-\d{4}-\d{4,}$/', $r->reference);
            if (in_array($r->type, ['computer', 'hardware', 'mobile', 'email', 'social', 'fileshare', 'mailgroup', 'software', 'telephone'], true)) {
                $fields = json_decode($r->fields, true);
                $this->assertNotEmpty($fields['_display'], "{$r->type} has no display rows");
                foreach ($fields['_display'] as $row) {
                    $this->assertSame(['key', 'label_en', 'label_th', 'value', 'value_th', 'mono'], array_keys($row));
                }
            }
        }
        $this->assertGreaterThan(0, $this->db->table('request_attachments')->count());
    }
}
