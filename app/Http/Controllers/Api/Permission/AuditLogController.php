<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Http\Resources\Permission\AuditLogResource;
use App\Services\Permission\AuditLogListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AuditLogController extends Controller
{
    public function __construct(private AuditLogListService $log) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.view_audit'), 403);

        $filters = $request->validate([
            'search' => ['nullable', 'string'],
            'category' => ['nullable', 'string', Rule::in(AuditLogListService::categories())],
            'user' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $paginator = $this->log->page($filters);

        return response()->json([
            'data' => AuditLogResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'users' => $this->log->actors(),
            ],
        ]);
    }
}
