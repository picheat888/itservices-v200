<?php

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class StockSerialService
{
    /**
     * For a serialized item, mark the chosen in-stock serials as issued and log an
     * 'issued' event for each. The events are linked to the issue $movement via
     * stock_movement_id so the movement-detail dialog can list them reliably — the
     * old reference-only link broke whenever the request's reference drifted.
     * No-op (returns []) for non-serialized items or an empty selection.
     *
     * @param  array<int>  $serialIds  ids drawn from a single source warehouse / movement
     * @return array<int, string> the issued serial codes
     */
    public function issue(StockItem $item, array $serialIds, ?User $user = null, ?StockMovement $movement = null, ?string $reference = null): array
    {
        if (! $item->track_serial || $serialIds === []) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $ids)
            ->get();

        if ($serials->count() !== count($ids)) {
            throw ValidationException::withMessages([
                'serial_ids' => 'Some selected serials are not in stock for this item.',
            ]);
        }

        StockItemSerial::whereIn('id', $serials->pluck('id'))->update(['status' => 'issued']);

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'issued', [
                'stock_movement_id' => $movement?->id,
                'reference' => $reference,
                'warehouse' => $row->warehouse,
                'to_label' => $movement?->to_label ?? $reference,
                'user_id' => $user?->id,
                'recorded_by' => $user?->name,
                'occurred_at' => $movement?->moved_at,
            ]);
        }

        return $serials->pluck('serial')->all();
    }
}
