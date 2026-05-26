# Contract Expiry Alerts — Design

Date: 2026-05-26
Module: Contract & Rental (#5) × Notifications (#8) × Email Notifications (#9)
Permission: `contracts.alerts` ("Receive expiry alerts") — already in the catalog and Permission UI.

## Goal

Make the existing `contracts.alerts` permission do something. When a contract crosses one of its
enabled reminder thresholds, notify every user whose role has `contracts.alerts` switched ON —
through **both** the in-app notification bell and email. Each threshold fires **once** per contract
cycle (no daily repeats), driven by a **daily scheduled command**.

This wires time-based alerts into the notification pipeline that already exists for employee events
(`Notification::send` for the bell + `EmailNotificationService::sendTemplate` for queued email).

### Decisions (confirmed with user)
- **Channels:** Bell **and** Email.
- **Frequency:** once per threshold per cycle (deduplicated).
- **Trigger:** daily Artisan command run by the Laravel scheduler.
- **Dedup storage:** new table `contract_alert_logs` (Decision 1).
- **Email template:** one flexible template `contract.expiry_alert` with a day-count variable,
  replacing the three rigid `contract.expire.{60,30,7}d` rows (Decision 2).

### Recipients
Users whose role grants `contracts.alerts`, resolved with the existing pattern:
`User::all()->filter(fn ($u) => $u->hasPermission('contracts.alerts'))`. Super admins always qualify
(they bypass permission checks). No "actor" exclusion here — this is a system-generated event, not a
user action.

## Existing building blocks (reused, not rebuilt)
- `Contract::REMINDER_DAYS = [150, 120, 60, 45, 30, 7]`, per-threshold flags `notify_{d}`,
  and helpers `daysRemaining()`, `enabledReminderDays()`, `isInReminder()`.
- Notification bell: Laravel database notifications + `notifications-dropdown.tsx`
  (the `contracts` tab exists but is `live: false`).
- Email: `EmailNotificationService::sendTemplate(key, toEmail, vars)` → queued `SendTemplatedEmail`.

## Data model

### New table `contract_alert_logs`
One row per (contract, threshold) that has been alerted — the dedup ledger.
- `id` (auto)
- `contract_id` (FK → contracts, cascade on delete)
- `threshold` (unsigned small int — the reminder day count, e.g. 30)
- `alerted_at` (timestamp)
- unique index on `(contract_id, threshold)`

No `channel` column — bell and email fire together as one logical alert, so one row per
(contract, threshold) is enough. On renew, rows for that contract are cleared so the new cycle
re-alerts.

### `email_templates` change
Migration replaces the three rigid rows (`contract.expire.60d`, `.30d`, `.7d`) with one row:
- `key`: `contract.expiry_alert`
- `name`: "Contract expiring soon"
- `subject`: `Contract {{contract.vendor}} expires in {{contract.days_remaining}} days`
- `body_html`: greeting + line about the contract (`{{contract.name}}`, `{{contract.vendor}}`,
  `{{contract.days_remaining}}`, `{{contract.end_date}}`) + reference `{{contract.code}}`.
- `enabled`: true

The migration is reversible: `down()` restores the three original rows.

## Backend

### `ContractExpiryAlertService` (new — single purpose: decide & dispatch)
- `run(?\Closure $clock = null): int` — returns count of alerts sent (for command output/tests).
- Logic:
  1. Load active, non-cancelled contracts (`cancelled_at` null, `daysRemaining() > 0`) that have at
     least one enabled reminder threshold.
  2. For each, compute thresholds where `daysRemaining() <= threshold` **and** no `contract_alert_logs`
     row exists for `(contract, threshold)`. Pick the **most urgent** crossed threshold (smallest day
     count) so a contract that crosses several at once sends a single, accurate alert. Backfill
     `contract_alert_logs` rows for any larger thresholds it skipped (so they don't fire later as
     "stale" alerts).
  3. Resolve recipients (permission filter above). If none, still record the log rows (so we don't
     re-evaluate forever) and continue.
  4. Send bell: `Notification::send($recipients, new ContractExpiryNotification($contract, $days))`.
  5. Send email: for each recipient with an email, `sendTemplate('contract.expiry_alert', ...)` with
     `{{user.first_name}}`, `{{contract.*}}`, `{{contract.days_remaining}}`.
  6. Insert `contract_alert_logs` row(s).
- A method `resetForContract(Contract $c): void` deletes that contract's log rows; called on renew.

### `ContractExpiryNotification` (new, `via = ['database']`)
`toDatabase()` payload mirrors the employee notifications' shape so the bell can render it:
```
['type' => 'contract_expiring', 'subtype' => 'expiry',
 'contract_id' => …, 'contract_code' => …, 'contract_vendor' => …,
 'contract_name' => …, 'days_remaining' => …]
```

### Console command `contracts:send-expiry-alerts`
Thin wrapper: calls `ContractExpiryAlertService::run()`, prints the count. Registered automatically
(Laravel 12 auto-discovers `app/Console/Commands`).

### Scheduling (`routes/console.php`)
`Schedule::command('contracts:send-expiry-alerts')->dailyAt('08:00');`
Operational note: on the XAMPP/Windows host, a Windows Task Scheduler entry must run
`php artisan schedule:run` every minute for any scheduled task to fire. Documented in README;
the command can also be run manually for testing.

### Renew wiring
`ContractController::renew` (extends `end_date`) calls `ContractExpiryAlertService::resetForContract`
so the renewed contract starts a fresh alert cycle.

## Frontend (`notifications-dropdown.tsx`)
- Flip the `contracts` tab to `live: true`.
- Render contract notifications: a contract icon (e.g. `FileText`/`CalendarClock`), title
  `{vendor} ({code})`, subtitle like "Expires in {days_remaining} days".
- `handleClick`: branch on module — contract notifications navigate to `/contracts` (today it
  hardcodes `/employees?highlight=…`). Employee notifications keep current behavior.
- Add i18n keys: `notif_contract_expiring` (+ TH).
- `AppNotification` data type gains the contract fields (optional) in `notificationApi.ts`.

## Error handling
- No recipients → record log rows, send nothing, no error.
- Email send failures are already swallowed + logged by `EmailNotificationService::deliver`
  (writes an `email_logs` row with status `failed`); the bell notification is unaffected.
- The command is idempotent: the unique `(contract_id, threshold)` index + pre-insert check mean a
  double run in the same day sends nothing the second time.

## Testing (PHPUnit feature tests)
- Contract at exactly `daysRemaining == 30` with `notify_30` on → one bell notification +
  queued email to a `contracts.alerts` user; one `contract_alert_logs` row.
- Running the command twice → second run sends nothing (dedup).
- A user **without** `contracts.alerts` receives nothing.
- Contract crossing 60 and 30 on the same run → single alert at the most urgent (30), with both 60
  and 30 logged.
- Cancelled / already-expired contracts → no alert.
- After `resetForContract`, the contract alerts again.
- Assert email via `Mail::fake()` / `Bus::fake()` (queued) and bell via the `notifications` table.

## Out of scope (YAGNI)
- A "Run now" button in the UI (user chose scheduled-only).
- Per-user alert preferences (recipients are role-driven via the permission).
- Notifying the contract `owner` specifically (permission-based recipients only).
- Digest/grouping of multiple expiring contracts into one email.
