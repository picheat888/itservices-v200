<?php

namespace App\Services;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use Illuminate\Validation\ValidationException;

class StockSerialService
{
    /**
     * For a serialized item, validate the chosen serials and mark them as issued.
     * Exactly $qty distinct in-stock serials belonging to the item must be selected.
     * No-op (returns []) for non-serialized items.
     *
     * @param  array<int>  $serialIds
     * @return array<int, string> the issued serial codes
     */
    public function issue(StockItem $item, array $serialIds, int $qty): array
    {
        if (! $item->track_serial) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $ids)
            ->get();

        if (count($ids) !== $qty || $serials->count() !== $qty) {
            throw ValidationException::withMessages([
                'serial_ids' => "Select exactly {$qty} in-stock serial(s) to issue.",
            ]);
        }

        StockItemSerial::whereIn('id', $serials->pluck('id'))->update(['status' => 'issued']);

        return $serials->pluck('serial')->all();
    }
}
