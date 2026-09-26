<?php

namespace Tests\Feature;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Jobs\SendTemplatedEmail;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\RequestAttachment;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\AppSetting;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Database\Seeders\Demo\DemoClock;
use Database\Seeders\Demo\DemoContext;
use Database\Seeders\Demo\DemoStep;
use Database\Seeders\DemoSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

/**
 * DemoSeeder: refuses anything but an empty, standard-seeded install, sends no mail,
 * rolls back as a whole, and leaves every module holding every state UAT walks through.
 */
class DemoSeederTest extends TestCase
{
    use RefreshDatabase;

    /** The standard order from the Readme — what DemoSeeder expects to find. */
    private function seedStandard(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(EmployeeSectionSeeder::class);
        $this->seed(MasterDataSeeder::class);
        $this->seed(); // DatabaseSeeder
    }

    public function test_it_refuses_an_install_without_the_standard_seed(): void
    {
        $this->assertStringContainsString('EmployeePositionSeeder', (string) (new DemoSeeder)->refusal());

        $this->seed(DemoSeeder::class);
        $this->assertSame(0, Employee::count());
    }

    public function test_it_refuses_an_install_that_already_has_people(): void
    {
        $this->seedStandard();
        Employee::create(['first_name' => 'Real', 'last_name' => 'Person']);

        $this->assertStringContainsString('empty install', (string) (new DemoSeeder)->refusal());
        $this->seed(DemoSeeder::class);
        $this->assertSame(1, Employee::count());
    }

    public function test_a_failing_step_rolls_back_everything_and_restores_the_clock(): void
    {
        $this->seedStandard();

        try {
            (new DemoSeeder)->runSteps([...DemoSeeder::STEPS, FailingDemoStep::class]);
            $this->fail('the failing step should have thrown');
        } catch (RuntimeException) {
            // expected
        }

        $this->assertSame(0, Employee::count(), 'the demo must roll back as a whole');
        $this->assertFalse(Carbon::hasTestNow(), 'the clock must be real again');
    }

    public function test_it_refuses_an_install_missing_the_master_data(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(EmployeeSectionSeeder::class);
        $this->seed(); // DatabaseSeeder, but no MasterDataSeeder

        $this->assertStringContainsString('MasterDataSeeder', (string) (new DemoSeeder)->refusal());
    }

    public function test_it_refuses_an_install_that_already_holds_business_data(): void
    {
        $this->seedStandard();
        Vendor::create(['name' => 'A real supplier']);

        $this->assertStringContainsString('empty install', (string) (new DemoSeeder)->refusal());
    }

    /**
     * A follow-up step dated "the next day" used to fold back onto the same Friday when
     * that day was a weekend, and then run at an earlier hour than the step before it.
     */
    #[DataProvider('awkwardStarts')]
    public function test_every_event_follows_the_one_before_it_whatever_day_the_run_starts(string $start): void
    {
        Carbon::setTestNow(Carbon::parse($start));
        $this->seedStandard();
        $this->seed(DemoSeeder::class);
        Carbon::setTestNow();

        $this->assertOrdered('tickets', 'responded_at < created_at', $start);
        $this->assertOrdered('tickets', 'resolved_at < responded_at', $start);
        $this->assertOrdered('stock_requests', 'approved_at < created_at OR rejected_at < created_at', $start);
        $this->assertOrdered('stock_requests', 'fulfilled_at < approved_at', $start);
        $this->assertOrdered('service_requests', 'completed_at < approved_at', $start);

        $this->assertSame(0, DB::table('ticket_updates')->join('tickets', 'tickets.id', '=', 'ticket_updates.ticket_id')
            ->whereColumn('ticket_updates.created_at', '<', 'tickets.responded_at')->count(), "{$start}: a progress note before the case was picked up");
        $this->assertSame(0, DB::table('request_approvals')->join('service_requests', 'service_requests.id', '=', 'request_approvals.service_request_id')
            ->whereColumn('request_approvals.acted_at', '<', 'service_requests.created_at')->count(), "{$start}: a signature before the submit");
        $this->assertSame(0, DB::table('request_approvals')->whereNotNull('acted_at')->whereColumn('acted_at', '<', 'became_current_at')->count(), "{$start}: a signature before its step was current");
    }

