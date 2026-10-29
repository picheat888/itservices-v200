<?php

namespace App\Http\Resources\Stock;

use App\Models\Stock\StockCount;
use App\Models\Stock\StockItemSerial;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/** @mixin StockCount */
class StockCountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $missingSerials = $this->missingSerialNames();

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'warehouse' => $this->warehouse,
            'warehouse_id' => $this->warehouse_id,
            'category' => $this->category,
            'category_th' => null,
            'status' => $this->status?->value,
            'adjust_mode' => $this->adjust_mode?->value,
            'note' => $this->note,
            'counted_by' => $this->whenLoaded('countedBy', fn () => $this->countedBy?->name),
            'committed_by' => $this->whenLoaded('committedBy', fn () => $this->committedBy?->name),
            'recount_of' => $this->whenLoaded('recountOf', fn () => $this->recountOf
                ? ['id' => $this->recountOf->id, 'reference' => $this->recountOf->reference]
                : null),
            'committed_at' => $this->committed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'sku' => $l->item?->sku,
                'name' => $l->item?->name,
                'system_qty' => $l->system_qty,
                'counted_qty' => $l->counted_qty,
                'variance' => $l->variance(),
                'reason' => $l->reason?->value,
                'reason_note' => $l->reason_note,
                'missing_serial_ids' => $l->missing_serial_ids ?? [],
                'found_serial_ids' => $l->found_serial_ids ?? [],
                'missing_serials' => collect($l->missing_serial_ids ?? [])
                    ->filter(fn ($id) => $missingSerials->has($id))
                    ->map(fn ($id) => ['id' => $id, 'serial' => $missingSerials[$id]])
                    ->values(),
                'track_serial' => (bool) $l->item?->track_serial,
                // Serials the original count wrote off, open to tick back on a recount
                'lost_serials' => $l->item?->track_serial
                    ? ($this->resource->lostSerials($l->stock_item_id)?->orderBy('id')->get(['id', 'serial'])->map(fn ($s) => ['id' => $s->id, 'serial' => $s->serial])->values() ?? [])
                    : [],
                // Only present once the in-stock serials are eager-loaded (the show endpoint).
                'serials' => $l->item && $l->item->relationLoaded('serials')
                    ? $l->item->serials->map(fn ($s) => ['id' => $s->id, 'serial' => $s->serial])->values()
                    : [],
            ])),
            // List rows carry SQL counts (withCount); full records count their loaded lines
            'line_count' => $this->lines_count ?? $this->whenLoaded('lines', fn () => $this->lines->count()),
            'counted_lines' => $this->counted_lines_count ?? $this->whenLoaded('lines', fn () => $this->lines->whereNotNull('counted_qty')->count()),
            // Counted lines off the system figure: how tall a confirmed sheet's table is before it loads
            'differing_lines' => $this->differing_lines_count ?? $this->whenLoaded('lines', fn () => $this->lines->filter(fn ($l) => ($l->variance() ?? 0) !== 0)->count()),
        ];
    }

    /**
     * Serial numbers of every line's missing ids, read in one query (they are no longer in stock once committed).
     *
     * @return Collection<int, string>
     */
    private function missingSerialNames(): Collection
    {
        if (! $this->relationLoaded('lines')) {
            return collect();
        }
        $ids = $this->lines->flatMap(fn ($l) => $l->missing_serial_ids ?? [])->unique()->values()->all();

        return $ids === [] ? collect() : StockItemSerial::whereIn('id', $ids)->pluck('serial', 'id');
    }
}
