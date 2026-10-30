<?php

// The Login tab of Permissions: every sign-in, failure, lockout and sign-out, searchable and filterable by event and date.

namespace App\Services\Permission;

use App\Models\Auth\LoginEvent;
use App\Support\SearchTerms;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class LoginEventLogService
{
    public const SORTS = ['created_at', '-created_at'];

    /**
     * @param  array{search?: ?string, event?: ?string, from?: ?string, to?: ?string, sort?: ?string, per_page?: ?int}  $filters
     */
    public function page(array $filters): LengthAwarePaginator
    {
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

        return $query->orderBy('created_at', $direction)->orderBy('id', $direction)->paginate((int) ($filters['per_page'] ?? 20));
    }
}
