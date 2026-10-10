<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Request\ItPendingRequestReport;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/reports/requests/it-pending/breakdown — what the "คำขอที่รอ IT ส่งมอบ" page draws above
 * its list. The route pins {key} to requests.it_pending; ItPendingRequestReport::breakdown() builds it.
 */
class RequestItPendingBreakdownController extends Controller
{
    public function __invoke(TabularReportRequest $request): JsonResponse
    {
        /** @var ItPendingRequestReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }
}
