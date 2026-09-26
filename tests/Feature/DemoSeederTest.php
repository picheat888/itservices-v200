<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
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
        $this->markTestIncomplete('mail arrives with DemoAssets in Task 4');
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
