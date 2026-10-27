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
use App\Support\DocNumber;
use App\Support\Refusal;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
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

    /** Open a draft in the same warehouse holding only the rows of a confirmed sheet whose count did not match. */
    public function recount(StockCount $original, User $user): StockCount
    {
        if ($original->status !== StockCountStatus::Committed || $original->adjust_mode === StockCountAdjustMode::Manual) {
            Refusal::fail('count_recount_not_committed', ['reference' => $original->reference]);
        }

        $warehouse = $original->warehouse_id === null ? null : Warehouse::find($original->warehouse_id);
        if ($warehouse === null) {
            Refusal::fail('count_needs_warehouse', ['sku' => '']);
        }

        $itemIds = $original->lines()->get()
            ->filter(fn (StockCountLine $line) => ($line->variance() ?? 0) !== 0)
            ->pluck('stock_item_id')->all();
        if ($itemIds === []) {
            Refusal::fail('count_recount_nothing', ['reference' => $original->reference]);
        }

        return $this->open($warehouse, $itemIds, $user, $original);
    }

    /**
     * Save a draft's lines; only the keys present in a line's payload change.
     *
     * @param  array<int, array{counted_qty?: ?int, reason?: ?string, reason_note?: ?string, missing_serial_ids?: ?list<int>, found_serial_ids?: ?list<int>}>  $lines  keyed by line id
     */
    public function saveLines(StockCount $count, array $lines): StockCount
    {
        DB::transaction(function () use ($count, $lines) {
            // Re-read under lock so a commit landing in between cannot be overwritten
            $count->setRawAttributes(StockCount::lockForUpdate()->findOrFail($count->id)->getAttributes(), true);
            abort_unless($count->status === StockCountStatus::Draft, 422, 'count_not_editable');

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
            $lost = $count->lostSerials($line->stock_item_id);
            $valid = $lost !== null && $lost->whereIn('id', $found)->count() === count($found);
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
     * Confirm a draft: every counted line that differs books an ADJ movement on the count's own
     * warehouse, moves that balance and the total, realigns FIFO lots and settles the ticked serials.
     */
    public function commit(StockCount $count, User $user): StockCount
    {
        $adjusted = DB::transaction(function () use ($count, $user): int {
            $this->lockInDraft($count);

            $warehouse = $count->warehouse_id === null ? null : Warehouse::find($count->warehouse_id);
            if ($warehouse === null) {
                Refusal::fail('count_needs_warehouse', ['sku' => '']);
            }

            $lines = $count->lines()->with('item')->orderBy('id')->get();
            $this->assertReasonsGiven($lines);

            // Drafts that overlapped before opening was guarded: confirming both would book the difference twice
            $other = $this->countLock->overlap($lines->pluck('stock_item_id')->all(), $count->warehouse_id, $count->id);
            if ($other !== null) {
                Refusal::fail('count_overlap_commit', ['reference' => $other['reference']]);
            }

            $adjusted = 0;
            foreach ($lines as $line) {
                if ($this->bookLine($count, $line, $warehouse, $user)) {
                    $adjusted++;
                }
            }

            $count->update([
                'status' => StockCountStatus::Committed,
                'committed_at' => now(),
                'committed_by' => $user->id,
                'adjust_mode' => StockCountAdjustMode::Auto,
            ]);

            return $adjusted;
        });

        AuditLog::record('Committed stock count', "{$count->reference} ({$adjusted} items adjusted)", subject: $count);

        return $count->fresh('lines');
    }

    /** Re-read the count under lock inside the transaction so two commits cannot both pass. */
    private function lockInDraft(StockCount $count): void
    {
        $count->setRawAttributes(StockCount::lockForUpdate()->findOrFail($count->id)->getAttributes(), true);
        abort_unless($count->status === StockCountStatus::Draft, 422, 'count_closed');
    }

    /**
     * Every counted line that differs needs a reason on its side, and a custom one its note.
     *
     * @param  EloquentCollection<int, StockCountLine>  $lines
     */
    private function assertReasonsGiven(EloquentCollection $lines): void
    {
        foreach ($lines as $line) {
            $variance = $line->variance();
            if ($variance === null || $variance === 0) {
                continue;
            }

            $sku = (string) $line->item?->sku;
            if ($line->reason === null || ($line->reason === StockCountReason::Custom && blank($line->reason_note))) {
                Refusal::fail('count_reason_missing', ['sku' => $sku]);
            }
            if (! $line->reason->fitsVariance($variance)) {
                Refusal::fail('count_reason_wrong_side', ['sku' => $sku]);
            }
        }
    }

    /** Book one line's difference and settle its ticked serials; true when the stock changed. */
    private function bookLine(StockCount $count, StockCountLine $line, Warehouse $warehouse, User $user): bool
    {
        $variance = $line->variance();
        $missing = $this->uniqueIds($line->missing_serial_ids ?? []);
        $found = $this->uniqueIds($line->found_serial_ids ?? []);
        if ($variance === null || ($variance === 0 && $missing === [] && $found === [])) {
            return false;
        }

        /** @var StockItem|null $item */
        $item = StockItem::whereKey($line->stock_item_id)->lockForUpdate()->first();
        if ($item === null) {
            return false;
        }

        $serials = $item->track_serial ? $this->lockTickedSerials($count, $item, $variance, $missing, $found) : null;

        // A serial line whose losses and finds cancel out moves no stock but still logs every serial
        $movement = $variance === 0 ? null : $this->recordMovement($count, $line, $item, $warehouse, $variance, $user);
        if ($serials !== null) {
            $this->settleSerials($serials, $count, $warehouse, $movement, $user);
        }
        if ($variance === 0) {
            return false;
        }

        $variance > 0
            ? $this->balanceService->addTo($item, $warehouse, $variance)
            : $this->balanceService->removeFrom($item, $warehouse, abs($variance));
        $total = $item->current_stock + $variance;
        $item->update([
            'current_stock' => $total,
            'last_move_at' => now()->toDateString(),
        ]);
        $this->lotService->reconcile($item, $total);

        return true;
    }

    private function recordMovement(StockCount $count, StockCountLine $line, StockItem $item, Warehouse $warehouse, int $variance, User $user): StockMovement
    {
        $type = $variance > 0 ? 'adjust_up' : 'adjust_down';

        return StockMovement::create([
            'doc_no' => DocNumber::next($type, (int) now()->year),
            'type' => $type,
            'stock_item_id' => $item->id,
            'qty' => abs($variance),
            'from_label' => $variance < 0 ? $warehouse->name : null,
            'to_label' => $variance > 0 ? $warehouse->name : null,
            'from_warehouse_id' => $variance < 0 ? $warehouse->id : null,
            'to_warehouse_id' => $variance > 0 ? $warehouse->id : null,
            'reference' => $count->reference,
            'reason' => $line->reason?->value,
            'notes' => $line->reason === StockCountReason::Custom ? $line->reason_note : null,
            'recorded_by' => $user->name,
            'user_id' => $user->id,
            'moved_at' => now(),
        ]);
    }

    /**
     * Re-read the draft's ticked serials under lock: missing ones must still be in stock here, found ones
     * still written off here by the original count, and together they must explain the line's variance.
     *
     * @param  list<int>  $missing
     * @param  list<int>  $found
     * @return array{missing: EloquentCollection<int, StockItemSerial>, found: EloquentCollection<int, StockItemSerial>}
     */
    private function lockTickedSerials(StockCount $count, StockItem $item, int $variance, array $missing, array $found): array
    {
        if ($variance > 0 && $found === []) {
            Refusal::fail('count_serial_over', ['sku' => $item->sku]);
        }

        $serials = fn (string $status) => StockItemSerial::where('stock_item_id', $item->id)
            ->where('warehouse_id', $count->warehouse_id)
            ->where('status', $status)
            ->lockForUpdate();

        $missingRows = $serials('in_stock')->whereIn('id', $missing)->get();
        $lost = $found === [] ? null : $count->lostSerials($item->id);
        $foundRows = $lost === null ? new EloquentCollection : $lost->lockForUpdate()->whereIn('id', $found)->get();

        if ($variance !== count($found) - count($missing) || $missingRows->count() !== count($missing) || $foundRows->count() !== count($found)) {
            Refusal::fail('count_serial_missing_mismatch', ['need' => max(0, count($found) - $variance), 'sku' => $item->sku]);
        }

        return ['missing' => $missingRows, 'found' => $foundRows];
    }

    /**
     * Missing serials are written off as 'adjusted', found ones return to stock; both log an event on the line's movement.
     *
     * @param  array{missing: EloquentCollection<int, StockItemSerial>, found: EloquentCollection<int, StockItemSerial>}  $serials
     */
    private function settleSerials(array $serials, StockCount $count, Warehouse $warehouse, ?StockMovement $movement, User $user): void
    {
        $event = [
            'stock_movement_id' => $movement?->id,
            'reference' => $count->reference,
            'warehouse' => $warehouse->name,
            'user_id' => $user->id,
            'recorded_by' => $user->name,
        ];

        foreach ($serials['missing'] as $serial) {
            $serial->update(['status' => 'adjusted', 'reference' => $count->reference]);
            StockItemSerialEvent::log($serial, 'adjusted', $event);
        }
        foreach ($serials['found'] as $serial) {
            $serial->update(['status' => 'in_stock', 'reference' => $count->reference]);
            StockItemSerialEvent::log($serial, 'found', $event);
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
