<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockMovement;
use App\Services\StockLotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockMovementController extends Controller
{
    public function __construct(private readonly StockLotService $lotService) {}

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
        abort_unless((bool) $request->user()?->hasPermission('stock.view'), 403);

        $query = StockMovement::with('item')->orderByDesc('moved_at');

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }
        if ($request->filled('stock_item_id')) {
            $query->where('stock_item_id', $request->query('stock_item_id'));
        }

        $movements = $query->limit(200)->get();

        return response()->json([
            'data' => StockMovementResource::collection($movements),
            'meta' => ['total' => $movements->count()],
        ]);
    }

    /** Record a movement (receive/issue/return/transfer) and adjust on-hand stock. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPE_PERMISSION))],
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            // Quantity is derived from the serial list on a serialized receive,
            // so it is only required when no serials are supplied.
            'qty' => ['required_without:serials', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'from_label' => ['nullable', 'string', 'max:200'],
            'to_label' => ['nullable', 'string', 'max:200'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'moved_at' => ['nullable', 'date'],
            'serials' => ['array'],
            'serials.*' => ['nullable', 'string', 'max:120'],
        ]);

        abort_unless((bool) $request->user()?->hasPermission(self::TYPE_PERMISSION[$data['type']]), 403);

        $item = StockItem::findOrFail($data['stock_item_id']);
        $serials = $this->validateSerials($data, $item);

        $movement = $this->record($data, $request->user()?->name, $request->user()?->id, $serials);

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
     * Persist a movement and apply its delta to the item's current stock inside a
     * transaction. Outbound movements that would drive stock negative are rejected.
     * When serials are supplied (serialized receive), the unit count is driven by
     * the serial list and one StockItemSerial row is registered per unit.
     *
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $serials
     */
    public function record(array $data, ?string $recordedBy, ?int $userId = null, array $serials = []): StockMovement
    {
        return DB::transaction(function () use ($data, $recordedBy, $userId, $serials) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);
            $inbound = in_array($data['type'], StockMovement::INBOUND, true);

            // For serialized receives the quantity is exactly the number of serials.
            $qty = $serials !== [] ? count($serials) : (int) ($data['qty'] ?? 0);

            if (! $inbound && $item->current_stock < $qty) {
                throw ValidationException::withMessages([
                    'qty' => "Not enough stock: {$item->current_stock} available.",
                ]);
            }

            // Unit cost is only meaningful when receiving a lot.
            $unitCost = $data['type'] === 'receive' && isset($data['unit_cost']) ? (float) $data['unit_cost'] : null;

            $movement = StockMovement::create([
                'type' => $data['type'],
                'stock_item_id' => $item->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                'from_label' => $data['from_label'] ?? null,
                'to_label' => $data['to_label'] ?? null,
                'reference' => $data['reference'] ?? null,
                'recorded_by' => $recordedBy,
                'user_id' => $userId,
                'notes' => $data['notes'] ?? null,
                'moved_at' => $data['moved_at'] ?? now(),
            ]);

            $item->current_stock += $movement->delta();
            $item->last_move_at = $movement->moved_at->toDateString();
            $item->save();

            // FIFO lots: inbound opens a lot, outbound draws down oldest-first.
            if ($inbound) {
                $this->lotService->addLot($item, $qty, $unitCost, $movement->id, $movement->moved_at);
            } else {
                $this->lotService->consume($item, $qty);
            }

            // Register each received unit's serial against the SKU.
            foreach ($serials as $serial) {
                StockItemSerial::create([
                    'stock_item_id' => $item->id,
                    'stock_movement_id' => $movement->id,
                    'serial' => $serial,
                    'status' => 'in_stock',
                    'warehouse' => $data['to_label'] ?? $item->warehouse,
                    'reference' => $data['reference'] ?? null,
                    'received_at' => $movement->moved_at,
                ]);
            }

            AuditLog::record('Stock '.$data['type'], "{$item->sku} ×{$qty}");

            return $movement;
        });
    }
}
