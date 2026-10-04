<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Ticket\TicketManualSlaReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/tickets/manual-sla/breakdown — what the "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" page
 * draws above its rows: the table grouped by the picked dimension, the cases still open past SLA,
 * how late the late closes were, and the SLA rules. The route pins {key} to tickets.manual_sla, so
 * TabularReportRequest gates and validates it as it does the report's rows;
 * TicketManualSlaReport::breakdown() builds it.
 */
class TicketManualSlaBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var TicketManualSlaReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
