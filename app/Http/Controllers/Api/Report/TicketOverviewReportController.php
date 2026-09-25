<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TicketOverviewReportRequest;
use App\Http\Resources\Report\TicketReportRowResource;
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

    public function rows(TicketOverviewReportRequest $request, TicketOverviewReportService $reports): JsonResponse
    {
        $page = $reports->rows($request->user(), $request->filters(), (int) ($request->validated('per_page') ?? 20));

        return response()->json([
            'data' => TicketReportRowResource::collection($page->items()),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }
}
