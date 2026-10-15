<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Contract\ContractOverviewReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/contracts/overview/breakdown — what the "ภาพรวมและค่าใช้จ่ายสัญญา" page draws above its list. The route
 * pins {key} to contracts.overview, so TabularReportRequest gates and validates it like the report's rows.
 */
class ContractOverviewBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var ContractOverviewReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
