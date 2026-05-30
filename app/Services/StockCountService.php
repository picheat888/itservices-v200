<?php

namespace App\Services;

use App\Enums\StockCountStatus;
use App\Models\AuditLog;
use App\Models\StockCount;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockCountService
{
    /**
     * Open a draft session, snapshotting current_stock for every item that matches
     * the optional warehouse / category filter.
     *
     * @param  array{warehouse?:?string, category?:?string, note?:?string}  $filters
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

            $items = StockItem::query()
                ->when($filters['warehouse'] ?? null, fn ($q, $w) => $q->where('warehouse', $w))
                ->when($filters['category'] ?? null, fn ($q, $c) => $q->where('category', $c))
                ->orderBy('sku')
                ->get(['id', 'current_stock']);

            foreach ($items as $item) {
                $count->lines()->create([
                    'stock_item_id' => $item->id,
                    'system_qty' => $item->current_stock,
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
     * Commit a draft: for every counted line whose count differs from system stock,
     * record an adjust_up/adjust_down movement and set the item's current_stock to
     * the counted value (the physical count is ground truth). Uncounted lines are
     * left untouched.
     */
    public function commit(StockCount $count, User $user): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is already closed.');

        DB::transaction(function () use ($count, $user) {
            foreach ($count->lines()->with('item')->get() as $line) {
                $variance = $line->variance();
                if ($variance === null || $variance === 0 || $line->item === null) {
                    continue;
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
            }

            $count->update(['status' => StockCountStatus::Committed, 'committed_at' => now()]);
        });

        AuditLog::record('Committed stock count', $count->reference);

        return $count->fresh('lines');
    }

    /** Cancel a draft session without touching stock. */
    public function cancel(StockCount $count): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Only a draft can be canceled.');
        $count->update(['status' => StockCountStatus::Canceled]);

        return $count;
    }
}
