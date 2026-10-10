<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Request\RequestApprovalsReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/requests/approvals/breakdown — the cards of "การอนุมัติคำขอ". The route pins {key}
 * to requests.approvals, so TabularReportRequest gates and validates it like the report's rows.
 */
class RequestApprovalsBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var RequestApprovalsReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
