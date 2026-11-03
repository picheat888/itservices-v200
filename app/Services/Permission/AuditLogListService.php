<?php

// The Audit log tab of Permissions: entries newest first, searchable and filterable by category and actor.

namespace App\Services\Permission;

use App\Models\AuditLog;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class AuditLogListService
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
        'created' => ['Created%', 'Duplicated%', 'Registered%', 'Imported%', 'Uploaded%', 'Paired%'],
        'updated' => ['Updated%', 'Changed%', 'Set%', 'Reset%', 'Reordered%', 'Reactivated%', 'Recorded%', 'Cancelled%', 'Resumed%', 'Paused%'],
        'deleted' => ['Deleted%', 'Removed%', 'Unpaired%'],
    ];

    private const OTHER = 'other';

    /** @return list<string> */
    public static function categories(): array
    {
        return [...array_keys(self::CATEGORY_PATTERNS), self::OTHER];
    }

    /**
     * @param  array{search?: ?string, category?: ?string, user?: ?string, per_page?: ?int}  $filters
     */
    public function page(array $filters): LengthAwarePaginator
    {
        // Newest first; id breaks ties between entries written in the same second.
        $query = AuditLog::query()->latest()->latest('id');

        SearchTerms::apply($query, $filters['search'] ?? null, ['action', 'target', 'user_name']);

        if ($category = $filters['category'] ?? null) {
            $this->whereCategory($query, $category);
        }

        if ($user = $filters['user'] ?? null) {
            $query->where('user_name', $user);
        }

        return $query->paginate((int) ($filters['per_page'] ?? 20), ['id', 'user_name', 'action', 'target', 'subject_type', 'details', 'created_at']);
    }

    /**
     * Distinct actors, for the filter dropdown.
     *
     * @return Collection<int, string>
     */
    public function actors(): Collection
    {
        return AuditLog::query()->distinct()->orderBy('user_name')->pluck('user_name')->filter()->values();
    }

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
}
