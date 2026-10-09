<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Asset\WarrantyExpiringReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/assets/warranty-expiring/breakdown — what the "ประกันใกล้หมดอายุ" page draws above
 * its list. The route pins {key} to assets.warranty_expiring, so TabularReportRequest gates and validates
 * it as it does the report's rows; WarrantyExpiringReport::breakdown() builds it.
 */
class AssetWarrantyBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var WarrantyExpiringReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
