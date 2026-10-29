<?php

// Books a return against a fulfilled stock request: units go back into the lots that request drew,
// one RET number per return and one movement per warehouse those lots sit in now.

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Support\DocNumber;
use App\Support\Refusal;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StockReturnService
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
        private readonly StockCountLock $countLock,
    ) {}

    /**
     * A serialized return must pick serials; record() then checks they went out under the request.
     *
     * @param  array{serial_ids?: list<int>}  $data
     */
    public function assertSerialsPicked(StockItem $item, array $data): void
    {
        if ($item->track_serial && ($data['serial_ids'] ?? []) === []) {
            Refusal::fail('return_serials_required', field: 'serial_ids');
        }
    }

    /**
     * Record the return and refill the lots; returns the first movement row.
     *
     * @param  array{lots?: list<array{lot_id: int, qty: int}>, serial_ids?: list<int>, notes?: ?string, moved_at?: ?string}  $data
     */
    public function record(StockItem $item, StockRequest $stockRequest, array $data, User $user): StockMovement
    {
        return DB::transaction(function () use ($item, $stockRequest, $data, $user): StockMovement {
            $stockRequest = $this->lockReturnable($item, $stockRequest);
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($item->id);

            $serials = $item->track_serial ? $this->issuedSerials($item, $stockRequest, $data['serial_ids'] ?? []) : collect();
            $qtyByLot = $item->track_serial
                ? $serials->countBy('stock_lot_id')->mapWithKeys(fn (int $qty, $lotId): array => [(int) $lotId => $qty])->all()
                : $this->pickedLots($data['lots'] ?? []);

            $lots = StockLot::with('warehouse')->whereKey(array_keys($qtyByLot))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $this->assertWithinIssued($stockRequest, $lots, $qtyByLot);

            $lotsByWarehouse = $lots->groupBy(fn (StockLot $lot): string => $lot->warehouse?->name ?? 'Unassigned');
            $this->countLock->assertFree($item->id, $lotsByWarehouse->keys()->all());

            $movedAt = isset($data['moved_at']) ? Carbon::parse($data['moved_at']) : now();
            $this->assertNotBeforeIssue($stockRequest, $movedAt);
            $docNo = DocNumber::next('return', (int) $movedAt->year);
            $reference = $stockRequest->reference ?? "REQ-{$stockRequest->id}";

            $first = null;
            foreach ($lotsByWarehouse as $warehouseName => $warehouseLots) {
                $qty = (int) $warehouseLots->sum(fn (StockLot $lot): int => $qtyByLot[$lot->id]);

                $movement = StockMovement::create([
                    'doc_no' => $docNo,
                    'type' => 'return',
                    'stock_item_id' => $item->id,
                    'stock_request_id' => $stockRequest->id,
                    'qty' => $qty,
                    'to_label' => (string) $warehouseName,
                    'reference' => $reference,
                    'recorded_by' => $user->name,
                    'user_id' => $user->id,
                    'notes' => $data['notes'] ?? null,
                    'moved_at' => $movedAt,
                ]);
                $first ??= $movement;

                foreach ($warehouseLots as $lot) {
                    $this->lotService->restore($lot, $qtyByLot[$lot->id], $movement, $reference);
                    $lot->warehouse !== null
                        ? $this->balances->addTo($item, $lot->warehouse, $qtyByLot[$lot->id])
                        : $this->balances->add($item, 'Unassigned', $qtyByLot[$lot->id]);
                }

                $this->bringSerialsBack($serials->whereIn('stock_lot_id', $warehouseLots->modelKeys()), $warehouseLots->first()->warehouse_id, $movement, (string) $warehouseName, $user);
            }

            $item->current_stock += array_sum($qtyByLot);
            if ($item->last_move_at === null || $movedAt->greaterThan($item->last_move_at->endOfDay())) {
                $item->last_move_at = $movedAt->toDateString();
            }
            $item->save();

            return $first;
        });
    }

    /** Re-read the request under lock (so two returns cannot both take what is left) and check it fits this item. */
    private function lockReturnable(StockItem $item, StockRequest $stockRequest): StockRequest
    {
        $locked = StockRequest::lockForUpdate()->findOrFail($stockRequest->id);

        if ($locked->status !== 'fulfilled' || (int) $locked->stock_item_id !== $item->id) {
            Refusal::fail('return_request_invalid', field: 'stock_request_id');
        }

        return $locked;
    }

    /** A return cannot be dated before the request's issue (its first ISS row, or the fulfil time). */
    private function assertNotBeforeIssue(StockRequest $stockRequest, Carbon $movedAt): void
    {
        $firstIssue = StockMovement::where('stock_request_id', $stockRequest->id)->where('type', 'issue')->min('moved_at');
        $issuedAt = $firstIssue !== null ? Carbon::parse($firstIssue) : $stockRequest->fulfilled_at;

        if ($issuedAt !== null && $movedAt->lt($issuedAt)) {
            Refusal::fail('return_before_issue', ['date' => $issuedAt->toDateTimeString()], 'moved_at');
        }
    }

    /**
     * lot id => qty from the picked lot lines (a lot named twice adds up).
     *
     * @param  list<array{lot_id: int, qty: int}>  $lines
     * @return array<int, int>
     */
    private function pickedLots(array $lines): array
    {
        $qtyByLot = [];
        foreach ($lines as $line) {
            $lotId = (int) $line['lot_id'];
            $qtyByLot[$lotId] = ($qtyByLot[$lotId] ?? 0) + (int) $line['qty'];
        }

        return $qtyByLot;
    }

    /**
     * The picked serials, each still out under this request and tied to a lot.
     *
     * @param  list<int>  $serialIds
     * @return Collection<int, StockItemSerial>
     */
    private function issuedSerials(StockItem $item, StockRequest $stockRequest, array $serialIds): Collection
    {
        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::whereIn('id', $ids)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->whereNotNull('stock_lot_id')
            ->lockForUpdate()
            ->get();

        $issueMovementIds = StockMovement::where('stock_request_id', $stockRequest->id)->where('type', 'issue')->pluck('id')->all();
        $lastIssue = StockItemSerialEvent::whereIn('stock_item_serial_id', $serials->modelKeys())
            ->where('event', 'issued')
            ->orderBy('id')
            ->pluck('stock_movement_id', 'stock_item_serial_id');

        $underRequest = $serials->filter(fn (StockItemSerial $serial): bool => in_array($lastIssue->get($serial->id), $issueMovementIds, true));

        if ($ids === [] || $underRequest->count() !== count($ids)) {
            Refusal::fail('return_serials_invalid', field: 'serial_ids');
        }

        return $underRequest->values();
    }

    /**
     * Each lot takes back at most what this request drew from it and has not yet returned.
     *
     * @param  Collection<int, StockLot>  $lots
     * @param  array<int, int>  $qtyByLot
     */
    private function assertWithinIssued(StockRequest $stockRequest, Collection $lots, array $qtyByLot): void
    {
        $issuedLeft = $this->lotService->issuedLeft($stockRequest);

        foreach ($qtyByLot as $lotId => $qty) {
            $left = $issuedLeft[$lotId] ?? 0;
            if ($qty > $left) {
                Refusal::fail('return_lot_over', ['lot_no' => $lots->get($lotId)?->lot_no, 'left' => $left], 'lots');
            }
        }
    }

    /** @param  Collection<int, StockItemSerial>  $serials */
    private function bringSerialsBack(Collection $serials, ?int $warehouseId, StockMovement $movement, string $warehouseName, User $user): void
    {
        if ($serials->isEmpty()) {
            return;
        }

        StockItemSerial::whereIn('id', $serials->modelKeys())->update([
            'status' => 'in_stock',
            'warehouse_id' => $warehouseId,
        ]);

        foreach ($serials as $serial) {
            StockItemSerialEvent::log($serial, 'returned', [
                'stock_movement_id' => $movement->id,
                'warehouse' => $warehouseName,
                'user_id' => $user->id,
                'recorded_by' => $user->name,
                'occurred_at' => $movement->moved_at,
            ]);
        }
    }
}
