<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\Position;
use App\Services\ApprovalChainService;
use Database\Seeders\ApprovalChainDemoSeeder;
use Database\Seeders\OrgSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalChainDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    private function seedOrg(): void
    {
        $this->seed(OrgSeeder::class);
        $this->seed(ApprovalChainDemoSeeder::class);
    }

    public function test_it_sets_position_levels_and_the_ceiling(): void
    {
        $this->seedOrg();

        $this->assertSame(5, Position::where('code', 'P-005')->value('level')); // Operations Director
        $this->assertSame(1, Position::where('code', 'P-002')->value('level')); // SMT Operator
        $this->assertSame('5', AppSetting::get('approval_ceiling_level'));
    }

    public function test_operations_director_sits_at_the_top(): void
    {
        $this->seedOrg();

        $director = Employee::where('code', 'EMP-1213')->first();
        $this->assertNull($director->manager_id);
    }

    public function test_front_line_chain_climbs_to_the_vp_ceiling(): void
    {
        $this->seedOrg();

        // Pongsak (SMT Operator) -> Krittin (Plant Manager) -> Decha (Operations Director, ceiling).
        $pongsak = Employee::where('code', 'EMP-1834')->first();
        $chain = app(ApprovalChainService::class)->chainFor($pongsak);

        $this->assertSame(['Krittin Adisai', 'Decha Tularak'], $chain->pluck('name')->all());
    }

    public function test_running_twice_is_idempotent(): void
    {
        $this->seedOrg();
        $this->seed(ApprovalChainDemoSeeder::class);

        $pongsak = Employee::where('code', 'EMP-1834')->first();
        $chain = app(ApprovalChainService::class)->chainFor($pongsak);

        $this->assertSame(['Krittin Adisai', 'Decha Tularak'], $chain->pluck('name')->all());
    }
}
