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
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

// Feature tests for the perf Stock step (items, movements, lots, balances, requests, counts, serials, alerts)
#[Group('sqlite')]
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
        // One number per document: only ISS and RET span rows (one per warehouse), all of the same request
        foreach ($this->db->table('stock_movements')->whereNotNull('doc_no')->get()->groupBy('doc_no') as $docNo => $rows) {
            $this->assertCount(1, $rows->pluck('type')->unique(), "{$docNo} mixes types");
            if (in_array($rows->first()->type, ['issue', 'return'], true)) {
                $this->assertNotNull($rows->first()->stock_request_id, "{$docNo} has no request");
                $this->assertCount(1, $rows->pluck('stock_request_id')->unique(), "{$docNo} spans requests");
                $warehouses = $rows->pluck($rows->first()->type === 'issue' ? 'from_label' : 'to_label');
                $this->assertSame($rows->count(), $warehouses->filter()->unique()->count(), "{$docNo} needs one row per warehouse");
            } else {
                $this->assertCount(1, $rows, "{$docNo} is used twice");
                $this->assertNull($rows->first()->stock_request_id);
            }
        }
        foreach ($this->db->table('stock_movements')->where('type', 'issue')->get()->groupBy('stock_request_id') as $requestId => $rows) {
            $this->assertCount(1, $rows->pluck('doc_no')->unique(), "request {$requestId} has more than one ISS");
            $this->assertSame($this->db->table('stock_requests')->where('id', $requestId)->value('reference'), $rows->first()->reference);
            $this->assertSame((int) $this->db->table('stock_requests')->where('id', $requestId)->value('qty'), (int) $rows->sum('qty'));
        }
        foreach ($this->db->table('stock_movements')->where('type', 'return')->pluck('stock_request_id') as $requestId) {
            $this->assertSame('fulfilled', $this->db->table('stock_requests')->where('id', $requestId)->value('status'));
        }

        $fulfilled = $this->db->table('stock_requests')->where('status', 'fulfilled')->pluck('reference')->all();
        $this->assertNotEmpty($fulfilled);
        $issueRefs = $this->db->table('stock_movements')->where('type', 'issue')->pluck('reference')->unique()->all();
        sort($fulfilled);
        sort($issueRefs);
        $this->assertSame($fulfilled, $issueRefs);

        foreach ($this->db->table('stock_requests')->get() as $r) {
            $this->assertSame($r->approver_name !== null, $r->approver_id !== null, "{$r->reference} approver id");
            $this->assertSame($r->fulfilled_by !== null, $r->fulfilled_by_id !== null, "{$r->reference} fulfiller id");
        }
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

    public function test_lots_are_numbered_per_day_and_opened_by_receipts_or_overages(): void
    {
        $movements = $this->db->table('stock_movements')->get()->keyBy('id');
        $byDay = [];
        foreach ($this->db->table('stock_lots')->orderBy('id')->get() as $lot) {
            $opener = $movements[$lot->stock_movement_id];
            $this->assertContains($opener->type, ['receive', 'adjust_up']);
            $this->assertSame(substr($opener->moved_at, 0, 10), substr($lot->received_at, 0, 10));
            $this->assertMatchesRegularExpression('/^LOT-\d{8}-\d{4,}$/', $lot->lot_no);
            $this->assertSame('LOT-'.str_replace('-', '', substr($opener->moved_at, 0, 10)), substr($lot->lot_no, 0, 12));
            $byDay[substr($lot->lot_no, 4, 8)][] = (int) substr($lot->lot_no, 13);
        }
        $this->assertNotEmpty($byDay);
        foreach ($byDay as $day => $numbers) {
            $this->assertSame(range(1, count($numbers)), $numbers, "lot numbers of {$day} are not a running sequence");
        }
    }

    public function test_every_movement_writes_its_lot_entries(): void
    {
        $entries = $this->db->table('stock_lot_entries')->get()->groupBy('stock_movement_id');
        $lots = $this->db->table('stock_lots')->get()->keyBy('id');
        $drawn = [];
        foreach ($this->db->table('stock_movements')->orderBy('id')->get() as $m) {
            $rows = $entries->get($m->id, collect());
            $this->assertNotEmpty($rows, "movement {$m->id} ({$m->type}) has no lot entries");
            foreach ($rows as $e) {
                $this->assertSame($m->moved_at, $e->occurred_at);
                $this->assertSame($m->stock_item_id, $lots[$e->stock_lot_id]->stock_item_id);
            }
            match ($m->type) {
                'receive', 'adjust_up' => $this->assertSame([[$m->qty, $m->to_warehouse_id]], $rows->map(fn ($e) => [$e->qty, $e->warehouse_id])->all()),
                'issue', 'adjust_down' => $this->assertSame([-$m->qty, [$m->from_warehouse_id]], [(int) $rows->sum('qty'), $rows->pluck('warehouse_id')->unique()->values()->all()]),
                'return' => $this->assertSame([$m->qty, [$m->to_warehouse_id]], [(int) $rows->sum('qty'), $rows->pluck('warehouse_id')->unique()->values()->all()]),
                'transfer' => $this->assertSame([0, [$m->from_warehouse_id], [$m->to_warehouse_id]], [(int) $rows->sum(fn ($e) => abs($e->qty)), $rows->pluck('from_warehouse_id')->unique()->values()->all(), $rows->pluck('warehouse_id')->unique()->values()->all()]),
            };
            foreach ($rows as $e) {
                if ($m->type === 'issue') {
                    $this->assertLessThan(0, $e->qty);
                    $drawn[$m->stock_request_id][$e->stock_lot_id] = ($drawn[$m->stock_request_id][$e->stock_lot_id] ?? 0) - $e->qty;
                } elseif ($m->type === 'return') {
                    $this->assertGreaterThan(0, $e->qty);
                    $drawn[$m->stock_request_id][$e->stock_lot_id] = ($drawn[$m->stock_request_id][$e->stock_lot_id] ?? 0) - $e->qty;
                    $this->assertGreaterThanOrEqual(0, $drawn[$m->stock_request_id][$e->stock_lot_id], "return {$m->id} gives lot {$e->stock_lot_id} more than its request drew");
                }
            }
        }
        $this->assertGreaterThan(0, $this->db->table('stock_lot_entries')->where('qty', 0)->count());
    }

    public function test_serials_ride_with_their_lot(): void
    {
        $lots = $this->db->table('stock_lots')->get()->keyBy('id');
        $inStockPerLot = [];
        foreach ($this->db->table('stock_item_serials')->get() as $s) {
            $this->assertNotNull($s->stock_lot_id, "serial {$s->id} has no lot");
            $lot = $lots[$s->stock_lot_id];
            $this->assertSame($s->stock_item_id, $lot->stock_item_id);
            $this->assertSame($s->stock_movement_id, $lot->stock_movement_id);
            if ($s->status === 'in_stock') {
                $this->assertSame($lot->warehouse_id, $s->warehouse_id, "serial {$s->id} sits away from its lot");
                $inStockPerLot[$s->stock_lot_id] = ($inStockPerLot[$s->stock_lot_id] ?? 0) + 1;
            }
        }
        $tracked = $this->db->table('stock_items')->where('track_serial', 1)->pluck('id')->all();
        foreach ($this->db->table('stock_lots')->whereIn('stock_item_id', $tracked)->get() as $lot) {
            $this->assertSame((int) $lot->qty_remaining, $inStockPerLot[$lot->id] ?? 0, "lot {$lot->lot_no} holds a different count than its serials");
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
