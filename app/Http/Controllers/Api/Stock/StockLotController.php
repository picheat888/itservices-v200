<?php

// One lot by its number: the lot page, the scan-box lookup, the lot's QR image and its sticker sheet.

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Models\Stock\StockLot;
use App\Services\Stock\StockLotReader;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\LotQr;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockLotController extends Controller
{
    private const MAX_COPIES = 99;

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

    /** Stream an A4 sheet of N copies of the lot's 50 × 25 mm QR sticker (copies 1–99, default 1). */
    public function labelsPdf(Request $request, string $lotNo): StreamedResponse
    {
        $this->gateView($request);
        $lot = $this->lot($lotNo)->loadMissing('item.unit');
        $copies = max(1, min(self::MAX_COPIES, (int) $request->query('copies', '1')));

        $bytes = Pdf::loadView('pdf.lot-labels', [
            'lot' => $lot,
            'item' => $lot->item,
            'qr' => 'data:image/svg+xml;base64,'.base64_encode(LotQr::svg($lot->lot_no)),
            'received' => DateDisplay::date($lot->received_at, null, 'en'),
            'copies' => $copies,
        ])->setPaper('a4', 'portrait')->output();
        $filename = DocumentName::make('LotLabels', [$lot->lot_no]);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'lot-labels.pdf'),
        ]);
    }

    private function lot(string $lotNo): StockLot
    {
        return StockLot::where('lot_no', strtoupper($lotNo))->firstOrFail();
    }
}
