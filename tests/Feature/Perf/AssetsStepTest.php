<?php

namespace Tests\Feature\Perf;

use App\Enums\Asset\AssetStatus;
use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use App\Support\Perf\Targets;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Feature tests for the perf Assets step (vendors, models, assets, contracts, transfers, alert ledgers)
class AssetsStepTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
    }

    public function test_asset_status_matches_its_last_transfer(): void
    {
        [, $db] = PerfImport::run([Copy::class, Org::class, Assets::class]);

        $this->assertSame((new Targets(0.1))->of('assets'), $db->table('assets')->count());
        $codes = $db->table('employees')->pluck('code', 'id')->all();
        $valid = array_map(fn (AssetStatus $s): string => $s->value, AssetStatus::cases());

        foreach ($db->table('assets')->get() as $a) {
            $this->assertContains($a->status, $valid);
            match ($a->status) {
                'deployed' => $this->assertTrue($a->owner_employee_id !== null && $a->owned_since !== null, "deployed {$a->id}"),
                'ready' => $this->assertTrue($a->owner_employee_id === null && $a->owner === null && $a->warehouse_id !== null, "ready {$a->id}"),
                'writeoff' => $this->assertNotNull($a->written_off_at),
                default => null,
            };
            if ($a->status === 'writeoff' && $a->returned_to_vendor_at === null) {
                $this->assertNotNull($a->writeoff_reason_id, "writeoff {$a->id} has no reason");
            }
            if ($a->status === 'deployed') {
                $last = $db->table('asset_transfers')->where('asset_id', $a->id)->where('kind', '!=', 'relocate')->orderByDesc('id')->first();
                $this->assertSame('handover', $last->kind);
                $this->assertSame($codes[$a->owner_employee_id], $last->to_owner);
            }
        }
        $this->assertGreaterThan(0, $db->table('asset_transfers')->count());
        $n = $db->table('assets')->count();
        $this->assertGreaterThanOrEqual(0.25 * $n, $db->table('assets')->where('status', 'deployed')->count());
        $this->assertGreaterThanOrEqual(0.05 * $n, $db->table('assets')->where('status', 'ready')->count());
        $this->assertGreaterThan(0, $db->table('assets')->where('status', 'writeoff')->count());
    }

    public function test_full_scale_master_names_respect_unique_indexes(): void
    {
        // The database refuses a duplicate vendor, brand or model name; small scales never drew one
        [, $db] = PerfImport::run([Copy::class, Org::class, Assets::class], 1.0, 20261016);

        $this->assertSame($db->table('vendors')->count(), $db->table('vendors')->distinct()->count('name'));
        $this->assertSame($db->table('brands')->count(), $db->table('brands')->distinct()->count('name'));
        $this->assertSame(40, $db->table('vendors')->count());
        $this->assertSame(50, $db->table('brands')->count());
        $this->assertSame(120, $db->table('asset_models')->count());
        $this->assertSame(2350, $db->table('assets')->count());
        $this->assertSame(300, $db->table('contracts')->count());
    }

    public function test_contract_mix_and_ledgers(): void
    {
        [, $db] = PerfImport::run([Copy::class, Org::class, Assets::class]);

        $n = $db->table('contracts')->count();
        $this->assertSame((new Targets(0.1))->of('contracts'), $n);
        $expired = $db->table('contracts')->whereNotNull('expired_at')->count();
        $this->assertGreaterThanOrEqual(0.2 * $n, $expired);
        $this->assertLessThanOrEqual(0.6 * $n, $expired);
        $overdue = $db->table('contracts')->where('end_date', '<', '2026-10-16')->whereNull('expired_at')->whereNull('cancelled_at')->count();
        $this->assertLessThanOrEqual(0.15 * $n, $overdue);

        foreach ($db->table('contracts')->whereNotNull('expired_at')->get() as $c) {
            foreach ($db->table('assets')->where('contract_id', $c->id)->get() as $a) {
                $at = $a->returned_to_vendor_at ?? $a->written_off_at;
                $this->assertNotNull($at, "asset {$a->id} of expired contract {$c->id} still on the books");
                $this->assertLessThanOrEqual($c->expired_at, $at);
            }
        }

        $this->assertSame(0, $db->table('contract_alert_logs')->whereNotIn('threshold', [150, 120, 90, 60, 45, 30, 7, 0])->count());
        $bells = $db->table('contract_bell_logs')->selectRaw('contract_id, bell_date, count(*) c')->groupBy('contract_id', 'bell_date')->get();
        $this->assertSame(0, $bells->where('c', '>', 1)->count());
        $this->assertSame($n, $db->table('contract_attachments')->count());

        $rented = $db->table('assets')->where('source', 'rented')->get();
        $this->assertGreaterThan(0, $rented->count());
        foreach ($rented as $a) {
            $this->assertNotNull($a->contract_id);
        }
        $this->assertSame(0, $db->table('assets')->where('source', 'purchased')->whereNotNull('contract_id')->count());
    }
}
