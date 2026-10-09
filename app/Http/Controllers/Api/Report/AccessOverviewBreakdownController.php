<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Access\AccessOverviewReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/access/overview/breakdown — what the "ภาพรวมสิทธิ์การเข้าถึง" page draws above its
 * list. The route pins {key} to access.overview, so TabularReportRequest gates and validates it as
 * it does the report's rows; AccessOverviewReport::breakdown() builds it.
 */
class AccessOverviewBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var AccessOverviewReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
