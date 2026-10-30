<?php

// Replaces one calendar year of company holidays and moves open-ticket deadlines to match.

namespace App\Services\Settings;

use App\Models\Settings\SlaHoliday;
use App\Models\User;
use App\Notifications\SlaHolidaysMissingNotification;
use App\Services\Ticket\TicketDeadlineService;
use App\Support\TicketSla;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class SlaHolidayService
{
    public function __construct(private readonly TicketDeadlineService $deadlines) {}

    /**
     * @param  list<array{date: string, name: string}>  $rows
     * @return array{added: list<string>, removed: list<string>, renamed: list<string>, moved: int}
     */
    public function replaceYear(int $year, array $rows): array
    {
        $incoming = collect($rows)->mapWithKeys(fn (array $row): array => [$row['date'] => trim($row['name'])]);

        try {
            $result = DB::transaction(function () use ($year, $incoming): array {
                $changes = $this->saveRows($year, $incoming);
                TicketSla::flush();

                return $changes + ['moved' => $this->deadlines->recomputeOpen()];
            });

            // The year has holidays now: the "none set" reminder no longer applies
            if ($incoming->isNotEmpty()) {
                DatabaseNotification::where('type', SlaHolidaysMissingNotification::class)
                    ->where('notifiable_type', (new User)->getMorphClass())
                    ->whereIn('notifiable_id', User::holdingPermission('settings.sla')->pluck('id'))
                    ->where('data->year', $year)
                    ->delete();
            }

            return $result;
        } finally {
            TicketSla::flush(); // a rollback must not leave the failed holidays memoized
        }
    }

    /**
     * @param  Collection<string, string>  $incoming
     * @return array{added: list<string>, removed: list<string>, renamed: list<string>}
     */
    private function saveRows(int $year, Collection $incoming): array
    {
        $existing = SlaHoliday::query()
            ->whereYear('date', $year)
            ->get()
            ->keyBy(fn (SlaHoliday $holiday): string => $holiday->date->format('Y-m-d'));

        $removed = [];
        $renamed = [];
        foreach ($existing as $date => $holiday) {
            if (! $incoming->has($date)) {
                $holiday->delete();
                $removed[] = $date;
            } elseif ($holiday->name !== $incoming[$date]) {
                $holiday->update(['name' => $incoming[$date]]);
                $renamed[] = $date;
            }
        }

        $added = [];
        foreach ($incoming as $date => $name) {
            if (! $existing->has($date)) {
                SlaHoliday::create(['date' => $date, 'name' => $name]);
                $added[] = $date;
            }
        }

        return ['added' => $added, 'removed' => $removed, 'renamed' => $renamed];
    }
}
