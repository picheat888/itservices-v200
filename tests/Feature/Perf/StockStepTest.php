<?php

namespace Tests\Feature\Perf;

use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use App\Support\Perf\Stock;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Database\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Feature tests for the perf Stock step (items, movements, lots, balances, requests, counts, serials, alerts)
class StockStepTest extends TestCase
{
    use RefreshDatabase;

    private Connection $db;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
        [, $this->db] = PerfImport::run([Copy::class, Org::class, Assets::class, Stock::class]);
    }

    /** @return array<string, int> */
    private function warehouseIds(): array
    {
        return $this->db->table('warehouses')->pluck('id', 'name')->all();
    }

    public function test_balances_and_lots_match_movements(): void
    {
        $wh = $this->warehouseIds();
        $expected = [];
        $replay = [];
        foreach ($this->db->table('stock_movements')->orderBy('moved_at')->orderBy('id')->get() as $m) {
            $deltas = match ($m->type) {
                'receive', 'return', 'adjust_up' => [[$m->to_label, $m->qty]],
                'issue', 'adjust_down' => [[$m->from_label, -$m->qty]],
                'transfer' => [[$m->from_label, -$m->qty], [$m->to_label, $m->qty]],
            };
            foreach ($deltas as [$label, $delta]) {
                $key = $m->stock_item_id.'|'.($wh[$label] ?? 0);
                $replay[$key] = ($replay[$key] ?? 0) + $delta;
                $this->assertGreaterThanOrEqual(0, $replay[$key], "negative stock for {$key} at movement {$m->id}");
            }
        }
        $expected = array_filter($replay);

        $actual = [];
        foreach ($this->db->table('stock_balances')->get() as $b) {
            if ($b->qty !== 0) {
                $actual[$b->stock_item_id.'|'.$b->warehouse_id] = $b->qty;
            }
        }
        ksort($expected);
        ksort($actual);
        $this->assertSame($expected, $actual);

        foreach ($this->db->table('stock_items')->get() as $item) {
            $this->assertSame((int) $item->current_stock, (int) $this->db->table('stock_balances')->where('stock_item_id', $item->id)->sum('qty'));
            $this->assertSame((int) $item->current_stock, (int) $this->db->table('stock_lots')->where('stock_item_id', $item->id)->sum('qty_remaining'));
        }
        $this->assertSame(0, $this->db->table('stock_lots')->whereColumn('qty_remaining', '>', 'qty_received')->count());
        $this->assertGreaterThan(0, $this->db->table('stock_movements')->where('type', 'transfer')->count());
        $this->assertGreaterThan(0, $this->db->table('stock_movements')->where('type', 'return')->count());
    }

    public function test_document_numbers_and_request_links(): void
    {
        foreach ($this->db->table('stock_movements')->get() as $m) {
            if ($m->doc_no === null) {
                $this->assertContains($m->type, ['adjust_up', 'adjust_down']);
                $this->assertStringStartsWith('SC-', $m->reference);
            } else {
                $this->assertMatchesRegularExpression('/^(RCV|ISS|RET|TRF)-\d{4}-\d{3,}$/', $m->doc_no);
            }
        }
        $this->assertSame($this->db->table('stock_movements')->whereNotNull('doc_no')->count(), $this->db->table('stock_movements')->whereNotNull('doc_no')->distinct()->count('doc_no'));

        $fulfilled = $this->db->table('stock_requests')->where('status', 'fulfilled')->pluck('reference')->all();
        $this->assertNotEmpty($fulfilled);
        $issueRefs = $this->db->table('stock_movements')->where('type', 'issue')->pluck('reference')->unique()->all();
        sort($fulfilled);
        sort($issueRefs);
        $this->assertSame($fulfilled, $issueRefs);

        $refs = $this->db->table('stock_requests')->pluck('reference');
        foreach ($refs as $ref) {
            $this->assertMatchesRegularExpression('/^REQ-\d{4}-\d{4}$/', $ref);
        }
        $this->assertSame($refs->count(), $refs->unique()->count());
        foreach ($this->db->table('stock_counts')->pluck('reference') as $ref) {
            $this->assertMatchesRegularExpression('/^SC-\d{4}-\d{3}$/', $ref);
        }
        foreach ($this->db->table('stock_requests')->whereIn('status', ['pending', 'approved'])->get() as $r) {
            $this->assertGreaterThan('2026-09-15', $r->created_at);
        }
    }

    public function test_serials_follow_their_item(): void
    {
        $tracked = $this->db->table('stock_items')->where('track_serial', 1)->pluck('id')->all();
        $this->assertNotEmpty($tracked);
        $this->assertSame(0, $this->db->table('stock_item_serials')->whereNotIn('stock_item_id', $tracked)->count());
        $this->assertSame(0, $this->db->table('stock_item_serials')->whereNotIn('status', ['in_stock', 'issued', 'adjusted'])->count());

        $inStock = [];
        foreach ($this->db->table('stock_item_serials')->where('status', 'in_stock')->get() as $s) {
            $key = $s->stock_item_id.'|'.$s->warehouse_id;
            $inStock[$key] = ($inStock[$key] ?? 0) + 1;
        }
        foreach ($this->db->table('stock_balances')->whereIn('stock_item_id', $tracked)->get() as $b) {
            $this->assertSame($b->qty, $inStock[$b->stock_item_id.'|'.$b->warehouse_id] ?? 0);
        }
        foreach ($this->db->table('stock_item_serials')->get() as $s) {
            $first = $this->db->table('stock_item_serial_events')->where('stock_item_serial_id', $s->id)->orderBy('id')->value('event');
            $this->assertSame('received', $first);
            if ($s->status === 'issued') {
                $issued = $this->db->table('stock_item_serial_events')->where('stock_item_serial_id', $s->id)->where('event', 'issued')->orderByDesc('id')->first();
                $this->assertSame('issue', $this->db->table('stock_movements')->where('id', $issued->stock_movement_id)->value('type'));
            }
        }
    }

    public function test_alert_logs_one_per_item(): void
    {
        $logs = $this->db->table('stock_alert_logs')->get();
        $this->assertSame($logs->count(), $logs->pluck('stock_item_id')->unique()->count());
        foreach ($logs as $log) {
            $item = $this->db->table('stock_items')->find($log->stock_item_id);
            $expected = match (true) {
                $item->current_stock === 0 => 'out',
                $item->current_stock < $item->min_stock => 'low',
                $item->max_stock > 0 && $item->current_stock > $item->max_stock => 'over',
                default => null,
            };
            $this->assertSame($expected, $log->alert_type);
        }
        $this->assertSame(
            $this->db->table('stock_items')->get()->filter(fn ($i) => $i->current_stock === 0 || $i->current_stock < $i->min_stock || ($i->max_stock > 0 && $i->current_stock > $i->max_stock))->count(),
            $logs->count(),
        );
    }
}
