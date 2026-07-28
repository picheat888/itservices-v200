<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The whole stack runs on local wall time (.env APP_TIMEZONE), so schedules
// below fire at local time with no per-entry timezone override.

Schedule::command('contracts:send-expiry-alerts')->dailyAt('08:00');

Schedule::command('stock:send-notifications')->dailyAt('08:05');

// Runs around the clock on purpose — the SLA working window is configurable in
// Settings, so the schedule must not hardcode it. Outside the window states
// don't move and the sweep is a cheap no-op (each alert stage fires once per
// ticket, deduped by the alert-level columns).
Schedule::command('tickets:send-sla-alerts')->everyTenMinutes();
