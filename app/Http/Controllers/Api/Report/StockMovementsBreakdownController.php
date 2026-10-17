<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Stock\StockMovementReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/stock/movements/breakdown — what the "รับเข้าและเบิกจ่าย" page draws above its rows. The route pins
 * {key} to stock.movements, so TabularReportRequest gates and validates it like the report's rows.
 */
class StockMovementsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var StockMovementReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
