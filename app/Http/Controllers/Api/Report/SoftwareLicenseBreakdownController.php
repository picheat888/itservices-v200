<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Access\SoftwareLicenseReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/access/software-licenses/breakdown — what the "การใช้ License ซอฟต์แวร์" page draws
 * above its list. The route pins {key} to access.software_licenses, so TabularReportRequest gates and
 * validates it as it does the report's rows; SoftwareLicenseReport::breakdown() builds it.
 */
class SoftwareLicenseBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var SoftwareLicenseReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
