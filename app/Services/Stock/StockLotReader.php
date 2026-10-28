<?php

// Read side of the lot ledger: the lot page, the scan lookup, the lots of one movement,
// a request's issue and return trail, and the fulfilled requests a return can still name.

namespace App\Services\Stock;

use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Support\Refusal;
use App\Support\SearchTerms;
use Illuminate\Support\Collection;

class StockLotReader
{
    /** A lot number anywhere in a scanned code (a full QR link, a query string, lower case). */
    public const LOT_PATTERN = '/LOT-\d{8}-\d{4,}/i';

    private const RETURNABLE_LIMIT = 50;

    public function __construct(private readonly StockLotService $lots) {}

    /**
     * The lot page: header facts, the four tiles, the reconciliation check and every ledger entry.
     *
     * @return array<string, mixed>
     */
    public function detail(StockLot $lot): array
    {
        $lot->loadMissing(['item.unit', 'warehouse', 'movement']);
        $entries = $lot->entries()
            ->with('movement.request:id,reference,requester_name')
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get();

        $tiles = $this->tiles($entries);
        $expected = $tiles['received'] - $tiles['issued'] + $tiles['returned'] + $tiles['adjusted'];
        $remaining = (int) $lot->qty_remaining;

        return [
            'lot_no' => $lot->lot_no,
            'item' => $this->itemFacts($lot->item),
            'warehouse' => $lot->warehouse?->name ?? 'Unassigned',
            'unit_cost' => (float) $lot->unit_cost,
            'received_at' => $lot->received_at?->toDateTimeString(),
            'received_doc_no' => $lot->movement?->doc_no,
            'tiles' => [...$tiles, 'remaining' => $remaining],
            'check' => ['balanced' => $expected === $remaining, 'diff' => $remaining - $expected],
            'entries' => $this->entryRows($lot, $entries),
        ];
    }

    /**
     * What a scanned code points at: a lot number, or else a serial whose lot is returned with it.
     *
     * @return array<string, mixed>
     */
    public function lookup(string $code): array
    {
        $code = trim($code);

        if (preg_match(self::LOT_PATTERN, $code, $match) === 1) {
            $lotNo = strtoupper($match[0]);
            $lot = StockLot::with(['item.unit', 'warehouse'])->where('lot_no', $lotNo)->first();
            if ($lot === null) {
                Refusal::fail('lot_not_found', ['lot_no' => $lotNo], 'code');
            }

            return $this->scanFacts($lot);
        }

        $serial = $code === '' ? null : StockItemSerial::with(['lot.item.unit', 'lot.warehouse'])
            ->whereRaw('LOWER(serial) = ?', [mb_strtolower($code)])
            ->whereNotNull('stock_lot_id')
            ->first();
        if ($serial?->lot === null) {
            Refusal::fail('lot_not_a_code', field: 'code');
        }

        return [...$this->scanFacts($serial->lot), 'serial' => $serial->serial];
    }

    /**
     * The lots every row of this movement's document touched, with the request's returns when it has one.
     *
     * @return array{lots: list<array<string, mixed>>, returns: list<array{doc_no: ?string, qty: int}>, returnable: int}
     */
    public function forMovement(StockMovement $movement): array
    {
        $rows = $movement->doc_no === null
            ? collect([$movement])
            : StockMovement::where('doc_no', $movement->doc_no)
                ->where('type', $movement->type)
                ->where('stock_item_id', $movement->stock_item_id)
                ->orderBy('id')
                ->get();

        $entries = StockLotEntry::with('lot.warehouse')
            ->whereIn('stock_movement_id', $rows->modelKeys())
            ->orderBy('stock_movement_id')
            ->orderBy('id')
            ->get();
        $isTransfer = $movement->type === 'transfer';
        $held = $isTransfer ? $this->heldAt($entries) : [];

        $request = $movement->stock_request_id !== null ? StockRequest::find($movement->stock_request_id) : null;
        $figures = $request !== null ? ($this->lots->drawnAndReturned([$request->id])[$request->id] ?? []) : [];

        $lots = $entries->groupBy('stock_lot_id')->map(function (Collection $group, $lotId) use ($isTransfer, $held, $figures): array {
            $lot = $group->first()->lot;
            $qty = $isTransfer
                ? (int) $group->sum(fn (StockLotEntry $entry): int => $held[$entry->id] ?? 0)
                : abs((int) $group->sum('qty'));

            return [
                'lot_id' => (int) $lotId,
                'lot_no' => $lot?->lot_no,
                'warehouse' => $lot?->warehouse?->name ?? 'Unassigned',
                'unit_cost' => (float) $lot?->unit_cost,
                'qty' => $qty,
                'returned' => $figures[(int) $lotId]['returned'] ?? 0,
                'remaining' => (int) $lot?->qty_remaining,
                'state' => $lot?->qty_remaining > 0 ? 'in_stock' : 'empty',
            ];
        })->values()->all();

        return [
            'lots' => $lots,
            'returns' => $request !== null ? $this->returnTotals($request) : [],
            'returnable' => $request !== null ? array_sum($this->lots->issuedLeft($request)) : 0,
        ];
    }

