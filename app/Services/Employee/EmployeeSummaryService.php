<?php

// The employee overview: headcount now; hires, resignations and the hiring chart over the chosen period.

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Support\OverviewPeriod;
use Illuminate\Support\Carbon;

class EmployeeSummaryService
{
    /** @return array<string, mixed>  recent and recent_resignations are employee collections the controller wraps */
    public function summary(OverviewPeriod $period): array
    {
        $resignedQuery = fn () => Employee::where('status', EmployeeStatus::Resigned->value);

        // Active staff still waiting for a login account, as ?status=no_account filters
        $noAccount = Employee::where('status', EmployeeStatus::Active->value)
            ->whereDoesntHave('user')->count();

        $recent = $period->apply(Employee::with(['department', 'position', 'section']), 'joined_at')
            ->orderByDesc('joined_at')
            ->limit(5)
            ->get();

        $recentResignations = $period->apply($resignedQuery()->with(['department', 'position', 'section']), 'last_day')
            ->orderByDesc('last_day')
            ->limit(5)
            ->get();

        $joined = Employee::whereNotNull('joined_at')->pluck('joined_at')->map(fn ($d) => Carbon::parse($d));

        return [
            'total' => Employee::count(),
            'new_hires' => $period->apply(Employee::query(), 'joined_at')->count(),
            'active' => Employee::where('status', EmployeeStatus::Active->value)->count(),
            'resigned' => $resignedQuery()->count(),
            'resigned_in_period' => $period->apply($resignedQuery(), 'last_day')->count(),
            'no_account' => $noAccount,
            'hires_trend' => $period->countInto($joined, $joined->min()),
            'recent' => $recent,
            'recent_resignations' => $recentResignations,
        ];
    }
}
