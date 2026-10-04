<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Ticket\TicketRequestSlaReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/tickets/request-sla/breakdown — what the "SLA ตามประเภทคำขอ" page draws above
 * its rows: one line per request type, the tickets still open past their SLA, and the SLA rules
 * the verdicts were measured by. The route pins {key} to tickets.request_sla, so
 * TabularReportRequest gates and validates it exactly as it does the report's rows;
 * TicketRequestSlaReport::breakdown() builds it.
 */
class TicketRequestSlaBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var TicketRequestSlaReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
