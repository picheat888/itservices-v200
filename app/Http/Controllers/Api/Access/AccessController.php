<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Services\Access\AccessService;
use App\Support\OverviewPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccessController extends Controller
{
    // The per-employee access view moved to EmployeeController@access (Employee-module "peek",
    // gated by employees.view) so it stays usable without any Access Directory permission.

    /** Aggregate figures for the Access Directory overview tab, over the chosen period (all time by default). */
    public function dashboard(Request $request, AccessService $svc): JsonResponse
    {
        return response()->json(['data' => $svc->dashboard(OverviewPeriod::fromRequest($request))]);
    }
}
