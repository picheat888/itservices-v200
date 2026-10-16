<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\SearchTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /** Action verb prefixes grouped into filterable categories. */
    private const CATEGORY_VERBS = [
        'created' => ['Created', 'Registered', 'Submitted', 'Opened', 'Uploaded', 'Imported'],
        'updated' => ['Updated', 'Renewed', 'Set', 'Changed', 'Reset', 'Recorded', 'Transferred', 'Took', 'Assigned', 'Cancelled'],
        'deleted' => ['Deleted', 'Removed'],
        'workflow' => ['Approved', 'Rejected', 'Accepted', 'Received', 'Committed', 'Fulfilled', 'Completed', 'Resolved', 'Stock'],
        'auth' => ['Signed', 'Changed own', 'Updated own'],
    ];

    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.view_audit'), 403);

        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(10, min(100, $perPage)); // clamp 10–100

        // Newest first; id breaks ties between entries written in the same second.
        $query = AuditLog::query()->latest()->latest('id');

        SearchTerms::apply($query, $request->query('search'), ['action', 'target', 'user_name']);

        // Category filter (created / updated / deleted / workflow / auth).
        $verbs = self::CATEGORY_VERBS[$request->query('category')] ?? null;
        if ($verbs) {
            $query->where(function ($w) use ($verbs) {
                foreach ($verbs as $verb) {
                    $w->orWhere('action', 'like', "{$verb}%");
                }
            });
        }

        // Actor filter.
        if ($user = $request->query('user')) {
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
