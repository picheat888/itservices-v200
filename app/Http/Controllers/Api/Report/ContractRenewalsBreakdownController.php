<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Contract\ContractRenewalsReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/contracts/renewals/breakdown — what the "ต่ออายุและสิ้นสุดสัญญา" page draws above its list. The route
 * pins {key} to contracts.renewals, so TabularReportRequest gates and validates it like the report's rows.
 */
class ContractRenewalsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var ContractRenewalsReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
