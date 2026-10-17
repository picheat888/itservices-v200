<?php

// Requests filed in a period: counts by status and the mean days to a final decision, answered in SQL.

namespace App\Services\Request;

use App\Enums\Request\RequestStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class RequestPeriodStats
{
    /**
     * @param  Builder  $filed  requests already limited to the viewer and the period
     * @return array{pending: int, approved: int, rejected: int, completed: int, cancelled: int, avg_cycle_days: ?float}
     */
    public function for(Builder $filed): array
    {
        $counts = (clone $filed)->toBase()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        $decided = [RequestStatus::Approved->value, RequestStatus::Rejected->value, RequestStatus::Completed->value];
        $seconds = (clone $filed)->toBase()
            ->whereIn('status', $decided)
            ->whereRaw('COALESCE(approved_at, rejected_at) IS NOT NULL')
            ->selectRaw('AVG(ABS('.$this->secondsBetween().')) as avg_seconds')
            ->value('avg_seconds');

        return [
            'pending' => (int) ($counts[RequestStatus::Pending->value] ?? 0),
            'approved' => (int) ($counts[RequestStatus::Approved->value] ?? 0),
            'rejected' => (int) ($counts[RequestStatus::Rejected->value] ?? 0),
            'completed' => (int) ($counts[RequestStatus::Completed->value] ?? 0),
            'cancelled' => (int) ($counts[RequestStatus::Cancelled->value] ?? 0),
            'avg_cycle_days' => $seconds === null ? null : round((float) $seconds / 60 / 1440, 1),
        ];
    }

    /** SQL seconds from submit to the final decision, per database driver. */
    private function secondsBetween(): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%s', COALESCE(approved_at, rejected_at)) - strftime('%s', created_at)"
            : 'TIMESTAMPDIFF(SECOND, created_at, COALESCE(approved_at, rejected_at))';
    }
}
