<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.view_audit'), 403);

        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(10, min(100, $perPage)); // clamp 10–100

        $paginator = AuditLog::query()
            ->latest()
            ->paginate($perPage, ['id', 'user_name', 'action', 'target', 'details', 'created_at']);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'total'        => $paginator->total(),
                'per_page'     => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
            ],
        ]);
    }
}
