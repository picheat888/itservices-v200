<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The demo dataset is only worth having if it actually lands.
 *
 * Three seeders used to look up employees by codes from an older numbering that
 * OrgSeeder had stopped producing (EMP-1042, EMP-1617, …). Each one skipped the
 * miss silently, so a full seed produced no tickets at all, assets whose holder
 * was a leftover code string in a label column, and no avatars — and nothing
 * failed to say so. These assertions are what make that visible next time.
 */
class DemoSeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    public function test_every_demo_employee_has_a_login_on_both_sides(): void
    {
        $this->assertSame(6, Employee::count());
        $this->assertSame(6, User::whereNotNull('employee_id')->count(), 'each login points at its employee');

        foreach (Employee::all() as $employee) {
            $this->assertTrue(
                $employee->user()->exists(),
                "employee {$employee->code} has no login, so a workflow can never resolve them as an approver"
            );
        }
    }

    public function test_demo_tickets_are_seeded_against_real_requesters(): void
    {
        $this->assertGreaterThan(0, Ticket::count(), 'the ticket seeder skips any row whose requester code is unknown');
        $this->assertSame(
            0,
            Ticket::whereNull('requester_id')->count(),
            'every seeded ticket must resolve to an employee'
        );
    }

    public function test_employee_owned_demo_assets_resolve_to_an_employee(): void
    {
        // A row meant for a person carries the FK; only shared / location-held assets
        // keep a text label in `owner`. A leftover "EMP-…" string there means the
        // lookup missed and the code fell through to the label.
        $this->assertGreaterThan(0, Asset::whereNotNull('owner_employee_id')->count());
        $this->assertSame(
            0,
            Asset::where('owner', 'like', 'EMP-%')->count(),
            'an EMP- code left in the owner label means the employee lookup failed'
        );
    }

    public function test_demo_avatars_are_attached(): void
    {
        $this->assertSame(
            3,
            Employee::whereNotNull('photo_path')->count(),
            'the avatar seeder skips any employee code it cannot find'
        );
    }

    /** The whole demo seed is re-runnable — it is what a developer resets with. */
    public function test_running_the_demo_seed_twice_changes_nothing(): void
    {
        $counts = fn (): array => [
            'employees' => Employee::count(),
            'users' => User::count(),
            'tickets' => Ticket::count(),
            'assets' => Asset::count(),
        ];
        $before = $counts();

        $this->seed(DemoSeeder::class);

        $this->assertSame($before, $counts());
    }
}
