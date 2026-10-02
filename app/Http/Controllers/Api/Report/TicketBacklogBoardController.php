<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Ticket\TicketBacklogReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/tickets/backlog/board — every live ticket the "Ticket ค้างและเกิน SLA" filters
 * keep (the SLA filter aside), unpaged, for the page's due board and its owner / category cards.
 * The route pins {key} to tickets.backlog, so TabularReportRequest gates and validates it exactly
 * as it does the report's rows; TicketBacklogReport::board() builds the list.
 */
class TicketBacklogBoardController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var TicketBacklogReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->board($request->user(), $request->filters())]);
    }
}