    /**
     * A request's issue (lots drawn, how much came back) and each return it had.
     *
     * @return array{issue: ?array<string, mixed>, returns: list<array<string, mixed>>, returnable: int}
     */
    public function trail(StockRequest $request): array
    {
        $movements = StockMovement::where('stock_request_id', $request->id)
            ->whereIn('type', ['issue', 'return'])
            ->orderBy('id')
            ->get();
        $entries = StockLotEntry::with('lot:id,lot_no,received_at,unit_cost')
            ->whereIn('stock_movement_id', $movements->modelKeys())
            ->orderBy('id')
            ->get()
            ->groupBy('stock_movement_id');
        $names = $this->warehouseNames($entries->flatten(1)->pluck('warehouse_id'));
        $figures = $this->lots->drawnAndReturned([$request->id])[$request->id] ?? [];
        $entriesOf = fn (Collection $rows): Collection => $rows->flatMap(fn (StockMovement $m) => $entries->get($m->id, collect()));

        $issues = $movements->where('type', 'issue');
        $issue = null;
        if ($issues->isNotEmpty()) {
            $first = $issues->first();
            $issue = [
                'doc_no' => $first->doc_no,
                'moved_at' => $first->moved_at?->toDateTimeString(),
                'recorded_by' => $first->recorded_by,
                'lines' => $entriesOf($issues)->where('qty', '<', 0)->groupBy('stock_lot_id')
                    ->map(fn (Collection $group, $lotId): array => [
                        'warehouse' => $this->nameOf($group->first()->warehouse_id, $names),
                        'lot_id' => (int) $lotId,
                        'lot_no' => $group->first()->lot?->lot_no,
                        'received_at' => $group->first()->lot?->received_at?->toDateTimeString(),
                        'unit_cost' => (float) $group->first()->lot?->unit_cost,
                        'qty' => -(int) $group->sum('qty'),
                        'returned' => $figures[(int) $lotId]['returned'] ?? 0,
                    ])->values()->all(),
            ];
        }

        $returns = $movements->where('type', 'return')->groupBy('doc_no')
            ->map(fn (Collection $rows): array => [
                'doc_no' => $rows->first()->doc_no,
                'moved_at' => $rows->first()->moved_at?->toDateTimeString(),
                'recorded_by' => $rows->first()->recorded_by,
                'lines' => $entriesOf($rows)->groupBy('stock_lot_id')
                    ->map(fn (Collection $group): array => [
                        'warehouse' => $this->nameOf($group->first()->warehouse_id, $names),
                        'lot_no' => $group->first()->lot?->lot_no,
                        'qty' => (int) $group->sum('qty'),
                    ])->values()->all(),
            ])->values()->all();

        return [
            'issue' => $issue,
            'returns' => $returns,
            'returnable' => array_sum($this->lots->issuedLeft($request)),
        ];
    }

