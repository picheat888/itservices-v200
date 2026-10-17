<?php

namespace App\Services\Report\Stock;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Unit value of a SKU on a day, for stock movements that carry no unit_cost: the weighted average of the lots
 * received up to the end of that day, else the oldest lot's cost, else stock_items.cost, else 0. Loads the lots once.
 */
class StockCostBook
{
    /**
     * @param  array<int, list<array{at: string, qty: int, value: float}>>  $lots  per item, oldest first, running totals
     * @param  array<int, float>  $firstCost  per item, the oldest lot's unit cost
     * @param  array<int, float>  $itemCost  per item, stock_items.cost
     */
    private function __construct(private array $lots, private array $firstCost, private array $itemCost) {}

    /**
     * The lots and item costs of these SKUs, two queries per thousand ids.
     *
     * @param  iterable<int|string|null>  $itemIds
     */
    public static function forItems(iterable $itemIds): self
    {
        $ids = [];
        foreach ($itemIds as $id) {
            if ($id !== null) {
                $ids[(int) $id] = true;
            }
        }

        $lots = [];
        $firstCost = [];
        $itemCost = [];
        foreach (array_chunk(array_keys($ids), 1000) as $chunk) {
            $rows = DB::table('stock_lots')->whereIn('stock_item_id', $chunk)
                ->orderBy('stock_item_id')->orderBy('received_at')->orderBy('id')
                ->get(['stock_item_id', 'unit_cost', 'qty_received', 'received_at']);
            foreach ($rows as $row) {
                $item = (int) $row->stock_item_id;
                $cost = (float) $row->unit_cost;
                $last = $lots[$item][count($lots[$item] ?? []) - 1] ?? ['qty' => 0, 'value' => 0.0];
                $firstCost[$item] ??= $cost;
                $lots[$item][] = [
                    'at' => CarbonImmutable::parse($row->received_at)->format('Y-m-d H:i:s'),
                    'qty' => $last['qty'] + (int) $row->qty_received,
                    'value' => $last['value'] + (int) $row->qty_received * $cost,
                ];
            }

            foreach (DB::table('stock_items')->whereIn('id', $chunk)->get(['id', 'cost']) as $item) {
                $itemCost[(int) $item->id] = (float) $item->cost;
            }
        }

        return new self($lots, $firstCost, $itemCost);
    }

    /** Unit value of the item at the end of $day (see the class note). */
    public function averageAt(int $itemId, CarbonInterface $day): float
    {
        $lots = $this->lots[$itemId] ?? [];
        $end = CarbonImmutable::instance($day)->endOfDay()->format('Y-m-d H:i:s');

        // Binary search: the last lot received on or before the end of the day
        $found = -1;
        for ($low = 0, $high = count($lots) - 1; $low <= $high;) {
            $mid = intdiv($low + $high, 2);
            if ($lots[$mid]['at'] <= $end) {
                $found = $mid;
                $low = $mid + 1;
            } else {
                $high = $mid - 1;
            }
        }

        if ($found >= 0 && $lots[$found]['qty'] > 0) {
            return $lots[$found]['value'] / $lots[$found]['qty'];
        }

        return $this->firstCost[$itemId] ?? $this->itemCost[$itemId] ?? 0.0;
    }
}
