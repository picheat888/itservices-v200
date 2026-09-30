<?php

namespace App\Models\Report;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A report emailed on a schedule (Report Center Phase 6), set from a report page and sent by
 * App\Jobs\SendScheduledReport. Managed through App\Services\Report\ReportScheduleService.
 *
 * Each run covers the period that has just closed — daily: yesterday; weekly (Mondays): the
 * previous Monday to Sunday; monthly (the 1st): the previous calendar month — so the stored
 * date filters are replaced by that period and the rest of the screen's filters are kept.
 */
class ReportSchedule extends Model
{
    public const DAILY = 'daily';

    public const WEEKLY = 'weekly';

    public const MONTHLY = 'monthly';

    public const FREQUENCIES = [self::DAILY, self::WEEKLY, self::MONTHLY];

    public const SENT = 'sent';

    public const FAILED = 'failed';

    /** Schedules one person may keep. */
    public const MAX_PER_USER = 10;

    /** Addresses one schedule may send to. */
    public const MAX_RECIPIENTS = 10;

    protected $fillable = [
        'user_id', 'report_key', 'format', 'filters', 'columns', 'frequency', 'send_hour',
        'recipients', 'active', 'next_run_at', 'last_run_at', 'last_status', 'last_error',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'columns' => 'array',
            'recipients' => 'array',
            'send_hour' => 'integer',
            'active' => 'boolean',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Active schedules whose next run has come.
     *
     * @param  Builder<ReportSchedule>  $query
     * @return Builder<ReportSchedule>
     */
    public function scopeDue(Builder $query, CarbonImmutable $now): Builder
    {
        return $query->where('active', true)->whereNotNull('next_run_at')->where('next_run_at', '<=', $now);
    }

    /** The first send time strictly after $after, on this schedule's day and hour. */
    public function nextRunAfter(CarbonImmutable $after): CarbonImmutable
    {
        $candidate = match ($this->frequency) {
            self::WEEKLY => $after->startOfWeek(CarbonImmutable::MONDAY)->setTime($this->send_hour, 0),
            self::MONTHLY => $after->startOfMonth()->setTime($this->send_hour, 0),
            default => $after->startOfDay()->setTime($this->send_hour, 0),
        };

        while ($candidate <= $after) {
            $candidate = match ($this->frequency) {
                self::WEEKLY => $candidate->addWeek(),
                self::MONTHLY => $candidate->addMonthNoOverflow(),
                default => $candidate->addDay(),
            };
        }

        return $candidate;
    }

    /**
     * The period a run at $runAt reports on: the day, week or month that closed before it.
     *
     * @return array{from: CarbonImmutable, to: CarbonImmutable}
     */
    public function periodFor(CarbonImmutable $runAt): array
    {
        return match ($this->frequency) {
            self::WEEKLY => [
                'from' => $runAt->startOfWeek(CarbonImmutable::MONDAY)->subWeek(),
                'to' => $runAt->startOfWeek(CarbonImmutable::MONDAY)->subDay()->endOfDay(),
            ],
            self::MONTHLY => [
                'from' => $runAt->startOfMonth()->subMonthNoOverflow(),
                'to' => $runAt->startOfMonth()->subDay()->endOfDay(),
            ],
            default => [
                'from' => $runAt->subDay()->startOfDay(),
                'to' => $runAt->subDay()->endOfDay(),
            ],
        };
    }
}
