<?php

// The employee directory page and the detail view's Assets, Access, Tickets and Requests tabs.

namespace App\Services\Employee;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Services\Access\AccessService;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class EmployeeListService
{
    public function __construct(
        private readonly EmployeeService $employees,
        private readonly AccessService $access,
    ) {}

    /**
     * Directory order, searched by name, code, email and username, by department and active / resigned / account status.
     *
     * @param  array{search: mixed, department_id: ?int, status: mixed, per_page: int}  $filters
     */
    public function page(array $filters): LengthAwarePaginator
    {
        $query = $this->employees->inDirectoryOrder(Employee::with(['department', 'position', 'section', 'user.role']));

        SearchTerms::apply($query, $filters['search'], [
            ...SearchTerms::personName(), 'code', 'email', 'username',
            SearchTerms::related('user', ['username']),
        ]);

        if ($filters['department_id'] !== null) {
            $query->where('department_id', $filters['department_id']);
        }

        match ($filters['status']) {
            'active' => $query->where('status', 'active'),
            'resigned' => $query->where('status', 'resigned'),
            'no_account' => $query->where('status', 'active')->whereDoesntHave('user'),
            'has_account' => $query->where('status', 'active')->whereHas('user'),
            default => null,
        };

        return $query->paginate($filters['per_page']);
    }

    /** @return Collection<int, array<string, mixed>> */
    public function assets(Employee $employee): Collection
    {
        return Asset::query()
            ->with(['category', 'model'])
            ->where('owner_employee_id', $employee->id)
            ->orderByDesc('owned_since')
            ->get()
            ->map(fn (Asset $a) => [
                'id' => $a->id,
                'asset_code' => $a->asset_code,
                'tag' => $a->tag,
                'model' => $a->model?->name,
                'type' => $a->category?->name,
                'type_th' => $a->category?->name_th,
                'serial' => $a->serial,
                'status' => $a->status->value,
                'owned_since' => $a->owned_since?->toDateString(),
            ]);
    }

    /**
     * Access memberships grouped by kind, with the employee's id (rows they own) and `outstanding` for a leaver who still holds any.
     *
     * @return array<string, mixed>
     */
    public function access(Employee $employee): array
    {
        $grouped = $this->access->employeeAccess($employee);
        $grouped['employee_id'] = $employee->id;
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty()
                || $grouped['social_platform']->isNotEmpty() || $grouped['software']->isNotEmpty());

        return $grouped;
    }

    /** @return Collection<int, array<string, mixed>> */
    public function tickets(Employee $employee): Collection
    {
        return Ticket::query()
            ->where('requester_id', $employee->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Ticket $tk) => [
                'id' => $tk->id,
                'ticket_no' => $tk->ticket_no,
                'subject' => $tk->subject,
                'category' => $tk->category->value,
                'priority' => $tk->priority?->value,
                'status' => $tk->status->value,
                'created_at' => $tk->created_at?->toIso8601String(),
            ]);
    }

    /**
     * Requests about the employee or filed by their own account, newest first.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function requests(Employee $employee): Collection
    {
        $userId = $employee->user()->value('id');

        return ServiceRequest::query()
            ->where(function ($query) use ($employee, $userId) {
                $query->where('employee_id', $employee->id);

                if ($userId !== null) {
                    $query->orWhere('user_id', $userId);
                }
            })
            // Onboarding requests share a second; id breaks the tie
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ServiceRequest $sr) => [
                'id' => $sr->id,
                'reference' => $sr->reference,
                'type' => $sr->type->value,
                'origin' => $sr->origin->value,
                'status' => $sr->status->value,
                'created_at' => $sr->created_at?->toIso8601String(),
            ]);
    }
}