    /** @return array<string, array{string}> */
    public static function awkwardStarts(): array
    {
        return ['saturday morning' => ['next saturday 10:00'], 'monday before office hours' => ['next monday 07:00']];
    }

    private function assertOrdered(string $table, string $backwards, string $start): void
    {
        $this->assertSame(0, DB::table($table)->whereRaw($backwards)->count(), "{$start}: {$table} has {$backwards}");
    }

    public function test_the_demo_sends_no_mail(): void
    {
        $this->seedStandard();
        $this->seed(DemoSeeder::class);

        $this->assertSame(0, DB::table('jobs')->count());
        Queue::assertPushed(SendTemplatedEmail::class); // intercepted, not delivered

        // The CCTV evidence went to the (faked) disk, and no temp copy was left behind.
        $this->assertNotEmpty(Storage::disk('local')->allFiles('requests'));
        $this->assertSame($this->tempPdfCountBefore, $this->tempPdfCount(), 'temp PDFs left behind');
    }

    private int $tempPdfCountBefore = 0;

    private function tempPdfCount(): int
    {
        return count(glob(sys_get_temp_dir().DIRECTORY_SEPARATOR.'dem*') ?: []);
    }

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local'); // CCTV attachments must never land in the real app storage
        $this->tempPdfCountBefore = $this->tempPdfCount();
    }

    public function test_the_demo_covers_every_state(): void
    {
        $this->seedStandard();
        $this->seed(DemoSeeder::class);

        $this->assertOrg();
        $this->assertReferenceAndAccess();
        $this->assertContractsAndAssets();
        $this->assertStock();
        $this->assertTickets();
        $this->assertRequests();
        $this->assertAuditAndAccounts();
    }

    private function assertRequests(): void
    {
        $requests = ServiceRequest::all();
        $this->assertGreaterThanOrEqual(38, $requests->count());
        foreach (RequestType::cases() as $type) {
            $this->assertTrue($requests->contains(fn (ServiceRequest $r) => $r->type === $type), "no {$type->value} request");
        }
        foreach (RequestStatus::cases() as $status) {
            $this->assertTrue($requests->contains(fn (ServiceRequest $r) => $r->status === $status), "no {$status->value} request");
        }
        $this->assertTrue(ServiceRequest::where('origin', 'onboarding')->exists(), 'no onboarding request');
        $this->assertTrue(RequestApproval::where('status', 'current')->where('became_current_at', '<=', now()->subDays(3))->exists(), 'no stalled step');
        $this->assertTrue(RequestApproval::where('status', 'current')->where('actor_type', 'department')->exists(), 'no request waiting on a department');
        $this->assertTrue(RequestAttachment::exists(), 'no request attachment');
        $this->assertTrue(
            ServiceRequest::where('status', 'approved')->whereHas('ticket', fn ($q) => $q->whereIn('status', ['open', 'in_progress']))->exists(),
            'no approved request with its case still open',
        );
        $this->assertTrue(ServiceRequest::where('status', 'completed')->whereNull('ticket_id')->exists(), 'no request completed by hand');
    }

    /** The demo leaves the same audit trail the screens would have. */
    private function assertAuditAndAccounts(): void
    {
        foreach ([
            'Created ticket', 'Took ticket', 'Assigned ticket', 'Updated ticket progress', 'Resolved ticket',
            'Registered asset', 'Transferred asset', 'Accepted asset', 'Requested asset return', 'Received asset', 'Bulk asset writeoff',
            'Created contract', 'Cancelled contract', 'Expired contract',
            'Submitted service request', 'Approved service request step', 'Rejected service request', 'Cancelled service request', 'Completed service request',
            'Added member to file share', 'Added member to software',
        ] as $action) {
            $this->assertTrue(AuditLog::where('action', $action)->exists(), "no audit row '{$action}'");
        }
        $this->assertSame(0, AuditLog::where('action', 'Submitted service request')->where('user_name', 'System')->count(), 'a submit with no actor');
        $this->assertSame(0, AccessMembership::whereNull('granted_by')->count(), 'a grant with no granter');

        // Freshly set passwords, so a password-expiry policy does not lock the demo out.
        $this->assertSame(0, User::where('username', 'like', '%.demo')->where('password_changed_at', '<', now()->subDay())->count());
    }

    private function assertTickets(): void
    {
        $this->assertGreaterThanOrEqual(55, Ticket::count());
        foreach (TicketStatus::cases() as $status) {
            $this->assertTrue(Ticket::where('status', $status->value)->exists(), "no {$status->value} ticket");
        }
        foreach (TicketCategory::cases() as $category) {
            $this->assertTrue(Ticket::where('category', $category->value)->exists(), "no {$category->value} ticket");
        }
        $this->assertTrue(Ticket::where('status', 'in_progress')->where('sla_resolve_due_at', '<', now())->exists(), 'no breached open case');
        $this->assertTrue(Ticket::where('status', 'completed')->whereColumn('resolved_at', '>', 'sla_resolve_due_at')->exists(), 'no late completion');
        $this->assertTrue(Ticket::where('status', 'completed')->whereColumn('resolved_at', '<=', 'sla_resolve_due_at')->exists(), 'no on-time completion');
        $this->assertTrue(Ticket::where('status', 'open')->where('sla_response_due_at', '<', now())->exists(), 'no case past its response target');
        $this->assertTrue(Ticket::where('work_class', 'repair_vendor')->exists());
        $this->assertFalse(Ticket::where('created_at', '>', now())->exists(), 'a ticket in the future');
    }

    private function assertStock(): void
    {
        $items = StockItem::all();
        $this->assertGreaterThanOrEqual(25, $items->count());
        foreach (['out', 'low', 'over'] as $state) {
            $this->assertTrue($items->contains(fn (StockItem $item) => $item->status() === $state), "no {$state} item");
        }
        $this->assertGreaterThanOrEqual(2, StockLot::query()->distinct()->count('unit_cost'));
        $this->assertTrue(StockMovement::where('type', 'transfer')->exists());
        $this->assertTrue(StockMovement::where('type', 'return')->exists());
        foreach (['pending', 'approved', 'fulfilled', 'rejected'] as $status) {
            $this->assertTrue(StockRequest::where('status', $status)->exists(), "no {$status} stock request");
        }
        $this->assertTrue(StockCount::where('status', 'draft')->exists());
        $this->assertTrue(StockCount::where('status', 'committed')->exists());
    }

    private function assertContractsAndAssets(): void
    {
        $contracts = Contract::all();
        $this->assertGreaterThanOrEqual(15, $contracts->count());
        foreach (['active', 'expired', 'cancelled'] as $status) {
            $this->assertTrue($contracts->contains(fn (Contract $c) => $c->status === $status), "no {$status} contract");
        }
        $this->assertTrue($contracts->contains(fn (Contract $c) => $c->status === 'active' && $c->daysRemaining() <= 7), 'none due in 7 days');
        $this->assertTrue($contracts->contains(fn (Contract $c) => $c->status === 'active' && $c->daysRemaining() > 7 && $c->daysRemaining() <= 30), 'none due in 30 days');
        foreach (ContractType::cases() as $type) {
            $this->assertTrue($contracts->contains(fn (Contract $c) => $c->type === $type), "no {$type->value} contract");
        }

        $this->assertGreaterThanOrEqual(80, Asset::count());
        foreach (AssetStatus::cases() as $status) {
            $this->assertTrue(Asset::where('status', $status->value)->exists(), "no {$status->value} asset");
        }
        $this->assertTrue(Asset::where('source', 'rented')->whereNotNull('contract_id')->exists());
        $staff = User::where('username', 'staff.demo')->first()->employee_id;
        $this->assertSame(2, Asset::where('owner_employee_id', $staff)->where('status', 'deployed')->count());
        $this->assertSame(1, Asset::where('owner_employee_id', $staff)->where('status', 'pending_acceptance')->count());
        $this->assertTrue(AssetTransfer::where('kind', 'relocate')->exists());
        $this->assertTrue(AssetTransfer::where('kind', 'return')->exists());
    }

    private function assertReferenceAndAccess(): void
    {
        $this->assertGreaterThanOrEqual(8, Vendor::count());
        $this->assertGreaterThanOrEqual(6, Location::count());
        $this->assertGreaterThanOrEqual(12, AssetModel::count());
        $this->assertNotNull(FileShare::where('name', 'Production Share')->value('owner_employee_id'));
        $this->assertNotNull(EmailGroup::where('email', 'production@example.com')->value('owner_employee_id'));
        $this->assertGreaterThanOrEqual(10, AccessMembership::whereNull('revoked_at')->count());
    }

    private function assertOrg(): void
    {
        $this->assertGreaterThanOrEqual(38, Employee::count());
        $this->assertSame(11, Employee::whereNotNull('department_id')->distinct()->count('department_id'));

        foreach (['staff.demo', 'sup.demo', 'mgr.demo', 'vp.demo', 'qc.demo', 'se.demo', 'it.lead', 'it.tech', 'hr.demo'] as $username) {
            $user = User::where('username', $username)->first();
            $this->assertNotNull($user, "{$username} missing");
            $this->assertTrue(Hash::check(DemoSeeder::PASSWORD, $user->password));
            $this->assertFalse($user->must_change_password);
            $this->assertNotNull($user->role_id);
        }

        $this->assertSame('admin', User::where('username', 'it.tech')->first()->role->key);
        $this->assertSame('hr', User::where('username', 'hr.demo')->first()->role->key);
        $this->assertNotSame('0', AppSetting::get('default_employee_group_id', '0'));

        $this->assertSame(1, Employee::where('status', 'resigned')->count());
        $this->assertNull(Employee::where('first_name', 'Mongkol')->value('manager_id'), 'the no-manager case');
    }

    public function test_a_weekend_morning_run_leaves_nothing_in_the_future(): void
    {
        $sunday = Carbon::parse('next sunday 06:30');
        Carbon::setTestNow($sunday);
        $this->seedStandard();
        $this->seed(DemoSeeder::class);
        Carbon::setTestNow($sunday); // DemoSeeder resets the clock; pin it again to compare

        foreach (['employees', 'assets', 'asset_transfers', 'contracts', 'stock_movements', 'tickets', 'ticket_updates', 'service_requests', 'request_approvals', 'notifications'] as $table) {
            $this->assertSame(0, DB::table($table)->where('created_at', '>', $sunday)->count(), "{$table} has rows in the future");
        }
        $this->assertSame(0, DB::table('stock_movements')->where('moved_at', '>', $sunday)->count(), 'a stock movement in the future');

        Carbon::setTestNow();
    }

    public function test_the_clock_never_lands_in_the_future_or_on_a_weekend(): void
    {
        $sunday = Carbon::parse('2026-09-27 06:30'); // a Sunday, before office hours
        $clock = new DemoClock($sunday);

        $this->assertTrue($clock->daysAgo(2)->isFriday());
        $this->assertTrue($clock->daysAgo(0)->lessThanOrEqualTo($sunday));
        $this->assertTrue($clock->daysAgo(1)->isWeekday());
    }
}

/** A step that always fails — proves the transaction and the clock reset. */
class FailingDemoStep implements DemoStep
{
    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $clock->at($clock->daysAgo(10));

        throw new RuntimeException('boom');
    }
}
