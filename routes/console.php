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

// The daily sweep above says what crossed a threshold today. This says what is on the
// plate: everything expiring or already overdue, in one list once a week — weekly for the
// same reason the approvals and cases digests are, a daily copy stops being read.
Schedule::command('contracts:send-weekly-digest')->weeklyOn(1, '08:20');

Schedule::command('stock:send-notifications')->dailyAt('08:05');

// The daily sweep above rings the bells; the mail is weekly. Anything that drops below
// its minimum already sent its own alert the moment it happened, so a daily list of the
// same items is the same news twice — and one that arrives every morning gets filtered.
Schedule::command('stock:send-weekly-digest')->weeklyOn(1, '08:25');

// Approvals nobody has acted on. The bell goes out every morning behind the other
// two sweeps; the mail is weekly on purpose — a list on Monday is a piece of work,
// the same list every day is something people learn to filter.
Schedule::command('requests:send-stalled-reminders')->dailyAt('08:10');

Schedule::command('requests:send-stalled-digest')->weeklyOn(1, '12:00');

// Runs around the clock on purpose — the SLA working window is configurable in
// Settings, so the schedule must not hardcode it. Outside the window states
// don't move and the sweep is a cheap no-op (each alert stage fires once per
// ticket, deduped by the alert-level columns).
Schedule::command('tickets:send-sla-alerts')->everyTenMinutes();

// The team's board on Monday morning, ahead of the working day: what nobody has
// taken, and what is taken but still open. Weekly for the same reason as the
// approvals digest — a daily copy of the same list stops being read.
Schedule::command('tickets:send-weekly-digest')->weeklyOn(1, '08:30');

// Data retention. At 02:00 because it is the one schedule that deletes rather than sends:
// well clear of the 08:00 mail sweeps, and in the quietest hour the single-site deployment
// has. Every window is configurable in Settings → Security and ships with audit logs set
// to keep forever, so out of the box this only ever touches email bodies and read bells.
Schedule::command('logs:prune')->dailyAt('02:00');
