<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockMovementController extends Controller
{
    /** Permission required to record each movement type. */
    private const TYPE_PERMISSION = [
        'receive' => 'stock.receive',
        'issue' => 'stock.fulfill',
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
            'qty' => ['required', 'integer', 'min:1'],
            'from_label' => ['nullable', 'string', 'max:200'],
            'to_label' => ['nullable', 'string', 'max:200'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'moved_at' => ['nullable', 'date'],
        ]);

        abort_unless((bool) $request->user()?->hasPermission(self::TYPE_PERMISSION[$data['type']]), 403);

        $movement = $this->record($data, $request->user()?->name);

        return (new StockMovementResource($movement->load('item')))->response()->setStatusCode(201);
    }

    /**
     * Persist a movement and apply its delta to the item's current stock inside a
     * transaction. Outbound movements that would drive stock negative are rejected.
     *
     * @param  array<string, mixed>  $data
     */
    public function record(array $data, ?string $recordedBy, ?int $userId = null): StockMovement
    {
        return DB::transaction(function () use ($data, $recordedBy, $userId) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);
            $inbound = in_array($data['type'], StockMovement::INBOUND, true);

            if (! $inbound && $item->current_stock < $data['qty']) {
                throw ValidationException::withMessages([
                    'qty' => "Not enough stock: {$item->current_stock} available.",
                ]);
            }

            $movement = StockMovement::create([
                'type' => $data['type'],
                'stock_item_id' => $item->id,
                'qty' => $data['qty'],
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

            AuditLog::record('Stock '.$data['type'], "{$item->sku} ×{$data['qty']}");

            return $movement;
        });
    }
}
