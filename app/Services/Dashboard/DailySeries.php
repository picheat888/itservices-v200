<?php

namespace App\Services\Dashboard;

use Illuminate\Database\Eloquent\Builder;

/**
 * Rows per calendar day over the last N days, today last — the Dashboard's 14-day series.
 */
final class DailySeries
{
    /**
     * @return list<array{date: string, count: int}>
     */
    public static function count(Builder $query, string $column, int $days): array
    {
        $start = now()->startOfDay()->subDays($days - 1);

        $perDay = (clone $query)
            ->where($column, '>=', $start)
            ->selectRaw("DATE({$column}) as day, COUNT(*) as total")
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $start->copy()->addDays($i)->toDateString();
            $series[] = ['date' => $day, 'count' => (int) ($perDay[$day] ?? 0)];
        }

        return $series;
    }

    /**
     * @param  list<array{date: string, count: int}>  $series
     * @return list<int>
     */
    public static function values(array $series): array
    {
        return array_column($series, 'count');
    }
}
