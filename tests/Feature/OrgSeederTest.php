<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Services\Employee\ApprovalChainService;
use Database\Seeders\OrgSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifies that OrgSeeder creates a valid demo org tree and that
 * ApprovalChainService correctly walks manager_id to the root (VP).
 *
 * The tree is six people, one per demo login, in two branches under a Director:
 * IT (super → it) and HR (hr → user). What matters here is that the bottom of
 * each branch can still climb several managers to the VP — that depth is what
 * gives a multi-step request workflow distinct approvers to resolve to.
 */
class OrgSeederTest extends TestCase
{
    use RefreshDatabase;

    private function seedOrg(): void
    {
        $this->seed(OrgSeeder::class);
    }

    /** OrgSeeder seeds the 14 job-title positions (a flat list). */
    public function test_it_seeds_the_14_positions(): void
    {
        $this->seedOrg();

        $this->assertSame(14, Position::count());
        $this->assertSame('Vice President', Position::where('code', 'PST-0001')->value('title'));
        $this->assertSame('Subcontract', Position::where('code', 'PST-0014')->value('title'));
    }

    /** EMP-0001 (Somchai Wattana — Vice President) has no manager: they are the root. */
    public function test_vp_sits_at_root_with_no_manager(): void
    {
        $this->seedOrg();

        $vp = Employee::where('code', 'EMP-0001')->first();
        $this->assertNotNull($vp, 'VP employee EMP-0001 must exist');
        $this->assertNull($vp->manager_id);
    }

    /**
     * The HR branch runs Staff (EMP-0006) → Manager (EMP-0005) → Director (EMP-0002)
     * → VP (EMP-0001). A front-line employee's chain climbs every manager up to the VP.
     */
    public function test_front_line_chain_climbs_all_the_way_to_vp(): void
    {
        $this->seedOrg();

        // EMP-0006 (Waraporn Sri — Staff/Officer, the `user` login) sits at the bottom.
        $staff = Employee::where('code', 'EMP-0006')->first();
        $this->assertNotNull($staff, 'EMP-0006 must exist');

        $chain = app(ApprovalChainService::class)->chainFor($staff);

        // Three distinct approvers, ending at the VP — enough depth for a workflow
        // with several chain steps to resolve each one to a different person.
        $this->assertSame(
            ['EMP-0005', 'EMP-0002', 'EMP-0001'],
            $chain->pluck('code')->all(),
            'The HR branch must climb Manager → Director → VP',
        );
    }

    /** Every demo employee is paired with a login, which is what makes them resolvable
     *  as an approver — WorkflowResolverService skips a manager who cannot sign in. */
    public function test_every_demo_employee_carries_a_login_username(): void
    {
        $this->seedOrg();

        $this->assertSame(6, Employee::count(), 'the demo tree is six people');
        $this->assertSame(
            0,
            Employee::whereNull('username')->count(),
            'an employee without a login can never be resolved as an approver',
        );
    }

    /** Running the seeder twice (idempotent) should not duplicate data or break the chain. */
    public function test_running_twice_is_idempotent(): void
    {
        $this->seedOrg();
        $this->seed(OrgSeeder::class);

        $this->assertSame(6, Employee::count());

        $vp = Employee::where('code', 'EMP-0001')->first();
        $this->assertNull($vp->manager_id);

        $staff = Employee::where('code', 'EMP-0006')->first();
        $chain = app(ApprovalChainService::class)->chainFor($staff);
        $this->assertSame(['EMP-0005', 'EMP-0002', 'EMP-0001'], $chain->pluck('code')->all());
    }
}
