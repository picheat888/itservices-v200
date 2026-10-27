<?php

namespace App\Services\Stock;

use App\Enums\Stock\StockCountAdjustMode;
use App\Enums\Stock\StockCountReason;
use App\Enums\Stock\StockCountStatus;
use App\Models\AuditLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
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
        private readonly StockCountLock $countLock,
    ) {}

    /**
     * Open a draft sheet for one warehouse, snapshotting that warehouse's quantity of each item.
     *
     * @param  list<int>  $stockItemIds
     */
    public function open(Warehouse $warehouse, array $stockItemIds, User $user, ?StockCount $recountOf = null): StockCount
    {
        return DB::transaction(function () use ($warehouse, $stockItemIds, $user, $recountOf) {
            $count = StockCount::create([
                'warehouse_id' => $warehouse->id,
                'warehouse' => $warehouse->name,
                'recount_of_id' => $recountOf?->id,
                'status' => StockCountStatus::Draft,
                'counted_by' => $user->id,
            ]);

            // Rows locked so two counts opened at once cannot both pass the overlap check
            $items = StockItem::query()->whereIn('id', $stockItemIds)->orderBy('sku')
                ->lockForUpdate()->get(['id', 'current_stock', 'track_serial']);
            $this->countLock->assertNoOverlap($items->modelKeys(), $warehouse->id);

            foreach ($items as $item) {
                // Serialized: in-stock serials of this warehouse; else this warehouse's balance (no row = 0)
                $systemQty = $item->track_serial
                    ? $item->serials()->where('status', 'in_stock')->where('warehouse_id', $warehouse->id)->count()
                    : (int) $item->balances()->where('warehouse_id', $warehouse->id)->value('qty');

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
     * Save a draft's lines; only the keys present in a line's payload change.
     *
     * @param  array<int, array{counted_qty?: ?int, reason?: ?string, reason_note?: ?string, missing_serial_ids?: ?list<int>, found_serial_ids?: ?list<int>}>  $lines  keyed by line id
     */
    public function saveLines(StockCount $count, array $lines): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'count_not_editable');

        DB::transaction(function () use ($count, $lines) {
            foreach ($count->lines()->with('item')->get() as $line) {
                if (array_key_exists($line->id, $lines)) {
                    $this->saveLine($count, $line, $lines[$line->id]);
                }
            }
        });

        return $count->fresh('lines');
    }

    /** @param  array{counted_qty?: ?int, reason?: ?string, reason_note?: ?string, missing_serial_ids?: ?list<int>, found_serial_ids?: ?list<int>}  $payload */
    private function saveLine(StockCount $count, StockCountLine $line, array $payload): void
    {
        $sku = (string) $line->item?->sku;
        $isSerial = (bool) $line->item?->track_serial;
        $clearing = array_key_exists('counted_qty', $payload) && $payload['counted_qty'] === null;

        if ($clearing) {
            $line->update(['counted_qty' => null, 'reason' => null, 'reason_note' => null, 'missing_serial_ids' => null, 'found_serial_ids' => null]);

            return;
        }

        $changes = [];

        if ($isSerial && (array_key_exists('missing_serial_ids', $payload) || array_key_exists('found_serial_ids', $payload))) {
            $missing = $this->uniqueIds($payload['missing_serial_ids'] ?? $line->missing_serial_ids ?? []);
            $found = $this->uniqueIds($payload['found_serial_ids'] ?? $line->found_serial_ids ?? []);
            $this->assertSerialsBelong($count, $line, $missing, $found);

            $changes['missing_serial_ids'] = $missing;
            $changes['found_serial_ids'] = $found;
            $changes['counted_qty'] = $line->system_qty - count($missing) + count($found);
        } elseif (! $isSerial && array_key_exists('counted_qty', $payload)) {
            $changes['counted_qty'] = (int) $payload['counted_qty'];
        }

        if (array_key_exists('reason', $payload)) {
            $changes['reason'] = $payload['reason'] === null ? null : StockCountReason::from($payload['reason']);
        }
        if (array_key_exists('reason_note', $payload)) {
            $changes['reason_note'] = $payload['reason_note'];
        }

        $line->fill($changes);
        $this->assertReasonFits($line, $sku);
        $line->save();
    }

    /** A reason must explain the line's variance, and a custom one needs its note. */
    private function assertReasonFits(StockCountLine $line, string $sku): void
    {
        if ($line->reason === null) {
            return;
        }

        $variance = $line->variance();
        if ($variance === null || ! $line->reason->fitsVariance($variance)) {
            Refusal::fail('count_reason_wrong_side', ['sku' => $sku]);
        }
        if ($line->reason === StockCountReason::Custom && blank($line->reason_note)) {
            Refusal::fail('count_reason_note_missing', ['sku' => $sku]);
        }
    }

    /**
     * Ticked-missing ids must be this warehouse's in-stock serials of the item; found ids must be the
     * adjusted serials the original count wrote off here (recounts only).
     *
     * @param  list<int>  $missing
     * @param  list<int>  $found
     */
    private function assertSerialsBelong(StockCount $count, StockCountLine $line, array $missing, array $found): void
    {
        $query = fn (string $status) => StockItemSerial::where('stock_item_id', $line->stock_item_id)
            ->where('warehouse_id', $count->warehouse_id)
            ->where('status', $status);

        $valid = $missing === [] || $query('in_stock')->whereIn('id', $missing)->count() === count($missing);

        if ($valid && $found !== []) {
            $original = $count->recountOf;
            $valid = $original !== null
                && $query('adjusted')->where('reference', $original->reference)->whereIn('id', $found)->count() === count($found);
        }

        if (! $valid) {
            Refusal::fail('count_serial_not_here', ['sku' => (string) $line->item?->sku]);
        }
    }

    /**
     * @param  array<int, mixed>  $ids
     * @return list<int>
     */
    private function uniqueIds(array $ids): array
    {
        return array_values(array_unique(array_map('intval', $ids)));
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
                // Drafts that overlapped before opening was guarded: confirming both would book the difference twice
                $other = $this->countLock->overlap($lines->pluck('stock_item_id')->all(), $count->warehouse_id, $count->id);
                if ($other !== null) {
                    Refusal::fail('count_overlap_commit', ['reference' => $other['reference']]);
                }

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
