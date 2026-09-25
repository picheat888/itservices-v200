<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Support\ReportCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Report Center list (/reports): the reports this reader may open.
 *
 * No route-level permission: an empty list is the honest answer for someone who holds
 * none, and the page shows its own empty state for it.
 */
class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => ReportCatalogue::forUser($request->user())]);
    }
}
