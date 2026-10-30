<?php

// Scheduled reminder: bell the SLA settings owners when the coming (December) or current (January) year has no holidays.

namespace App\Console\Commands;

use App\Models\Settings\SlaHoliday;
use App\Models\User;
use App\Notifications\SlaHolidaysMissingNotification;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Notification;

class RemindSlaHolidays extends Command
{
    protected $signature = 'tickets:remind-sla-holidays';

    protected $description = 'Bell the SLA settings owners when a year has no company holidays yet';

    public function handle(): int
    {
        $now = now();

        if ($now->month === 12) {
            $year = $now->year + 1;
            $subtype = SlaHolidaysMissingNotification::UPCOMING;
        } elseif ($now->month === 1) {
            $year = $now->year;
            $subtype = SlaHolidaysMissingNotification::STARTED;
        } else {
            $this->info('Not holiday-reminder season, nothing sent');

            return self::SUCCESS;
        }

        if (SlaHoliday::query()->whereYear('date', $year)->exists()) {
            $this->info("Holidays for {$year} are set, nothing sent");

            return self::SUCCESS;
        }

        // One bell per year: the earlier run's bell gives way to this one
        DatabaseNotification::where('type', SlaHolidaysMissingNotification::class)
            ->where('data->year', $year)
            ->delete();

        $recipients = User::holdingPermission('settings.sla')->stillWorking()->get();
        Notification::send($recipients, new SlaHolidaysMissingNotification($year, $subtype));
        $this->info("No holidays for {$year}, belled {$recipients->count()} account(s)");

        return self::SUCCESS;
    }
}
