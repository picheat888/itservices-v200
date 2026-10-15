<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Contract\ContractRentalsReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/contracts/rentals/breakdown — what the "สัญญาเช่าและทรัพย์สิน" page draws above its list. The route
 * pins {key} to contracts.rentals, so TabularReportRequest gates and validates it like the report's rows.
 */
class ContractRentalsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var ContractRentalsReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
