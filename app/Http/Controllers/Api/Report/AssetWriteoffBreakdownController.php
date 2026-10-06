<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Asset\AssetWriteoffReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/assets/writeoffs/breakdown — what the "การตัดจำหน่ายทรัพย์สิน" page draws above its
 * list: every month of the range, the reasons, the categories (age bands, warranty) and the rented
 * assets by contract. The route pins {key} to assets.writeoffs, so TabularReportRequest gates
 * (assets.view) and validates it as it does the report's rows; AssetWriteoffReport::breakdown()
 * builds it.
 */
class AssetWriteoffBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var AssetWriteoffReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
