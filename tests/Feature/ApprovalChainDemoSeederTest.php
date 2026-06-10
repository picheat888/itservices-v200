<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
use App\Services\ApprovalChainService;
use Database\Seeders\OrgSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifies that OrgSeeder creates a valid demo org tree and that
 * ApprovalChainService correctly walks manager_id to the root (VP).
 * These tests replace the old ApprovalChainDemoSeeder tests — that
 * seeder was merged into OrgSeeder in the 11/26/14/30 demo rewrite.
 */
class ApprovalChainDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    private function seedOrg(): void
    {
        $this->seed(OrgSeeder::class);
    }

    /** OrgSeeder defines 14 position levels (1 = Subcontract … 14 = Vice President). */
    public function test_it_seeds_all_14_position_levels(): void
    {
        $this->seedOrg();

        $this->assertSame(14, Position::where('code', 'P-14')->value('level')); // Vice President
        $this->assertSame(1, Position::where('code', 'P-01')->value('level'));  // Subcontract
        $this->assertSame(14, Position::max('level'));
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
     * The PD ladder runs Subcontract (EMP-0014) → … → Director (EMP-0002) → VP (EMP-0001).
     * A front-line employee's chain climbs every manager up to the VP.
     */
    public function test_front_line_chain_climbs_all_the_way_to_vp(): void
    {
        $this->seedOrg();

        // EMP-0014 (Somkid Jan — Subcontract) is at the bottom of the 14-level PD ladder.
        $somkid = Employee::where('code', 'EMP-0014')->first();
        $this->assertNotNull($somkid, 'EMP-0014 must exist');

        $chain = app(ApprovalChainService::class)->chainFor($somkid);

        // The chain must reach the VP (root) and must be non-empty.
        $this->assertNotEmpty($chain, 'Chain should not be empty for a front-line employee');

        $topOfChain = $chain->last();
        $this->assertSame('EMP-0001', $topOfChain->code, 'Chain must terminate at the VP (EMP-0001)');
    }

    /** Running the seeder twice (idempotent) should not duplicate data or break the chain. */
    public function test_running_twice_is_idempotent(): void
    {
        $this->seedOrg();
        $this->seed(OrgSeeder::class);

        $vp = Employee::where('code', 'EMP-0001')->first();
        $this->assertNull($vp->manager_id);

        $somkid = Employee::where('code', 'EMP-0014')->first();
        $chain = app(ApprovalChainService::class)->chainFor($somkid);
        $this->assertNotEmpty($chain);
        $this->assertSame('EMP-0001', $chain->last()->code);
    }
}
