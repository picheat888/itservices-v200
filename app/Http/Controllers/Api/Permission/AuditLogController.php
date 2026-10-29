<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\SearchTerms;
use App\Support\SystemTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AuditLogController extends Controller
{
    /**
     * LIKE patterns per category, matched in this order: an action belongs to the first category it
     * matches, and to "other" when it matches none.
     */
    private const CATEGORY_PATTERNS = [
        'auth' => ['Signed%', 'Changed own%', 'Updated own%'],
        'access' => ['Added member%', 'Removed member%', 'Changed % owner'],
        'requests' => [
            'Submitted%', 'Approved%', 'Rejected%', 'Completed%', 'Fulfilled%', 'Filed%',
            'Cancelled service request%', 'Cancelled stock request%', 'Cancelled request%',
        ],
        'tickets' => ['Took%', 'Assigned%', 'Forwarded%', 'Resolved%', 'Classified%', 'Auto-ticket%'],
        'assets' => [
            'Transferred%', 'Received%', 'Accepted%', 'Requested asset%', 'Recalled%', 'Force-recalled%',
            'Wrote off%', 'Bulk asset%', 'Returned asset%', 'Cancelled asset%', 'Stock %', 'Opened stock%', 'Committed stock%',
        ],
        'created' => ['Created%', 'Duplicated%', 'Registered%', 'Imported%', 'Uploaded%'],
        'updated' => ['Updated%', 'Changed%', 'Set%', 'Reset%', 'Reordered%', 'Reactivated%', 'Recorded%', 'Cancelled%', 'Resumed%', 'Paused%'],
        'deleted' => ['Deleted%', 'Removed%'],
    ];

    private const OTHER = 'other';

    /** Keeps actions that match one of the category's patterns and none of an earlier category's ("other": none at all). */
    private function whereCategory(Builder $query, string $category): void
    {
        $earlierPatterns = [];
        foreach (self::CATEGORY_PATTERNS as $key => $patterns) {
            if ($key === $category) {
                break;
            }
            $earlierPatterns = [...$earlierPatterns, ...$patterns];
        }

        if ($category !== self::OTHER) {
            $query->where(function (Builder $w) use ($category) {
                foreach (self::CATEGORY_PATTERNS[$category] as $pattern) {
                    $w->orWhere('action', 'like', $pattern);
                }
            });
        }
        foreach ($earlierPatterns as $pattern) {
            $query->where('action', 'not like', $pattern);
        }
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.view_audit'), 403);

        $filters = $request->validate([
            'search' => ['nullable', 'string'],
            'category' => ['nullable', 'string', Rule::in([...array_keys(self::CATEGORY_PATTERNS), self::OTHER])],
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

        $paginator = $query->paginate($perPage, ['id', 'user_name', 'action', 'target', 'subject_type', 'details', 'created_at']);

        // Wall-clock time to show
        $rows = $paginator->getCollection()->map(fn (AuditLog $log) => [
            ...$log->toArray(),
            'created_at' => SystemTime::dateTime($log->created_at),
        ]);

        return response()->json([
            'data' => $rows,
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
