<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TicketOverviewReportRequest;
use App\Services\Report\TicketOverviewReportService;
use Illuminate\Http\JsonResponse;

/**
 * "Ticket & SLA overview" report endpoints: summary numbers, the row table, and export.
 * Access and filters are enforced by the Form Requests.
 */
class TicketOverviewReportController extends Controller
{
    public function summary(TicketOverviewReportRequest $request, TicketOverviewReportService $reports): JsonResponse
    {
        return response()->json(['data' => $reports->summary($request->user(), $request->filters())]);
    }
}
