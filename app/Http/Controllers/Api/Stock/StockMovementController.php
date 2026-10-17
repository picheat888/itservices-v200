<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Resources\Stock\StockMovementResource;
use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Services\Stock\StockBalanceService;
use App\Services\Stock\StockCountLock;
use App\Services\Stock\StockLotService;
use App\Services\Stock\StockNotificationService;
use App\Support\DateDisplay;
use App\Support\DocNumber;
use App\Support\DocumentName;
use App\Support\Refusal;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Picqer\Barcode\Renderers\HtmlRenderer;
use Picqer\Barcode\Types\TypeCode128;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockMovementController extends Controller
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
        private readonly StockCountLock $countLock,
    ) {}

    /** Permission per movement type; issuing only happens by fulfilling a Request (StockRequestController). */
    private const TYPE_PERMISSION = [
        'receive' => 'stock.receive',
        'return' => 'stock.return',
        'transfer' => 'stock.transfer',
    ];

    /** Paginated movement log, newest first, optionally filtered by type. */
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        $query = StockMovement::with(['item', 'user.employee'])->orderByDesc('moved_at')->orderByDesc('id');

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

    /** Serial codes tied to a movement (for the detail dialog), sourced from the serial-event log. */
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

    /** Stream an A4 sheet of 50 × 25 mm Code 128 serial stickers for one movement (dompdf). */
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

        // One Code 128 barcode per serial as HTML, at a fixed width (~47 mm ≈ 177 px) to fill the sticker.
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
            'date' => DateDisplay::date($movement->moved_at, null, 'en'),
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
        // Warehouse labels name an existing warehouse or the 'Unassigned' sentinel; a receive's from_label is the vendor.
        $knownWarehouse = fn (string $field) => Rule::when(
            fn ($input) => $input->{$field} !== 'Unassigned' && ($field === 'to_label' || $input->type === 'transfer'),
            Rule::exists('warehouses', 'name'),
        );

        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPE_PERMISSION))],
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            // qty is derived from serials (serialized receive) or serial_ids (serialized transfer / return).
            'qty' => ['required_without_all:serials,serial_ids', 'nullable', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'from_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:120', $knownWarehouse('from_label')],
            'to_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:120', $knownWarehouse('to_label')],
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
        $this->validateTransferSerials($data, $item);

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
            Refusal::fail('serials_required', field: 'serials');
        }

        // Duplicates within the submitted batch (case-insensitive).
        $dupes = $serials->map(fn ($s) => mb_strtolower($s))->duplicates()->unique();
        if ($dupes->isNotEmpty()) {
            Refusal::fail('serials_duplicate', ['serials' => $dupes->implode(', ')], 'serials');
        }

        // Already registered against any SKU in the system (case-insensitive).
        $lowered = $serials->map(fn ($s) => mb_strtolower($s))->all();
        $clash = StockItemSerial::whereIn(DB::raw('LOWER(serial)'), $lowered)->pluck('serial');
        if ($clash->isNotEmpty()) {
            Refusal::fail('serials_already_in_stock', ['serials' => $clash->implode(', ')], 'serials');
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
            Refusal::fail('return_serials_required', field: 'serial_ids');
        }

        $issued = StockItemSerial::whereIn('id', $ids)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->count();

        if ($issued !== count($ids)) {
            Refusal::fail('return_serials_invalid', field: 'serial_ids');
        }
    }

    /**
     * For a serialized transfer, every chosen serial must belong to the item, be in stock,
     * and sit in the source warehouse. No-op otherwise.
     *
     * @param  array<string, mixed>  $data
     */
    private function validateTransferSerials(array $data, StockItem $item): void
    {
        if ($data['type'] !== 'transfer' || ! $item->track_serial) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $data['serial_ids'] ?? [])));
        if ($ids === []) {
            Refusal::fail('transfer_serials_required', field: 'serial_ids');
        }

        $fromLabel = (string) ($data['from_label'] ?? '');
        $sourceWarehouseId = $fromLabel === 'Unassigned' ? null : Warehouse::where('name', $fromLabel)->value('id');

        $inSource = StockItemSerial::whereIn('id', $ids)
            ->where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->where('warehouse_id', $sourceWarehouseId)
            ->count();

        if ($inSource !== count($ids)) {
            Refusal::fail('transfer_serials_invalid', field: 'serial_ids');
        }
    }

    /**
     * Persist a movement and apply it to the item's stock, balances, lots and serials in one transaction.
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

            $serialIds = array_values(array_unique(array_map('intval', $data['serial_ids'] ?? [])));
            // Serialized transfer: the item's own serials among the picked ids; qty follows this list.
            $transferSerials = $isTransfer && $item->track_serial && $serialIds !== []
                ? StockItemSerial::lockForUpdate()->whereIn('id', $serialIds)->where('stock_item_id', $item->id)->get()
                : collect();

            // Quantity: serialized receive → number of serials; serialized transfer/return → number of picked serials.
            $qty = match (true) {
                $serials !== [] => count($serials),
                $isTransfer && $item->track_serial => $transferSerials->count(),
                $type === 'return' && $item->track_serial && $serialIds !== [] => count($serialIds),
                default => (int) ($data['qty'] ?? 0),
            };

            $fromWh = $data['from_label'] ?? null;
            $toWh = $data['to_label'] ?? null;

            $this->countLock->assertFree($item->id, [
                in_array($type, StockMovement::FROM_WAREHOUSE, true) ? $fromWh : null,
                in_array($type, StockMovement::TO_WAREHOUSE, true) ? $toWh : null,
            ]);

            // Outbound (non-transfer) needs enough total stock; per-warehouse guard is in the balance service.
            if (! $inbound && ! $isTransfer && $item->current_stock < $qty) {
                Refusal::fail('not_enough_stock', ['available' => $item->current_stock], 'qty');
            }

            $unitCost = $type === 'receive' && isset($data['unit_cost']) ? (float) $data['unit_cost'] : null;
            $movedAt = isset($data['moved_at']) ? Carbon::parse($data['moved_at']) : now();

            $movement = StockMovement::create([
                'doc_no' => DocNumber::next($type, (int) $movedAt->year),
                'type' => $type,
                'stock_item_id' => $item->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                // A return keeps only its destination warehouse.
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
                if ($transferSerials->isNotEmpty()) {
                    StockItemSerial::whereIn('id', $transferSerials->pluck('id'))->update(['warehouse_id' => Warehouse::resolveId((string) $toWh)]);
                    foreach ($transferSerials as $row) {
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
                // Inbound lot cost is the pre-movement average, so resolve it before current_stock changes.
                $inboundLotCost = $inbound ? ($unitCost ?? $item->avgCost()) : null;

                $item->current_stock += $movement->delta();
                $item->last_move_at = $movement->moved_at->toDateString();
                $item->save();

                if ($inbound) {
                    // Destination defaults to 'Unassigned' (never '') so balances and serials agree.
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
                        'warehouse_id' => Warehouse::resolveId($inboundWarehouse),
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

            AuditLog::record('Stock '.$type, "{$item->sku} ×{$qty}", subject: $item);

            return $movement;
        });
    }

    /**
     * Bring issued serials back into stock in the destination warehouse, reopening FIFO lots at
     * each unit's receive cost ($fallbackCost = pre-movement average when that cost is null).
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
            'warehouse_id' => Warehouse::resolveId($warehouse),
        ]);

        // One FIFO lot per distinct receive cost (the serial's stock_movement_id is its receive movement).
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
