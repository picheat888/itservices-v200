<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockItemSerialEvent;
use App\Models\StockMovement;
use App\Services\StockBalanceService;
use App\Services\StockLotService;
use App\Services\StockNotificationService;
use App\Support\DocNumber;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Picqer\Barcode\Renderers\HtmlRenderer;
use Picqer\Barcode\Types\TypeCode128;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockMovementController extends Controller
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
    ) {}

    /**
     * Permission required to record each movement type. Issuing is NOT here on
     * purpose — stock only leaves via fulfilling a Request (see StockRequestController).
     */
    private const TYPE_PERMISSION = [
        'receive' => 'stock.receive',
        'return' => 'stock.return',
        'transfer' => 'stock.transfer',
    ];

    /** Paginated movement log, newest first, optionally filtered by type. */
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        $query = StockMovement::with('item')->orderByDesc('moved_at')->orderByDesc('id');

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }
        if ($request->filled('stock_item_id')) {
            $query->where('stock_item_id', $request->query('stock_item_id'));
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => StockMovementResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /**
     * Serial codes tied to a movement (for the detail dialog), sourced from the serial-event
     * log. Events link primarily by stock_movement_id (receive/transfer/issue all set it now);
     * a shared reference is only a legacy fallback for older events that predate that link —
     * scoped to events with no movement id so it never bleeds serials across split movements
     * that share the same request reference.
     */
    public function serials(Request $request, StockMovement $movement): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return response()->json(['data' => $this->serialCodesFor($movement)]);
    }

    /**
     * The serial codes attached to a movement, ordered. Shared by the detail dialog
     * (serials) and the printable label sheet (labelsPdf).
     *
     * @return Collection<int, string>
     */
    private function serialCodesFor(StockMovement $movement): Collection
    {
        $serialIds = StockItemSerialEvent::query()
            ->where('stock_item_id', $movement->stock_item_id)
            ->where(function ($q) use ($movement) {
                $q->where('stock_movement_id', $movement->id);
                if ($movement->reference) {
                    $q->orWhere(function ($legacy) use ($movement) {
                        $legacy->whereNull('stock_movement_id')->where('reference', $movement->reference);
                    });
                }
            })
            ->pluck('stock_item_serial_id')
            ->unique();

        return StockItemSerial::whereIn('id', $serialIds)->orderBy('serial')->pluck('serial')->values();
    }

    /**
     * Stream an A4 sheet of 50 × 25 mm serial-number stickers for one movement, each
     * carrying a real (scannable) Code 128 barcode. Rendered server-side with dompdf so
     * the output is identical everywhere and immune to browser print settings — the
     * barcode bars are HTML elements dompdf always renders (no "background graphics" toggle).
     */
    public function labelsPdf(Request $request, StockMovement $movement): StreamedResponse
    {
        $user = $request->user();
        abort_unless((bool) (
            $user?->hasPermission('stock.view_events')
            || $user?->hasPermission('stock.receive')
            || $user?->hasPermission('stock.return')
            || $user?->hasPermission('stock.transfer')
        ), 403);

        $movement->loadMissing('item');
        $serials = $this->serialCodesFor($movement);

        // One Code 128 barcode per serial, rendered as HTML (no GD needed). Render at a
        // FIXED width so the bars scale to fill the sticker's inner width (~47 mm ≈ 177 px
        // at 96 dpi) regardless of how many characters the serial has — short serials no
        // longer leave the label looking half-empty.
        $type = new TypeCode128;
        $renderer = new HtmlRenderer;
        $labels = $serials->map(fn (string $serial) => [
            'serial' => $serial,
            'barcode' => $renderer->render($type->getBarcode($serial), 177, 30),
        ])->all();

        $pdf = Pdf::loadView('pdf.serial-labels', [
            'item' => $movement->item,
            'labels' => $labels,
            'warehouse' => $movement->to_label ?: $movement->from_label,
            'date' => $movement->moved_at?->format('Y-m-d'),
        ])->setPaper('a4', 'portrait');

        $bytes = $pdf->output();
        $filename = DocumentName::make('SerialLabels', [$movement->item?->sku]);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'serial-labels.pdf'),
        ]);
    }

    /** Record a movement (receive/issue/return/transfer) and adjust on-hand stock. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPE_PERMISSION))],
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            // Quantity is derived from the serial list on a serialized receive or from
            // serial_ids on a serialized transfer, so it is only required when neither is supplied.
            'qty' => ['required_without_all:serials,serial_ids', 'nullable', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'from_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:200'],
            'to_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:200'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'moved_at' => ['nullable', 'date'],
            'serials' => ['array'],
            'serials.*' => ['nullable', 'string', 'max:120'],
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer', 'exists:stock_item_serials,id'],
        ]);

        abort_unless((bool) $request->user()?->hasPermission(self::TYPE_PERMISSION[$data['type']]), 403);

        $item = StockItem::findOrFail($data['stock_item_id']);
        $serials = $this->validateSerials($data, $item);
        $this->validateReturnSerials($data, $item);

        $movement = $this->record($data, $request->user()?->name, $request->user()?->id, $serials);

        // Fire a real-time stock-level alert now that on-hand has changed.
        app(StockNotificationService::class)->alert($item->fresh());

        return (new StockMovementResource($movement->load('item')))->response()->setStatusCode(201);
    }

    /**
     * For serialized receives, normalise and validate the captured serials:
     * each must be non-empty, unique within the batch, and not already known to
     * the system. Returns the cleaned serial list ([] for non-serialized moves).
     *
     * @param  array<string, mixed>  $data
     * @return array<int, string>
     */
    private function validateSerials(array $data, StockItem $item): array
    {
        if ($data['type'] !== 'receive' || ! $item->track_serial) {
            return [];
        }

        $serials = collect($data['serials'] ?? [])
            ->map(fn ($s) => trim((string) $s))
            ->filter()
            ->values();

        if ($serials->isEmpty()) {
            throw ValidationException::withMessages([
                'serials' => 'This item is serialized — capture a serial for every unit.',
            ]);
        }

        // Duplicates within the submitted batch (case-insensitive).
        $dupes = $serials->map(fn ($s) => mb_strtolower($s))->duplicates()->unique();
        if ($dupes->isNotEmpty()) {
            throw ValidationException::withMessages([
                'serials' => 'Duplicate serials in this batch: '.$dupes->implode(', '),
            ]);
        }

        // Already registered against any SKU in the system (case-insensitive).
        $lowered = $serials->map(fn ($s) => mb_strtolower($s))->all();
        $clash = StockItemSerial::whereIn(DB::raw('LOWER(serial)'), $lowered)->pluck('serial');
        if ($clash->isNotEmpty()) {
            throw ValidationException::withMessages([
                'serials' => 'Already in stock: '.$clash->implode(', '),
            ]);
        }

        return $serials->all();
    }

    /**
     * For a serialized return, every chosen serial must belong to the item and be
     * currently issued (you can only return what is out). No-op otherwise.
     *
     * @param  array<string, mixed>  $data
     */
    private function validateReturnSerials(array $data, StockItem $item): void
    {
        if ($data['type'] !== 'return' || ! $item->track_serial) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $data['serial_ids'] ?? [])));
        if ($ids === []) {
            throw ValidationException::withMessages([
                'serial_ids' => 'This item is serialized — select the issued serial(s) to return.',
            ]);
        }

        $issued = StockItemSerial::whereIn('id', $ids)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->count();

        if ($issued !== count($ids)) {
            throw ValidationException::withMessages([
                'serial_ids' => 'Each selected serial must belong to this item and be currently issued.',
            ]);
        }
    }

    /**
     * Persist a movement and apply its delta to the item's current stock inside a
     * transaction. Transfer movements are stock- and cost-neutral: only the per-warehouse
     * balance (and serial location for serialized items) is moved. Outbound (non-transfer)
     * movements that would drive stock negative are rejected. When serials are supplied
     * (serialized receive), the unit count is driven by the serial list and one
     * StockItemSerial row is registered per unit.
     *
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $serials
     */
    public function record(array $data, ?string $recordedBy, ?int $userId = null, array $serials = []): StockMovement
    {
        return DB::transaction(function () use ($data, $recordedBy, $userId, $serials) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);
            $type = $data['type'];
            $isTransfer = $type === 'transfer';
            $inbound = in_array($type, StockMovement::INBOUND, true);

            // Quantity: serialized receive → number of serials; serialized transfer → number of picked serials.
            $serialIds = $data['serial_ids'] ?? [];
            $qty = match (true) {
                $serials !== [] => count($serials),
                $isTransfer && $item->track_serial => count($serialIds),
                $type === 'return' && $item->track_serial && $serialIds !== [] => count($serialIds),
                default => (int) ($data['qty'] ?? 0),
            };

            $fromWh = $data['from_label'] ?? null;
            $toWh = $data['to_label'] ?? null;

            // Outbound (non-transfer) needs enough total stock; transfer/issue per-warehouse
            // guard is enforced by the balance service below.
            if (! $inbound && ! $isTransfer && $item->current_stock < $qty) {
                throw ValidationException::withMessages(['qty' => "Not enough stock: {$item->current_stock} available."]);
            }

            $unitCost = $type === 'receive' && isset($data['unit_cost']) ? (float) $data['unit_cost'] : null;
            $movedAt = isset($data['moved_at']) ? Carbon::parse($data['moved_at']) : now();

            $movement = StockMovement::create([
                'doc_no' => DocNumber::next($type, (int) $movedAt->year),
                'type' => $type,
                'stock_item_id' => $item->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                // A return carries neither a source label nor an external reference
                // (only the destination warehouse matters), so drop them for that type.
                'from_label' => $type === 'return' ? null : $fromWh,
                'to_label' => $toWh,
                'reference' => $type === 'return' ? null : ($data['reference'] ?? null),
                'recorded_by' => $recordedBy,
                'user_id' => $userId,
                'notes' => $data['notes'] ?? null,
                'moved_at' => $movedAt,
            ]);

            if ($isTransfer) {
                // Stock- and cost-neutral: only the per-warehouse balance (and serial location) move.
                $this->balances->move($item, (string) $fromWh, (string) $toWh, $qty);
                if ($item->track_serial && $serialIds !== []) {
                    $moved = StockItemSerial::whereIn('id', $serialIds)->where('stock_item_id', $item->id)->get();
                    StockItemSerial::whereIn('id', $moved->pluck('id'))->update(['warehouse' => $toWh]);
                    foreach ($moved as $row) {
                        StockItemSerialEvent::log($row, 'transferred', [
                            'stock_movement_id' => $movement->id,
                            'from_label' => (string) $fromWh,
                            'to_label' => (string) $toWh,
                            'user_id' => $userId,
                            'recorded_by' => $recordedBy,
                            'occurred_at' => $movement->moved_at,
                        ]);
                    }
                }
                $item->last_move_at = $movement->moved_at->toDateString();
                $item->save();
            } else {
                // Resolve the inbound lot cost BEFORE changing current_stock: a null-cost
                // (qty-only return) lot must value at the average of the stock that existed
                // *before* this movement, not the inflated post-increment denominator.
                $inboundLotCost = $inbound ? ($unitCost ?? $item->avgCost()) : null;

                $item->current_stock += $movement->delta();
                $item->last_move_at = $movement->moved_at->toDateString();
                $item->save();

                if ($inbound) {
                    // Resolve the destination warehouse once; default to 'Unassigned'
                    // (never '') when the caller didn't pick one, so balances and serials agree.
                    $inboundWarehouse = $toWh ?: 'Unassigned';
                    $this->balances->add($item, $inboundWarehouse, $qty);

                    if ($type === 'return' && $item->track_serial && $serialIds !== []) {
                        $this->returnSerials($item, $serialIds, $inboundWarehouse, $movement, $recordedBy, $userId, $inboundLotCost);
                    } else {
                        $this->lotService->addLot($item, $qty, $inboundLotCost, $movement->id, $movement->moved_at);
                    }
                } else {
                    $this->balances->remove($item, (string) $fromWh, $qty);
                    $this->lotService->consume($item, $qty);
                }

                // Register each received unit's serial against the SKU + log a history event.
                foreach ($serials as $serial) {
                    $row = StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => $serial,
                        'status' => 'in_stock',
                        'warehouse' => $inboundWarehouse,
                        'reference' => $data['reference'] ?? null,
                        'received_at' => $movement->moved_at,
                    ]);
                    StockItemSerialEvent::log($row, 'received', [
                        'stock_movement_id' => $movement->id,
                        'reference' => $data['reference'] ?? null,
                        'warehouse' => $inboundWarehouse,
                        'user_id' => $userId,
                        'recorded_by' => $recordedBy,
                        'occurred_at' => $movement->moved_at,
                    ]);
                }
            }

            AuditLog::record('Stock '.$type, "{$item->sku} ×{$qty}");

            return $movement;
        });
    }

    /**
     * Bring previously-issued serials back into stock: flip them to in_stock in the
     * destination warehouse, reopen FIFO lots at each unit's original receive cost,
     * and log a 'returned' event per serial linked to the return movement.
     *
     * When a serial's original receive movement had a NULL unit_cost (qty-only receive),
     * $fallbackCost is used instead of letting addLot recompute avgCost() on the
     * already-incremented item — $fallbackCost must be the pre-movement average captured
     * by the caller before current_stock was incremented.
     *
     * @param  array<int>  $serialIds
     */
    private function returnSerials(StockItem $item, array $serialIds, string $warehouse, StockMovement $movement, ?string $recordedBy, ?int $userId, ?float $fallbackCost = null): void
    {
        $serials = StockItemSerial::with('movement')
            ->whereIn('id', $serialIds)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->get();

        StockItemSerial::whereIn('id', $serials->pluck('id'))->update([
            'status' => 'in_stock',
            'warehouse' => $warehouse,
        ]);

        // Reopen one FIFO lot per distinct original receive cost. The serial's
        // stock_movement_id still points at its receive movement (transfers never change it).
        // When the original cost is null, use $fallbackCost (pre-increment average) so we
        // never call avgCost() on the already-incremented item's denominator.
        $serials->groupBy(fn (StockItemSerial $s) => $s->movement?->unit_cost)
            ->each(function ($group) use ($item, $movement, $fallbackCost) {
                $cost = $group->first()->movement?->unit_cost;
                $lotCost = $cost !== null ? (float) $cost : $fallbackCost;
                $this->lotService->addLot($item, $group->count(), $lotCost, $movement->id, $movement->moved_at);
            });

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'returned', [
                'stock_movement_id' => $movement->id,
                'warehouse' => $warehouse,
                'user_id' => $userId,
                'recorded_by' => $recordedBy,
                'occurred_at' => $movement->moved_at,
            ]);
        }
    }
}
