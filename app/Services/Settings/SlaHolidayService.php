<?php

// Replaces one calendar year of company holidays and moves open-ticket deadlines to match.

namespace App\Services\Settings;

use App\Models\Settings\SlaHoliday;
use App\Services\Ticket\TicketDeadlineService;
use App\Support\TicketSla;
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

        $result = DB::transaction(function () use ($year, $incoming): array {
            $existing = SlaHoliday::query()
                ->whereBetween('date', ["{$year}-01-01", "{$year}-12-31"])
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
        });

        TicketSla::flush();

        return $result + ['moved' => $this->deadlines->recomputeOpen()];
    }
}
