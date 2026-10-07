<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Asset\AssetTransferHistoryReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/assets/transfer-history/breakdown — what the "ประวัติโอนย้ายและรับคืน" page draws above
 * its list. The route pins {key} to assets.transfer_history, so TabularReportRequest gates (assets.view)
 * and validates it as it does the report's rows; AssetTransferHistoryReport::breakdown() builds it.
 */
class AssetTransferBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var AssetTransferHistoryReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
