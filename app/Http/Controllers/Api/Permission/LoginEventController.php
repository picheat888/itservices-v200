<?php

// The Login tab of Permissions: every sign-in, failure, lockout and sign-out, searchable and filterable by event and date.

namespace App\Http\Controllers\Api\Permission;

use App\Enums\Auth\LoginEventType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Auth\LoginEventResource;
use App\Models\Auth\LoginEvent;
use App\Support\SearchTerms;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LoginEventController extends Controller
{
    private const SORTS = ['created_at', '-created_at'];

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string'],
            'event' => ['nullable', Rule::enum(LoginEventType::class)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(self::SORTS)],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $newestFirst = ($filters['sort'] ?? '-created_at') === '-created_at';

        $query = LoginEvent::query()->with('user.employee');

        SearchTerms::apply($query, $filters['search'] ?? null, [
            'login_name', 'ip', 'location',
            SearchTerms::related('user', ['name', 'username', SearchTerms::related('employee', SearchTerms::personName())]),
        ]);

        if (isset($filters['event'])) {
            $query->where('event', $filters['event']);
        }
        if (isset($filters['from'])) {
            $query->where('created_at', '>=', Carbon::parse($filters['from'])->startOfDay());
        }
        if (isset($filters['to'])) {
            // The end day counts in full: everything before the next day starts
            $query->where('created_at', '<', Carbon::parse($filters['to'])->addDay()->startOfDay());
        }

        $direction = $newestFirst ? 'desc' : 'asc';
        $paginator = $query->orderBy('created_at', $direction)->orderBy('id', $direction)->paginate((int) ($filters['per_page'] ?? 20));

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
