<?php

namespace App\Http\Controllers\Api\Dashboard;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\DashboardSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything the front page draws, in one request.
 *
 * No permission gate on the route: the service decides block by block what this reader may
 * see and leaves out the rest, the same arrangement the sidebar badges use. A page that
 * fired one endpoint per card would have to guess which of them would answer 403.
 */
class DashboardController extends Controller
{
    public function summary(Request $request, DashboardSummaryService $dashboard): JsonResponse
    {
        return response()->json(['data' => $dashboard->forUser($request->user())]);
    }
}
