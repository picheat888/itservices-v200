<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Employee\EmployeeOpenItemsReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/employees/open-items/breakdown — what the "สรุปเรื่องค้างของพนักงาน" page draws.
 * The route pins {key} to employees.open_items, so TabularReportRequest gates and validates it as
 * it does the report's rows; EmployeeOpenItemsReport::breakdown() builds it.
 */
class EmployeeOpenItemsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var EmployeeOpenItemsReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
