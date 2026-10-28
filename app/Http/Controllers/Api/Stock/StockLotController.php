<?php

// One lot by its number: the lot page, the scan-box lookup and the lot's QR image.

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Models\Stock\StockLot;
use App\Services\Stock\StockLotReader;
use App\Support\LotQr;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class StockLotController extends Controller
{
    public function __construct(private readonly StockLotReader $reader) {}

    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view'), 403);
    }

    public function show(Request $request, string $lotNo): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => $this->reader->detail($this->lot($lotNo))]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $this->gateView($request);
        $data = $request->validate(['code' => ['required', 'string', 'max:500']]);

        return response()->json(['data' => $this->reader->lookup($data['code'])]);
    }

    public function qr(Request $request, string $lotNo): Response
    {
        $this->gateView($request);

        return response(LotQr::svg($this->lot($lotNo)->lot_no), 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    private function lot(string $lotNo): StockLot
    {
        return StockLot::where('lot_no', strtoupper($lotNo))->firstOrFail();
    }
}