    /**
     * Fulfilled requests of an item with something left to return, newest first (or just the one request asked for).
     *
     * @return list<array<string, mixed>>
     */
    public function returnable(StockItem $item, ?string $search, ?int $requestId = null): array
    {
        $figures = $this->lots->drawnAndReturned(
            StockRequest::where('stock_item_id', $item->id)
                ->where('status', 'fulfilled')
                ->when($requestId !== null, fn ($q) => $q->whereKey($requestId)),
        );
        $leftByRequest = collect($figures)
            ->map(fn (array $lots): int => array_sum(array_map(fn (array $lot): int => max(0, $lot['issued'] - $lot['returned']), $lots)))
            ->filter(fn (int $left): bool => $left > 0);
        if ($leftByRequest->isEmpty()) {
            return [];
        }

        $query = StockRequest::whereKey($leftByRequest->keys()->all())
            ->orderByDesc('fulfilled_at')
            ->orderByDesc('id')
            ->limit(self::RETURNABLE_LIMIT);
        SearchTerms::apply($query, $search, ['reference', 'requester_name']);
        $requests = $query->get();

        $lotIds = $requests->flatMap(fn (StockRequest $r): array => array_keys($figures[$r->id]))->unique()->values()->all();
        $lots = StockLot::with('warehouse')->whereKey($lotIds)->get()->keyBy('id');
        $serials = $item->track_serial ? $this->serialsOut($item, $requests->modelKeys()) : collect();

        return $requests->map(fn (StockRequest $r): array => [
            'id' => $r->id,
            'reference' => $r->reference,
            'requester_name' => $r->requester_name,
            'fulfilled_at' => $r->fulfilled_at?->toDateTimeString(),
            'left' => $leftByRequest->get($r->id),
            'lots' => collect($figures[$r->id])
                ->filter(fn (array $lot): bool => $lot['issued'] > 0)
                ->map(fn (array $lot, int $lotId): array => [
                    'lot_id' => $lotId,
                    'lot_no' => $lots->get($lotId)?->lot_no,
                    'warehouse' => $lots->get($lotId)?->warehouse?->name ?? 'Unassigned',
                    'issued' => $lot['issued'],
                    'returned' => $lot['returned'],
                    'left' => max(0, $lot['issued'] - $lot['returned']),
                ])->values()->all(),
            'serials' => $serials->get($r->id, collect())->values()->all(),
        ])->all();
    }

    /**
     * What each lot held right after each given entry (a transfer entry is 0, so this is what it carried).
     *
     * @param  Collection<int, StockLotEntry>  $entries
     * @return array<int, int> entry id => qty
     */
    public function heldAt(Collection $entries): array
    {
        if ($entries->isEmpty()) {
            return [];
        }

        $runningByEntry = [];
        $runningByLot = [];
        StockLotEntry::whereIn('stock_lot_id', $entries->pluck('stock_lot_id')->unique()->values()->all())
            ->orderBy('id')
            ->get(['id', 'stock_lot_id', 'qty'])
            ->each(function (StockLotEntry $row) use (&$runningByEntry, &$runningByLot): void {
                $runningByLot[$row->stock_lot_id] = ($runningByLot[$row->stock_lot_id] ?? 0) + (int) $row->qty;
                $runningByEntry[$row->id] = $runningByLot[$row->stock_lot_id];
            });

        return $entries->mapWithKeys(fn (StockLotEntry $entry): array => [$entry->id => $runningByEntry[$entry->id] ?? 0])->all();
    }

    /**
     * Received is the entry that opened the lot; issued and returned come from issue and return movements; the rest is adjusted.
     *
     * @param  Collection<int, StockLotEntry>  $entries
     * @return array{received: int, issued: int, returned: int, adjusted: int}
     */
    private function tiles(Collection $entries): array
    {
        $opening = $entries->sortBy('id')->first();
        $tiles = ['received' => (int) ($opening?->qty ?? 0), 'issued' => 0, 'returned' => 0, 'adjusted' => 0];

        foreach ($entries as $entry) {
            if ($entry->id === $opening->id) {
                continue;
            }
            $type = $entry->movement?->type;
            if ($type === 'issue' && $entry->qty < 0) {
                $tiles['issued'] -= $entry->qty;
            } elseif ($type === 'return' && $entry->qty > 0) {
                $tiles['returned'] += $entry->qty;
            } else {
                $tiles['adjusted'] += $entry->qty;
            }
        }

        return $tiles;
    }

    /**
     * @param  Collection<int, StockLotEntry>  $entries  in display order
     * @return list<array<string, mixed>>
     */
    private function entryRows(StockLot $lot, Collection $entries): array
    {
        $names = $this->warehouseNames($entries->pluck('warehouse_id')->merge($entries->pluck('from_warehouse_id')));
        $counts = $this->countLines($lot, $entries->whereNull('stock_movement_id')->pluck('reference')->filter()->unique()->values()->all());

        $balance = 0;

        return $entries->map(function (StockLotEntry $entry) use (&$balance, $names, $counts): array {
            $movement = $entry->movement;
            $count = $movement === null ? $counts->get((string) $entry->reference) : null;
            $type = $movement?->type ?? ($entry->qty >= 0 ? 'adjust_up' : 'adjust_down');
            $recordedBy = $movement !== null ? $movement->recorded_by : $count?->count?->committedBy?->name;
            $balance += $entry->qty;

            return [
                'occurred_at' => $entry->occurred_at?->toDateTimeString(),
                'doc_no' => $movement?->doc_no ?? $entry->reference,
                'type' => $type,
                'reference' => $movement?->reference,
                'request_reference' => $movement?->request?->reference,
                'person' => $movement?->request?->requester_name ?? $recordedBy,
                'recorded_by' => $recordedBy,
                'warehouse' => $this->nameOf($entry->warehouse_id, $names),
                'from_warehouse' => $type === 'transfer' ? $this->nameOf($entry->from_warehouse_id, $names) : null,
                'qty' => $entry->qty,
                'balance_after' => $balance,
                'reason' => $movement !== null ? $movement->reason : $count?->reason?->value,
            ];
        })->values()->all();
    }

