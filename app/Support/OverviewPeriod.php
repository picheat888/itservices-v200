<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * The period an Overview tab is read over: ?days=7|30|90|all or ?from=&to= (Y-m-d).
 * No params means all time. Matches shared/components/overview-period.tsx.
 */
final class OverviewPeriod
{
    private const PRESETS = [7, 30, 90];

    private function __construct(
        public readonly ?CarbonImmutable $from,
        public readonly CarbonImmutable $to,
    ) {}

    public static function fromRequest(Request $request): self
    {
        if ($request->filled('from') || $request->filled('to')) {
            $request->validate([
                'from' => ['required', 'date_format:Y-m-d'],
                'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            ]);

            return new self(
                CarbonImmutable::parse($request->query('from'))->startOfDay(),
                CarbonImmutable::parse($request->query('to'))->endOfDay(),
            );
        }

        $days = (int) $request->query('days');

        return in_array($days, self::PRESETS, true)
            ? new self(CarbonImmutable::now()->subDays($days), CarbonImmutable::now())
            : self::allTime();
    }

    public static function allTime(): self
    {
        return new self(null, CarbonImmutable::now());
    }

    /** The same period widened to whole days, for date columns (joined_at, last_day). */
    public function onDates(): self
    {
        return new self($this->from?->startOfDay(), $this->to->endOfDay());
    }

    public function isAllTime(): bool
    {
        return $this->from === null;
    }

    public function contains(?CarbonInterface $at): bool
    {
        return $at !== null && ($this->from === null || ($at->gte($this->from) && $at->lte($this->to)));
    }

    /** Limit a query to rows whose `$column` falls inside the period; all time adds no limit (a future last_day still counts). */
    public function apply(Builder $query, string $column): Builder
    {
        return $this->from === null ? $query : $query->whereBetween($column, [$this->from, $this->to]);
    }

    /**
     * Chart columns over the period, oldest first: days up to 14 days, weeks (Monday) up to
     * 120, months up to two years, years beyond. All time starts at `$earliest`.
     *
     * @return array{unit: 'day'|'week'|'month'|'year', columns: list<array{start: string, from: CarbonImmutable, to: CarbonImmutable}>}
     */
    public function columns(?CarbonInterface $earliest): array
    {
        $from = $this->from ?? CarbonImmutable::parse($earliest ?? $this->to)->startOfDay();
        $days = $from->diffInDays($this->to);
        [$unit, $start, $step, $format] = match (true) {
            $days <= 14 => ['day', $from->startOfDay(), 'addDay', 'Y-m-d'],
            $days <= 120 => ['week', $from->startOfWeek(CarbonInterface::MONDAY), 'addWeek', 'Y-m-d'],
            $days <= 731 => ['month', $from->startOfMonth(), 'addMonth', 'Y-m'],
            default => ['year', $from->startOfYear(), 'addYear', 'Y'],
        };

        $columns = [];
        for ($at = $start; $at->lte($this->to); $at = $at->{$step}()) {
            $columns[] = ['start' => $at->format($format), 'from' => $at, 'to' => $at->{$step}()->subSecond()];
        }

        return ['unit' => $unit, 'columns' => $columns];
    }

    /**
     * Count dates into the period's chart columns.
     *
     * @param  iterable<?CarbonInterface>  $dates
     * @return array{unit: string, data: list<array{month: string, count: int}>}
     */
    public function countInto(iterable $dates, ?CarbonInterface $earliest): array
    {
        ['unit' => $unit, 'columns' => $columns] = $this->columns($earliest);
        $counts = array_fill(0, count($columns), 0);
        foreach ($dates as $at) {
            if (! $this->contains($at)) {
                continue;
            }
            foreach ($columns as $i => $column) {
                if ($at->gte($column['from']) && $at->lte($column['to'])) {
                    $counts[$i]++;
                    break;
                }
            }
        }

        return [
            'unit' => $unit,
            'data' => array_map(fn (array $c, int $n) => ['month' => $c['start'], 'count' => $n], $columns, $counts),
        ];
    }
}
