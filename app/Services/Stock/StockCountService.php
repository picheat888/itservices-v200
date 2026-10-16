<?php

namespace App\Services\Stock;

use App\Enums\Stock\StockCountAdjustMode;
use App\Enums\Stock\StockCountStatus;
use App\Models\AuditLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\Refusal;
use Illuminate\Support\Facades\DB;

class StockCountService
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balanceService,
    ) {}

    /**
     * Open a draft session, snapshotting current_stock for the items to count.
     * When explicit `stock_item_ids` are given those exact SKUs are used;
     * otherwise every item matching the optional warehouse / category filter.
     *
     * @param  array{warehouse?:?string, category?:?string, note?:?string, stock_item_ids?:array<int>}  $filters
     */
    public function open(array $filters, User $user): StockCount
    {
        return DB::transaction(function () use ($filters, $user) {
            $count = StockCount::create([
                'warehouse' => $filters['warehouse'] ?? null,
                'category' => $filters['category'] ?? null,
                'note' => $filters['note'] ?? null,
                'status' => StockCountStatus::Draft,
                'counted_by' => $user->id,
            ]);

            $query = StockItem::query();
            if (! empty($filters['stock_item_ids'])) {
                $query->whereIn('id', $filters['stock_item_ids']);
            } else {
                $query->when($filters['warehouse'] ?? null, fn ($q, $w) => $q->whereHas('balances', fn ($b) => $b->whereHas('warehouse', fn ($wh) => $wh->where('name', $w))))
                    ->when($filters['category'] ?? null, fn ($q, $c) => $q->whereHas('category', fn ($cat) => $cat->where('name', $c)));
            }
            $items = $query->orderBy('sku')->get(['id', 'current_stock', 'track_serial']);
            // A count of one warehouse is a count of that shelf, so it snapshots that shelf.
            $warehouseId = filled($filters['warehouse'] ?? null)
                ? Warehouse::query()->where('name', $filters['warehouse'])->value('id')
                : null;

            foreach ($items as $item) {
                // Serialized: in-stock serials; else current_stock, or that warehouse's balance in a one-warehouse count.
                $systemQty = match (true) {
                    (bool) $item->track_serial => (int) $item->serials()->where('status', 'in_stock')
                        ->when($warehouseId, fn ($q, $id) => $q->where('warehouse_id', $id))->count(),
                    $warehouseId !== null => (int) $item->balances()->where('warehouse_id', $warehouseId)->value('qty'),
                    default => $item->current_stock,
                };

                $count->lines()->create([
                    'stock_item_id' => $item->id,
                    'system_qty' => $systemQty,
                    'counted_qty' => null,
                ]);
            }

            AuditLog::record('Opened stock count', "{$count->reference} ({$count->lines()->count()} items)", subject: $count);

            return $count->load('lines');
        });
    }

    /**
     * Set counted quantities on a draft session's lines.
     *
     * @param  array<int, ?int>  $countedByLineId  line id => counted qty (null clears)
     */
    public function saveCounts(StockCount $count, array $countedByLineId): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'count_not_editable');

        DB::transaction(function () use ($count, $countedByLineId) {
            foreach ($count->lines as $line) {
                if (array_key_exists($line->id, $countedByLineId)) {
                    $value = $countedByLineId[$line->id];
                    $line->update(['counted_qty' => $value === null ? null : max(0, (int) $value)]);
                }
            }
        });

        return $count->fresh('lines');
    }

    /**
     * Commit a draft. Auto: each counted line with a variance records an adjust movement, moves
     * the balance and total, reconciles FIFO lots and marks ticked-missing serials 'adjusted'.
     * Manual: closed as a report only (serialized counts refused). The mode is persisted.
     *
     * @param  array<int, array<int>>  $missingSerials  stock-item id => serial ids ticked as not found
     */
    public function commit(StockCount $count, User $user, StockCountAdjustMode $mode = StockCountAdjustMode::Auto, array $missingSerials = []): StockCount
    {
        DB::transaction(function () use ($count, $user, $mode, $missingSerials) {
            $this->lockInDraft($count);

            $lines = $count->lines()->with('item')->get();

            // Manual is report-only; it can't reconcile the per-unit serials a serialized count needs.
            if ($mode === StockCountAdjustMode::Manual && $lines->contains(fn ($l) => (bool) $l->item?->track_serial)) {
                abort(422, 'count_serial_needs_auto');
            }

            if ($mode === StockCountAdjustMode::Auto) {
                foreach ($lines as $line) {
                    $variance = $line->variance();
                    if ($variance === null || $variance === 0) {
                        continue;
                    }

                    /** @var StockItem|null $item */
                    $item = StockItem::whereKey($line->stock_item_id)->lockForUpdate()->first();
                    if ($item === null) {
                        continue;
                    }

                    // The shelf the difference belongs to; refused when an all-warehouse count cannot say.
                    $warehouse = $this->warehouseForDifference($count, $item);

                    if ($item->track_serial) {
                        $this->reconcileSerials($item, $variance, $missingSerials[$line->stock_item_id] ?? [], $count->reference, $user);
                    }

                    StockMovement::create([
                        'type' => $variance > 0 ? 'adjust_up' : 'adjust_down',
                        'stock_item_id' => $line->stock_item_id,
                        'qty' => abs($variance),
                        'from_label' => $variance < 0 ? $warehouse : null,
                        'to_label' => $variance > 0 ? $warehouse : null,
                        'reference' => $count->reference,
                        'recorded_by' => $user->name,
                        'user_id' => $user->id,
                        'notes' => 'Stock count adjustment',
                        'moved_at' => now(),
                    ]);

                    // Balance and total move by the difference; an all-warehouse count lands on the counted figure.
                    $variance > 0
                        ? $this->balanceService->add($item, $warehouse, $variance)
                        : $this->balanceService->remove($item, $warehouse, abs($variance));
                    $total = $count->warehouse !== null ? $item->current_stock + $variance : $line->counted_qty;
                    $item->update([
                        'current_stock' => $total,
                        'last_move_at' => now()->toDateString(),
                    ]);

                    // Realign FIFO lots with the new total.
                    $this->lotService->reconcile($item, $total);
                }
            }

            $count->update([
                'status' => StockCountStatus::Committed,
                'committed_at' => now(),
                'adjust_mode' => $mode,
            ]);
        });

        AuditLog::record(
            'Committed stock count',
            $count->reference.($mode === StockCountAdjustMode::Manual ? ' (manual - report only)' : ' (auto - stock adjusted)'),
            subject: $count,
        );

        return $count->fresh('lines');
    }

    /** Re-read the count under lock inside the transaction so two commits cannot both pass. */
    private function lockInDraft(StockCount $count): void
    {
        $count->setRawAttributes(StockCount::lockForUpdate()->findOrFail($count->id)->getAttributes(), true);
        abort_unless($count->status === StockCountStatus::Draft, 422, 'count_closed');
    }

    /**
     * The warehouse a counted difference is booked against: the count's own warehouse, else
     * the one warehouse the item holds stock in ('Unassigned' when none); spread items are refused.
     */
    private function warehouseForDifference(StockCount $count, StockItem $item): string
    {
        if (filled($count->warehouse)) {
            return $count->warehouse;
        }

        $holding = $item->balances()->with('warehouse')->where('qty', '>', 0)->get();
        if ($holding->count() > 1) {
            Refusal::fail('count_needs_warehouse', ['sku' => $item->sku]);
        }

        return $holding->first()?->warehouse?->name ?? 'Unassigned';
    }

    /**
     * Mark the ticked-missing serials of a serialized line as 'adjusted' (shortages only: exactly |variance| ids).
     *
     * @param  array<int>  $serialIds
     */
    private function reconcileSerials(StockItem $item, int $variance, array $serialIds, string $reference, User $user): void
    {
        if ($variance > 0) {
            Refusal::fail('count_serial_over', ['sku' => $item->sku]);
        }

        $need = abs($variance);
        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $ids)
            ->get();

        if (count($ids) !== $need || $serials->count() !== $need) {
            Refusal::fail('count_serial_missing_mismatch', ['need' => $need, 'sku' => $item->sku]);
        }

        StockItemSerial::whereIn('id', $serials->pluck('id'))
            ->update(['status' => 'adjusted', 'reference' => $reference]);

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'adjusted', [
                'reference' => $reference,
                'warehouse' => $row->warehouse?->name,
                'user_id' => $user->id,
                'recorded_by' => $user->name,
            ]);
        }
    }

    /** Cancel a draft session without touching stock. */
    public function cancel(StockCount $count): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'count_not_draft');
        $count->update(['status' => StockCountStatus::Canceled]);

        return $count;
    }
}
