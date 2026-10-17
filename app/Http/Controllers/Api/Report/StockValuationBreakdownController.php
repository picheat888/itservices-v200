<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Stock\StockValuationReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/stock/valuation/breakdown — what the "มูลค่าคงคลัง" page draws above its rows. The route pins
 * {key} to stock.valuation, so TabularReportRequest gates and validates it like the report's rows.
 */
class StockValuationBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var StockValuationReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
