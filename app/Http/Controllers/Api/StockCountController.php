<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockCountResource;
use App\Models\StockCount;
use App\Services\StockCountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockCountController extends Controller
{
    public function __construct(private readonly StockCountService $service) {}

    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.audit'), 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->gate($request);
        $counts = StockCount::with(['countedBy', 'lines'])->latest('id')->limit(100)->get();

        return response()->json(['data' => StockCountResource::collection($counts)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'warehouse' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $count = $this->service->open($data, $request->user());

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);

        return (new StockCountResource($stockCount->load(['countedBy', 'lines.item'])))->response();
    }

    public function update(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'counts' => ['required', 'array'],
            'counts.*' => ['nullable', 'integer', 'min:0'],
        ]);

        // keys arrive as strings from JSON; cast to int line ids.
        $byLineId = [];
        foreach ($data['counts'] as $lineId => $qty) {
            $byLineId[(int) $lineId] = $qty === null ? null : (int) $qty;
        }

        $count = $this->service->saveCounts($stockCount, $byLineId);

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $count = $this->service->commit($stockCount, $request->user());

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $this->service->cancel($stockCount);

        return response()->json(['message' => 'success']);
    }
}
