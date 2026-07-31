<?php

namespace App\Http\Controllers\Api\Sidebar;

use App\Http\Controllers\Controller;
use App\Services\Sidebar\SidebarBadgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One request for every sidebar badge count, so the numbers appear together instead of
 * trickling in from seven module endpoints. No permission gate on the route itself —
 * the service returns 0 for any count the caller is not allowed to see.
 */
class SidebarBadgeController extends Controller
{
    public function index(Request $request, SidebarBadgeService $badges): JsonResponse
    {
        return response()->json(['data' => $badges->forUser($request->user())]);
    }
}
