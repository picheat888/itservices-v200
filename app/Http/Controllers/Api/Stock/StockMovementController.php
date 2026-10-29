<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Resources\Stock\StockMovementResource;
use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Services\Stock\StockLotReader;
use App\Services\Stock\StockNotificationService;
use App\Services\Stock\StockReceiveService;
use App\Services\Stock\StockReturnService;
use App\Services\Stock\StockTransferService;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\SearchTerms;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Picqer\Barcode\Renderers\HtmlRenderer;
use Picqer\Barcode\Types\TypeCode128;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockMovementController extends Controller
{
    public function __construct(
        private readonly StockReceiveService $receives,
        private readonly StockReturnService $returns,
        private readonly StockTransferService $transfers,
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

        SearchTerms::apply($query, $request->query('search'), [
            'doc_no', 'reference', 'recorded_by',
            SearchTerms::related('item', ['sku', 'name']),
            SearchTerms::related('user', [SearchTerms::related('employee', ['code', ...SearchTerms::personName()])]),
        ]);

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

    /** One movement, behind the movement log's gate (a just-recorded row pinned on top of the log). */
    public function show(Request $request, StockMovement $movement): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return (new StockMovementResource($movement->load(['item', 'user.employee'])))->response();
    }

    /** Serial codes tied to a movement (for the detail dialog), sourced from the serial-event log. */
    public function serials(Request $request, StockMovement $movement): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return response()->json(['data' => $this->serialCodesFor($movement)]);
    }

    /** The lots this movement's document touched, its request's returns and what is still returnable. */
    public function lots(Request $request, StockMovement $movement, StockLotReader $reader): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return response()->json(['data' => $reader->forMovement($movement)]);
    }

    /**
     * The serial codes attached to a movement, ordered (the detail dialog's list).
     *
     * @return Collection<int, string>
     */
    private function serialCodesFor(StockMovement $movement): Collection
    {
        return $this->serialsOf($movement)->pluck('serial')->values();
    }

    /**
     * The serials attached to a movement, ordered by code; shared by the detail dialog and the sticker sheet.
     *
     * @return Builder<StockItemSerial>
     */
    private function serialsOf(StockMovement $movement): Builder
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

        return StockItemSerial::whereIn('id', $serialIds)->orderBy('serial');
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

        $movement->loadMissing('item.category');
        $serials = $this->serialsOf($movement)->with('lot:id,lot_no')->get();

        // One Code 128 barcode per serial as HTML, at a fixed width (~47 mm ≈ 177 px) to fill the sticker.
        $type = new TypeCode128;
        $renderer = new HtmlRenderer;
        $labels = $serials->map(fn (StockItemSerial $serial) => [
            'serial' => $serial->serial,
            'lot_no' => $serial->lot?->lot_no,
            'barcode' => $renderer->render($type->getBarcode($serial->serial), 177, 30),
        ])->all();

        $pdf = Pdf::loadView('pdf.serial-labels', [
            'item' => $movement->item,
            'labels' => $labels,
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
            // qty is derived from serials (serialized receive), serial_ids (serialized return) or lots (return / transfer).
            'qty' => ['exclude_if:type,return', 'prohibited_if:type,transfer', 'required_without_all:serials,serial_ids,lot_ids', Rule::requiredIf(fn () => $request->input('type') === 'receive' && ! $this->isSerialItem($request->input('stock_item_id'))), 'nullable', 'integer', 'min:1', Rule::when($request->input('type') === 'receive', 'max:1000000')],
            'unit_cost' => ['nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'from_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:120', $knownWarehouse('from_label')],
            'to_label' => ['required_if:type,transfer', 'prohibited_if:type,return', 'nullable', 'string', 'max:120', $knownWarehouse('to_label')],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'moved_at' => ['nullable', 'date', 'before_or_equal:now'],
            'serials' => ['prohibited_if:type,transfer', 'array'],
            'serials.*' => ['nullable', 'string', 'max:120'],
            'serial_ids' => ['prohibited_if:type,transfer', 'array'],
            'serial_ids.*' => ['integer', 'exists:stock_item_serials,id'],
            // A transfer names the whole lots it moves
            'lot_ids' => ['required_if:type,transfer', 'exclude_unless:type,transfer', 'array', 'min:1'],
            'lot_ids.*' => ['integer', 'exists:stock_lots,id'],
            // A return names the fulfilled request and, for non-serial items, the lots it gives back to.
            'stock_request_id' => ['required_if:type,return', 'exclude_unless:type,return', 'integer', 'exists:stock_requests,id'],
            'lots' => [Rule::requiredIf(fn () => $request->input('type') === 'return' && ! $this->isSerialItem($request->input('stock_item_id'))), 'exclude_unless:type,return', 'array'],
            'lots.*.lot_id' => ['required', 'integer', 'exists:stock_lots,id'],
            'lots.*.qty' => ['required', 'integer', 'min:1', 'max:1000000'],
        ]);

        abort_unless((bool) $request->user()?->hasPermission(self::TYPE_PERMISSION[$data['type']]), 403);

        $item = StockItem::findOrFail($data['stock_item_id']);

        if ($data['type'] === 'return') {
            $this->returns->assertSerialsPicked($item, $data);
            $movement = $this->returns->record($item, StockRequest::findOrFail($data['stock_request_id']), $data, $request->user());
            $returned = (int) StockMovement::where('type', 'return')->where('doc_no', $movement->doc_no)->sum('qty');
            AuditLog::record('Stock return', "{$item->sku} ×{$returned}", subject: $item);
        } elseif ($data['type'] === 'transfer') {
            $movement = $this->transfers->record($item, $data['from_label'], $data['to_label'], $data['lot_ids'], $data, $request->user());
            AuditLog::record('Stock transfer', "{$item->sku} ×{$movement->qty}", subject: $item);
        } else {
            $serials = $this->receives->serialsToReceive($item, $data);
            $movement = $this->receives->record($data, $request->user()?->name, $request->user()?->id, $serials);
        }

        // Fire a real-time stock-level alert now that on-hand has changed.
        app(StockNotificationService::class)->alert($item->fresh());

        return (new StockMovementResource($movement->load('item')))->response()->setStatusCode(201);
    }

    /** Whether the item tracks serials; feeds the qty and lots rules above. */
    private function isSerialItem(mixed $stockItemId): bool
    {
        return is_numeric($stockItemId) && (bool) StockItem::whereKey((int) $stockItemId)->value('track_serial');
    }
}
