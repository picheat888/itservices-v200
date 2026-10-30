<?php

// The Login tab of Permissions: every sign-in, failure, lockout and sign-out, searchable and filterable by event and date.

namespace App\Http\Controllers\Api\Permission;

use App\Enums\Auth\LoginEventType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Auth\LoginEventResource;
use App\Services\Permission\LoginEventLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LoginEventController extends Controller
{
    public function __construct(private LoginEventLogService $log) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string'],
            'event' => ['nullable', Rule::enum(LoginEventType::class)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(LoginEventLogService::SORTS)],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $paginator = $this->log->page($filters);

        return response()->json([
            'data' => LoginEventResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }
}
