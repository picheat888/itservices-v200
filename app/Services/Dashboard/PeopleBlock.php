<?php

namespace App\Services\Dashboard;

use App\Enums\Employee\EmployeeStatus;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;

/**
 * The Dashboard's people cards: active staff per department, and the latest audit-log entries.
 */
class PeopleBlock
{
    private const ACTIVITY_LIMIT = 6;

    /**
     * @return array{by_department: list<array{id: int, name: string, name_th: ?string, count: int}>, no_department: int, headcount: int}
     */
    public function headcount(): array
    {
        $active = fn () => Employee::where('status', EmployeeStatus::Active->value);

        return [
            'by_department' => Department::withCount(['employees' => fn ($q) => $q->where('status', EmployeeStatus::Active->value)])
                ->get()
                ->filter(fn (Department $department) => $department->employees_count > 0)
                ->sortByDesc('employees_count')
                ->map(fn (Department $department) => [
                    'id' => $department->id,
                    'name' => $department->name,
                    'name_th' => $department->name_th,
                    'count' => $department->employees_count,
                ])->values()->all(),
            'no_department' => $active()->whereNull('department_id')->count(),
            'headcount' => $active()->count(),
        ];
    }

    /**
     * @return array{items: list<array<string, mixed>>, today_count: int}
     */
    public function activity(): array
    {
        return [
            'items' => AuditLog::latest('id')->limit(self::ACTIVITY_LIMIT)->get()
                ->map(fn (AuditLog $log) => [
                    'id' => $log->id,
                    'actor' => $log->user_name,
                    'action' => $log->action,
                    'target' => $log->target,
                    'at' => $log->created_at?->toIso8601String(),
                ])->all(),
            'today_count' => AuditLog::where('created_at', '>=', now()->startOfDay())->count(),
        ];
    }
}
