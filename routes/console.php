<?php

use App\Models\AppSetting;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Pull the company timezone from Settings -> Company so scheduled jobs fire at
// the configured local time. Falls back to Asia/Bangkok if the stored value is
// missing or not a timezone PHP recognises. This keeps app.timezone (UTC) and
// stored DB timestamps untouched.
// This file is evaluated on every Artisan boot (tests, migrate, config:cache,
// …), so the lookup is wrapped: if the DB/table isn't ready yet we silently use
// the default rather than crashing the console. ALL_WITH_BC accepts backward-
// compat aliases the picker may store (e.g. Etc/UTC, Etc/GMT+12, Europe/Kiev).
$appTimezone = 'Asia/Bangkok';
try {
    $stored = AppSetting::get('timezone', 'Asia/Bangkok');
    if (in_array($stored, timezone_identifiers_list(DateTimeZone::ALL_WITH_BC), true)) {
        $appTimezone = $stored;
    }
} catch (Throwable $e) {
    // DB not migrated/available during this Artisan invocation — keep the default.
}

Schedule::command('contracts:send-expiry-alerts')
    ->dailyAt('08:00')
    ->timezone($appTimezone);
