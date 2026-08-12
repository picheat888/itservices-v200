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
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockCountService
{
    public function __construct(private readonly StockLotService $lotService) {}

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

            foreach ($items as $item) {
                // Serialized items reconcile against their in-stock serials (the authoritative on-hand
                // record), which can drift from current_stock; everything else snapshots current_stock.
                $systemQty = $item->track_serial
                    ? (int) $item->serials()->where('status', 'in_stock')->count()
                    : $item->current_stock;

                $count->lines()->create([
                    'stock_item_id' => $item->id,
                    'system_qty' => $systemQty,
                    'counted_qty' => null,
                ]);
            }

            AuditLog::record('Opened stock count', "{$count->reference} ({$count->lines()->count()} items)");

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
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is not editable.');

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
     * Commit a draft. In Auto mode, every counted line whose count differs from
     * system stock records an adjust_up/adjust_down movement, sets the item's
     * current_stock to the counted value, and reconciles FIFO lots. In Manual
     * mode the session is closed as a report only — stock is left untouched.
     * The chosen mode is persisted on the count.
     */
    /**
     * Commit a draft. In Auto mode, every counted line whose count differs from system
     * stock records an adjust movement, sets current_stock to the counted value, and
     * reconciles FIFO lots. Serialized lines additionally mark the supplied missing
     * serials as 'adjusted'. In Manual mode the session is closed as a report only —
     * stock is untouched — and serialized counts are rejected.
     *
     * @param  array<int, array<int>>  $missingSerials  stock-item id => serial ids ticked as not found
     */
    public function commit(StockCount $count, User $user, StockCountAdjustMode $mode = StockCountAdjustMode::Auto, array $missingSerials = []): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is already closed.');

        $lines = $count->lines()->with('item')->get();

        // Manual is report-only; it can't reconcile the per-unit serials a serialized count needs.
        if ($mode === StockCountAdjustMode::Manual && $lines->contains(fn ($l) => (bool) $l->item?->track_serial)) {
            abort(422, 'Serialized counts must be committed with Auto.');
        }

        DB::transaction(function () use ($count, $user, $mode, $lines, $missingSerials) {
            if ($mode === StockCountAdjustMode::Auto) {
                foreach ($lines as $line) {
                    $variance = $line->variance();
                    if ($variance === null || $variance === 0 || $line->item === null) {
                        continue;
                    }

                    if ($line->item->track_serial) {
                        $this->reconcileSerials($line->item, $variance, $missingSerials[$line->stock_item_id] ?? [], $count->reference, $user);
                    }

                    StockMovement::create([
                        'type' => $variance > 0 ? 'adjust_up' : 'adjust_down',
                        'stock_item_id' => $line->stock_item_id,
                        'qty' => abs($variance),
                        'reference' => $count->reference,
                        'recorded_by' => $user->name,
                        'user_id' => $user->id,
                        'notes' => 'Stock count adjustment',
                        'moved_at' => now(),
                    ]);

                    $line->item->update([
                        'current_stock' => $line->counted_qty,
                        'last_move_at' => now()->toDateString(),
                    ]);

                    // Realign FIFO lots with the counted quantity.
                    $this->lotService->reconcile($line->item, $line->counted_qty);
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
            $count->reference.($mode === StockCountAdjustMode::Manual ? ' (manual - report only)' : ' (auto - stock adjusted)')
        );

        return $count->fresh('lines');
    }

    /**
     * Mark the ticked-missing serials of a serialized line as 'adjusted'. Only shortages
     * are supported: exactly |variance| in-stock serials belonging to the item must be
     * supplied; a positive variance (counted exceeds recorded serials) is rejected.
     *
     * @param  array<int>  $serialIds
     */
    private function reconcileSerials(StockItem $item, int $variance, array $serialIds, string $reference, User $user): void
    {
        abort_if($variance > 0, 422, "Counted exceeds recorded serials for {$item->sku}.");

        $need = abs($variance);
        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $ids)
            ->get();

        abort_if(
            count($ids) !== $need || $serials->count() !== $need,
            422,
            "Select exactly {$need} missing serial(s) for {$item->sku}."
        );

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
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Only a draft can be canceled.');
        $count->update(['status' => StockCountStatus::Canceled]);

        return $count;
    }
}
