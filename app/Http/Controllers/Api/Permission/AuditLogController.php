<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\SearchTerms;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AuditLogController extends Controller
{
    /** Action verb prefixes per category, matched in this order: an action belongs to the first category it matches. */
    private const CATEGORY_VERBS = [
        'auth' => ['Signed', 'Changed own', 'Updated own'],
        'created' => ['Created', 'Registered', 'Submitted', 'Opened', 'Uploaded', 'Imported'],
        'updated' => ['Updated', 'Renewed', 'Set', 'Changed', 'Reset', 'Recorded', 'Transferred', 'Took', 'Assigned', 'Cancelled'],
        'deleted' => ['Deleted', 'Removed'],
        'workflow' => ['Approved', 'Rejected', 'Accepted', 'Received', 'Committed', 'Fulfilled', 'Completed', 'Resolved', 'Stock'],
    ];

    /** Keeps actions that start with one of the category's verbs and with none of an earlier category's. */
    private function whereCategory(Builder $query, string $category): void
    {
        $earlierVerbs = [];
        foreach (self::CATEGORY_VERBS as $key => $verbs) {
            if ($key === $category) {
                break;
            }
            $earlierVerbs = [...$earlierVerbs, ...$verbs];
        }

        $query->where(function (Builder $w) use ($category) {
            foreach (self::CATEGORY_VERBS[$category] as $verb) {
                $w->orWhere('action', 'like', "{$verb}%");
            }
        });
        foreach ($earlierVerbs as $verb) {
            $query->where('action', 'not like', "{$verb}%");
        }
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.view_audit'), 403);

        $filters = $request->validate([
            'search' => ['nullable', 'string'],
            'category' => ['nullable', 'string', Rule::in(array_keys(self::CATEGORY_VERBS))],
            'user' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $perPage = (int) ($filters['per_page'] ?? 20);

        // Newest first; id breaks ties between entries written in the same second.
        $query = AuditLog::query()->latest()->latest('id');

        SearchTerms::apply($query, $filters['search'] ?? null, ['action', 'target', 'user_name']);

        if ($category = $filters['category'] ?? null) {
            $this->whereCategory($query, $category);
        }

        // Actor filter.
        if ($user = $filters['user'] ?? null) {
            $query->where('user_name', $user);
        }

        $paginator = $query->paginate($perPage, ['id', 'user_name', 'action', 'target', 'details', 'created_at']);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                // Distinct actors, for the filter dropdown.
                'users' => AuditLog::query()->distinct()->orderBy('user_name')->pluck('user_name')->filter()->values(),
            ],
        ]);
    }
}
