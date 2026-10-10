<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Request\RequestOverviewReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/requests/overview/breakdown — the cards of the "ภาพรวมคำขอ" page. The route pins
 * {key} to requests.overview; RequestOverviewReport::breakdown() builds it.
 */
class RequestOverviewBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var RequestOverviewReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->filters())]);
    }
}
