<?php

namespace Tests\Feature;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Jobs\SendTemplatedEmail;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
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

    public function test_the_demo_sends_no_mail(): void
    {
        $this->seedStandard();
        $this->seed(DemoSeeder::class);

        $this->assertSame(0, DB::table('jobs')->count());
        Queue::assertPushed(SendTemplatedEmail::class); // intercepted, not delivered
    }

    public function test_the_demo_covers_every_state(): void
    {
        $this->seedStandard();
        $this->seed(DemoSeeder::class);

        $this->assertOrg();
        $this->assertReferenceAndAccess();
        $this->assertContractsAndAssets();
        $this->assertStock();
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
