<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Employee\EmployeeOverviewReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/employees/overview/breakdown — what the "ภาพรวมพนักงาน" page draws above its list.
 * The route pins {key} to employees.overview, so TabularReportRequest gates and validates it as the rows.
 */
class EmployeeOverviewBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var EmployeeOverviewReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters()), 'message' => 'success']);
    }
}