    /**
     * The count lines behind ledger entries that have no movement (serial finds and losses that cancel out), by count reference.
     *
     * @param  list<string>  $references
     * @return Collection<string, StockCountLine>
     */
    private function countLines(StockLot $lot, array $references): Collection
    {
        if ($references === []) {
            return collect();
        }

        return StockCountLine::with('count.committedBy')
            ->where('stock_item_id', $lot->stock_item_id)
            ->whereHas('count', fn ($q) => $q->whereIn('reference', $references))
            ->get()
            ->keyBy(fn (StockCountLine $line): string => (string) $line->count?->reference);
    }

    /**
     * Serials still out under each request: issued now, and last issued by one of that request's issue movements.
     *
     * @param  list<int>  $requestIds
     * @return Collection<int, Collection<int, array{id: int, serial: string, lot_no: ?string}>>
     */
    private function serialsOut(StockItem $item, array $requestIds): Collection
    {
        $requestOfIssue = StockMovement::whereIn('stock_request_id', $requestIds)->where('type', 'issue')->pluck('stock_request_id', 'id');
        $out = StockItemSerial::with('lot:id,lot_no')
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->orderBy('serial')
            ->get();
        $lastIssue = StockItemSerialEvent::whereIn('stock_item_serial_id', $out->modelKeys())
            ->where('event', 'issued')
            ->orderBy('id')
            ->pluck('stock_movement_id', 'stock_item_serial_id');

        return $out
            ->filter(fn (StockItemSerial $serial): bool => $requestOfIssue->has((int) $lastIssue->get($serial->id)))
            ->groupBy(fn (StockItemSerial $serial): int => (int) $requestOfIssue->get((int) $lastIssue->get($serial->id)))
            ->map(fn (Collection $serials) => $serials->map(fn (StockItemSerial $serial): array => [
                'id' => $serial->id,
                'serial' => $serial->serial,
                'lot_no' => $serial->lot?->lot_no,
            ])->values());
    }

    /** @return array<string, mixed> */
    private function scanFacts(StockLot $lot): array
    {
        return [
            'lot_no' => $lot->lot_no,
            'item' => $this->itemFacts($lot->item),
            'warehouse' => $lot->warehouse?->name ?? 'Unassigned',
            'remaining' => (int) $lot->qty_remaining,
            'received_at' => $lot->received_at?->toDateTimeString(),
            'unit_cost' => (float) $lot->unit_cost,
            'state' => $lot->qty_remaining > 0 ? 'in_stock' : 'empty',
        ];
    }

    /** @return array{id: ?int, sku: ?string, name: ?string, unit: ?string, track_serial: bool} */
    private function itemFacts(?StockItem $item): array
    {
        return [
            'id' => $item?->id,
            'sku' => $item?->sku,
            'name' => $item?->name,
            'unit' => $item?->unit?->name,
            'track_serial' => (bool) $item?->track_serial,
        ];
    }

    /**
     * Each return document of a request with the quantity it brought back.
     *
     * @return list<array{doc_no: ?string, qty: int}>
     */
    private function returnTotals(StockRequest $request): array
    {
        return StockMovement::where('stock_request_id', $request->id)
            ->where('type', 'return')
            ->orderBy('id')
            ->get(['doc_no', 'qty'])
            ->groupBy('doc_no')
            ->map(fn (Collection $rows): array => ['doc_no' => $rows->first()->doc_no, 'qty' => (int) $rows->sum('qty')])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, int|null>  $ids
     * @return Collection<int, string>
     */
    private function warehouseNames(Collection $ids): Collection
    {
        $ids = $ids->filter()->unique()->values()->all();

        return $ids === [] ? collect() : Warehouse::whereKey($ids)->pluck('name', 'id');
    }

    /** @param  Collection<int, string>  $names */
    private function nameOf(?int $warehouseId, Collection $names): string
    {
        return $warehouseId === null ? 'Unassigned' : ($names->get($warehouseId) ?? 'Unassigned');
    }
}
