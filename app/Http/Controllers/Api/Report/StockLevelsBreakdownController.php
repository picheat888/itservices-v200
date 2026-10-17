<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Stock\StockBelowMinReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/stock/below-min/breakdown — the tiles and category card of "ต่ำกว่าขั้นต่ำและเกินขั้นสูง". The route pins
 * {key} to stock.below_min, so TabularReportRequest gates and validates it like the report's rows.
 */
class StockLevelsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var StockBelowMinReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
