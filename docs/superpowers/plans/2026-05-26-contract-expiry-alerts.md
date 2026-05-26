# Contract Expiry Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a contract crosses an enabled reminder threshold, notify every user whose role has `contracts.alerts` ON — once per threshold — via the in-app bell and a queued email.

**Architecture:** A daily Artisan command calls `ContractExpiryAlertService::run()`, which finds active contracts that have crossed a not-yet-alerted threshold, sends a `ContractExpiryNotification` (database/bell) plus a queued templated email to permitted users, and records each fired threshold in a new `contract_alert_logs` dedup table. Renewing a contract clears its log rows so the next cycle re-alerts.

**Tech Stack:** Laravel 12 (PHP 8.2), Eloquent, Laravel Notifications (database channel), queued Mailables, PHPUnit; React 19 + TypeScript for the notification bell.

---

## File structure

- Create: `database/migrations/2026_05_26_000001_create_contract_alert_logs_table.php` — dedup ledger table.
- Create: `database/migrations/2026_05_26_000002_replace_contract_expiry_email_templates.php` — swap 3 rigid templates for 1 flexible.
- Create: `app/Models/ContractAlertLog.php` — model for the ledger.
- Create: `app/Notifications/ContractExpiryNotification.php` — bell notification.
- Create: `app/Services/ContractExpiryAlertService.php` — decide + dispatch logic.
- Create: `app/Console/Commands/SendContractExpiryAlerts.php` — daily command.
- Create: `tests/Feature/ContractExpiryAlertTest.php` — feature tests.
- Modify: `routes/console.php` — schedule the command daily.
- Modify: `app/Http/Controllers/Api/ContractController.php:164-174` — clear logs on renew.
- Modify: `resources/js/services/notificationApi.ts` — extend notification data type.
- Modify: `resources/js/components/shell/notifications-dropdown.tsx` — contracts tab live + render + click.
- Modify: `resources/js/lib/i18n.ts` — `notif_contract_expiring` (EN/TH).

---

## Task 1: Migration — `contract_alert_logs` table

**Files:**
- Create: `database/migrations/2026_05_26_000001_create_contract_alert_logs_table.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dedup ledger for contract expiry alerts: one row per (contract, reminder
     * threshold) that has already been alerted, so each threshold fires once
     * per contract cycle. Cleared for a contract when it is renewed.
     */
    public function up(): void
    {
        Schema::create('contract_alert_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('threshold'); // reminder day count, e.g. 30
            $table->timestamp('alerted_at');
            $table->unique(['contract_id', 'threshold']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_alert_logs');
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: migrates `2026_05_26_000001_create_contract_alert_logs_table` with no error.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/2026_05_26_000001_create_contract_alert_logs_table.php
git commit -m "Add contract_alert_logs dedup table"
```

---

## Task 2: Migration — replace contract expiry email templates

**Files:**
- Create: `database/migrations/2026_05_26_000002_replace_contract_expiry_email_templates.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Replaces the three rigid day-specific contract templates with one flexible
     * template whose subject/body carry a {{contract.days_remaining}} variable,
     * so every reminder threshold (150/120/60/45/30/7) is covered by one row.
     */
    public function up(): void
    {
        DB::table('email_templates')
            ->whereIn('key', ['contract.expire.60d', 'contract.expire.30d', 'contract.expire.7d'])
            ->delete();

        DB::table('email_templates')->insert([
            'key'        => 'contract.expiry_alert',
            'name'       => 'Contract expiring soon',
            'subject'    => 'Contract {{contract.vendor}} expires in {{contract.days_remaining}} days',
            'body_html'  => "<p>Hi {{user.first_name}},</p>\n"
                . "<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} expires in "
                . "<strong>{{contract.days_remaining}}</strong> days (on {{contract.end_date}}). "
                . "Please review and decide on renewal.</p>\n"
                . "<p style=\"color:#64748b\">Reference: <strong>{{contract.code}}</strong></p>",
            'enabled'    => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'contract.expiry_alert')->delete();

        $contract = 'A vendor contract is approaching its expiration date. Please review and decide on renewal.';
        $body = "<p>Hi {{user.first_name}},</p>\n<p>{$contract}</p>\n"
            . "<p style=\"color:#64748b\">Reference: <strong>{{reference.id}}</strong></p>";
        $now = now();

        DB::table('email_templates')->insert([
            ['key' => 'contract.expire.60d', 'name' => 'Contract expiring (60 days)', 'subject' => 'Contract {{contract.vendor}} expires in 60 days', 'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'contract.expire.30d', 'name' => 'Contract expiring (30 days)', 'subject' => 'Contract {{contract.vendor}} expires in 30 days', 'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'contract.expire.7d',  'name' => 'Contract expiring (7 days)',  'subject' => 'Contract {{contract.vendor}} expires in 7 days',  'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: migrates the template swap; `php artisan tinker --execute 'echo \App\Models\EmailTemplate::where("key","contract.expiry_alert")->exists();'` prints `1`.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/2026_05_26_000002_replace_contract_expiry_email_templates.php
git commit -m "Replace rigid contract expiry email templates with one flexible template"
```

---

## Task 3: `ContractAlertLog` model

**Files:**
- Create: `app/Models/ContractAlertLog.php`

- [ ] **Step 1: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per (contract, reminder threshold) that has been alerted. Acts as the
 * dedup ledger for ContractExpiryAlertService. No created_at/updated_at — the
 * single alerted_at timestamp is all we need.
 */
class ContractAlertLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['contract_id', 'threshold', 'alerted_at'];

    protected function casts(): array
    {
        return [
            'threshold'  => 'integer',
            'alerted_at' => 'datetime',
        ];
    }
}
```

- [ ] **Step 2: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no errors (may report fixes).

- [ ] **Step 3: Commit**

```bash
git add app/Models/ContractAlertLog.php
git commit -m "Add ContractAlertLog model"
```

---

## Task 4: `ContractExpiryNotification` (bell notification)

**Files:**
- Create: `app/Notifications/ContractExpiryNotification.php`

- [ ] **Step 1: Write the notification**

```php
<?php

namespace App\Notifications;

use App\Models\Contract;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell alert that a contract is approaching expiry. Sent to
 * every user whose role holds the contracts.alerts permission. The payload
 * shape mirrors the employee notifications so the bell can render it.
 */
class ContractExpiryNotification extends Notification
{
    public function __construct(
        private readonly Contract $contract,
        private readonly int $daysRemaining,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type'            => 'contract_expiring',
            'subtype'         => 'expiry',
            'contract_id'     => $this->contract->id,
            'contract_code'   => $this->contract->code,
            'contract_vendor' => $this->contract->vendor,
            'contract_name'   => $this->contract->name,
            'days_remaining'  => $this->daysRemaining,
        ];
    }
}
```

- [ ] **Step 2: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/Notifications/ContractExpiryNotification.php
git commit -m "Add ContractExpiryNotification bell notification"
```

---

## Task 5: `ContractExpiryAlertService` (core logic, TDD)

**Files:**
- Create: `app/Services/ContractExpiryAlertService.php`
- Test: `tests/Feature/ContractExpiryAlertTest.php`

- [ ] **Step 1: Write the failing test file**

```php
<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\ContractAlertLog;
use App\Models\RolePermission;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use App\Services\ContractExpiryAlertService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ContractExpiryAlertTest extends TestCase
{
    use RefreshDatabase;

    /** A user whose role grants contracts.alerts. */
    private function alertedUser(string $email = 'it@inaba.co.th'): User
    {
        RolePermission::firstOrCreate(['role' => 'itrole', 'permission' => 'contracts.alerts'], ['allowed' => true]);

        return User::factory()->create(['role' => 'itrole', 'email' => $email]);
    }

    /** Creates an active contract expiring in $days days with the given thresholds enabled. */
    private function contractExpiringIn(int $days, array $thresholds): Contract
    {
        $attrs = [
            'vendor' => 'Microsoft', 'name' => 'M365', 'type' => 'software',
            'start_date' => now()->subYear(), 'end_date' => now()->addDays($days),
            'value' => 1000, 'billing_cycle' => 'yearly',
        ];
        foreach ($thresholds as $d) {
            $attrs["notify_{$d}"] = true;
        }

        return Contract::create($attrs);
    }

    private function service(): ContractExpiryAlertService
    {
        return app(ContractExpiryAlertService::class);
    }

    public function test_alerts_a_contract_that_crossed_a_threshold(): void
    {
        Notification::fake();
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);

        $sent = $this->service()->run();

        $this->assertSame(1, $sent);
        Notification::assertSentTo($user, ContractExpiryNotification::class);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 30]);
    }

    public function test_does_not_alert_twice_for_the_same_threshold(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(30, [30]);

        $this->service()->run();
        $secondRun = $this->service()->run();

        $this->assertSame(0, $secondRun);
        $this->assertSame(1, ContractAlertLog::count());
    }

    public function test_crossing_multiple_thresholds_sends_one_alert_and_logs_all(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(25, [60, 30]); // both 60 and 30 crossed

        $sent = $this->service()->run();

        $this->assertSame(1, $sent);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 30]);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 60]);
    }

    public function test_user_without_permission_is_not_notified(): void
    {
        Notification::fake();
        Bus::fake();
        User::factory()->create(['role' => 'user', 'email' => 'nobody@inaba.co.th']);
        $this->contractExpiringIn(30, [30]);

        $sent = $this->service()->run();

        $this->assertSame(0, $sent);
        Notification::assertNothingSent();
    }

    public function test_cancelled_and_expired_contracts_are_skipped(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $cancelled = $this->contractExpiringIn(30, [30]);
        $cancelled->update(['cancelled_at' => now()]);
        $expired = $this->contractExpiringIn(-5, [30]);

        $sent = $this->service()->run();

        $this->assertSame(0, $sent);
        $this->assertSame(0, ContractAlertLog::count());
    }

    public function test_reset_lets_a_renewed_contract_alert_again(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);
        $this->service()->run();

        $this->service()->resetForContract($contract);
        $contract->update(['end_date' => now()->addDays(30)]);
        $sent = $this->service()->run();

        $this->assertSame(1, $sent);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact tests/Feature/ContractExpiryAlertTest.php`
Expected: FAIL — `Class "App\Services\ContractExpiryAlertService" not found` (or similar).

- [ ] **Step 3: Write the service**

```php
<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractAlertLog;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use Illuminate\Support\Facades\Notification;

/**
 * Decides which contracts have crossed a not-yet-alerted reminder threshold and
 * dispatches the bell + email alert to users holding contracts.alerts. Each
 * threshold fires once per contract cycle, tracked in contract_alert_logs.
 */
class ContractExpiryAlertService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Evaluate all active contracts and send any due alerts.
     *
     * @return int number of contracts alerted on this run
     */
    public function run(): int
    {
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('contracts.alerts')
        );

        $contracts = Contract::whereNull('cancelled_at')
            ->whereDate('end_date', '>', now())
            ->get()
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== []);

        $sent = 0;

        foreach ($contracts as $contract) {
            $days = $contract->daysRemaining();

            $crossed = array_filter($contract->enabledReminderDays(), fn (int $d) => $days <= $d);
            if ($crossed === []) {
                continue;
            }

            $alreadyAlerted = ContractAlertLog::where('contract_id', $contract->id)
                ->pluck('threshold')->all();
            $newCrossed = array_values(array_diff($crossed, $alreadyAlerted));
            if ($newCrossed === []) {
                continue;
            }

            if ($recipients->isNotEmpty()) {
                $this->dispatchAlert($contract, $days, $recipients);
                $sent++;
            }

            // Record every newly-crossed threshold (including larger ones we skipped
            // by alerting at the most urgent) so they never fire as stale alerts later.
            foreach ($newCrossed as $threshold) {
                ContractAlertLog::create([
                    'contract_id' => $contract->id,
                    'threshold'   => $threshold,
                    'alerted_at'  => now(),
                ]);
            }
        }

        return $sent;
    }

    /** Clears a contract's alert ledger so a renewed term alerts afresh. */
    public function resetForContract(Contract $contract): void
    {
        ContractAlertLog::where('contract_id', $contract->id)->delete();
    }

    /**
     * Sends the bell notification to all recipients and a queued email to each
     * recipient that has an email address.
     *
     * @param  \Illuminate\Support\Collection<int, User>  $recipients
     */
    private function dispatchAlert(Contract $contract, int $days, $recipients): void
    {
        Notification::send($recipients, new ContractExpiryNotification($contract, $days));

        foreach ($recipients as $recipient) {
            if (! $recipient->email) {
                continue;
            }
            $this->email->sendTemplate('contract.expiry_alert', $recipient->email, [
                'user.first_name'         => explode(' ', (string) $recipient->name)[0] ?? 'there',
                'contract.vendor'         => $contract->vendor,
                'contract.name'           => $contract->name,
                'contract.code'           => $contract->code,
                'contract.days_remaining' => $days,
                'contract.end_date'       => $contract->end_date->toDateString(),
            ]);
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php artisan test --compact tests/Feature/ContractExpiryAlertTest.php`
Expected: PASS — 6 tests.

- [ ] **Step 5: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/Services/ContractExpiryAlertService.php tests/Feature/ContractExpiryAlertTest.php
git commit -m "Add ContractExpiryAlertService with dedup and tests"
```

---

## Task 6: Console command `contracts:send-expiry-alerts`

**Files:**
- Create: `app/Console/Commands/SendContractExpiryAlerts.php`
- Test: `tests/Feature/ContractExpiryAlertTest.php` (add one case)

- [ ] **Step 1: Write the failing test (append to the test class)**

Add this method inside `ContractExpiryAlertTest`:

```php
    public function test_command_runs_and_reports_count(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(30, [30]);

        $this->artisan('contracts:send-expiry-alerts')
            ->expectsOutputToContain('1')
            ->assertExitCode(0);
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --compact --filter=test_command_runs_and_reports_count`
Expected: FAIL — command `contracts:send-expiry-alerts` is not defined.

- [ ] **Step 3: Write the command**

```php
<?php

namespace App\Console\Commands;

use App\Services\ContractExpiryAlertService;
use Illuminate\Console\Command;

/**
 * Daily job that fires contract expiry alerts. Thin wrapper around
 * ContractExpiryAlertService::run(); scheduled in routes/console.php.
 */
class SendContractExpiryAlerts extends Command
{
    protected $signature = 'contracts:send-expiry-alerts';

    protected $description = 'Send expiry alerts for contracts crossing a reminder threshold';

    public function handle(ContractExpiryAlertService $service): int
    {
        $count = $service->run();
        $this->info("Contract expiry alerts sent: {$count}");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php artisan test --compact --filter=test_command_runs_and_reports_count`
Expected: PASS.

- [ ] **Step 5: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/Console/Commands/SendContractExpiryAlerts.php tests/Feature/ContractExpiryAlertTest.php
git commit -m "Add contracts:send-expiry-alerts command"
```

---

## Task 7: Schedule the command daily

**Files:**
- Modify: `routes/console.php`

- [ ] **Step 1: Append the schedule entry**

Add to the end of `routes/console.php`:

```php
use Illuminate\Support\Facades\Schedule;

Schedule::command('contracts:send-expiry-alerts')->dailyAt('08:00');
```

(Keep the existing `use` statements and the `inspire` command. Place the new `use Illuminate\Support\Facades\Schedule;` with the other `use` lines at the top.)

- [ ] **Step 2: Verify the schedule is registered**

Run: `php artisan schedule:list`
Expected: lists `contracts:send-expiry-alerts` running daily at 08:00.

- [ ] **Step 3: Commit**

```bash
git add routes/console.php
git commit -m "Schedule contract expiry alerts daily at 08:00"
```

---

## Task 8: Clear alert logs on renew

**Files:**
- Modify: `app/Http/Controllers/Api/ContractController.php:164-174`

- [ ] **Step 1: Inject the service and call resetForContract in renew**

In `ContractController`, change the constructor to also receive the alert service, and call `resetForContract` inside `renew` after the renew succeeds.

Constructor (line 16) becomes:

```php
    public function __construct(
        private readonly ContractService $service,
        private readonly ContractExpiryAlertService $alertService,
    ) {}
```

Add the import near the other `use` lines:

```php
use App\Services\ContractExpiryAlertService;
```

`renew` (lines 164-174) becomes:

```php
    /** Extends a contract's term. Requires the contracts.renew permission. */
    public function renew(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.renew'), 403);

        $months = (int) $request->input('months', 12);
        $contract = $this->service->renew($contract, $months > 0 ? $months : 12);
        $this->alertService->resetForContract($contract);
        AuditLog::record('Renewed contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('owner')))
            ->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 2: Write the failing test (append to the test class)**

```php
    public function test_renewing_via_api_resets_the_alert_ledger(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        \Illuminate\Support\Facades\Bus::fake();
        RolePermission::firstOrCreate(['role' => 'itrole', 'permission' => 'contracts.renew'], ['allowed' => true]);
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);
        $this->service()->run(); // logs threshold 30

        $this->actingAs($user)
            ->postJson("/api/contracts/{$contract->id}/renew", ['months' => 12])
            ->assertOk();

        $this->assertSame(0, ContractAlertLog::where('contract_id', $contract->id)->count());
    }
```

- [ ] **Step 3: Run it to verify it fails, then passes after Step 1**

Run: `php artisan test --compact --filter=test_renewing_via_api_resets_the_alert_ledger`
Expected: PASS once the controller change is in place (run before the change to see it fail with non-zero count).

- [ ] **Step 4: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/ContractController.php tests/Feature/ContractExpiryAlertTest.php
git commit -m "Reset contract alert ledger on renew"
```

---

## Task 9: Notification bell — show contract expiry alerts

**Files:**
- Modify: `resources/js/services/notificationApi.ts`
- Modify: `resources/js/lib/i18n.ts`
- Modify: `resources/js/components/shell/notifications-dropdown.tsx`

- [ ] **Step 1: Extend the notification data type**

In `resources/js/services/notificationApi.ts`, replace the `NotificationData` interface with one that covers both employee and contract notifications:

```ts
export interface NotificationData {
    type: string;
    subtype: 'credentials_required' | 'offboarding' | 'expiry';
    // Employee notifications
    employee_id?: number;
    employee_name?: string;
    employee_code?: string;
    // Contract expiry notifications
    contract_id?: number;
    contract_code?: string;
    contract_vendor?: string;
    contract_name?: string;
    days_remaining?: number;
}
```

- [ ] **Step 2: Add the i18n key**

In `resources/js/lib/i18n.ts`, add to the EN block near `notif_resigned`:

```ts
    notif_contract_expiring: 'Expires in {days} days',
```

and to the TH block:

```ts
    notif_contract_expiring: 'หมดอายุในอีก {days} วัน',
```

Note: `useT()` returns `(key) => translate(lang, key)` with no interpolation. The `{days}` token is a literal placeholder; Step 4 substitutes it at the call site with `.replace('{days}', String(n.data.days_remaining))`. No i18n changes beyond adding the two keys.

- [ ] **Step 3: Make the contracts tab live**

In `resources/js/components/shell/notifications-dropdown.tsx`, in `NOTIF_TABS`, change the contracts entry:

```ts
    { id: 'contracts', label: 'contracts', live: true },
```

- [ ] **Step 4: Render contract notifications and route their click**

In the same file, update `handleClick` to branch by module:

```tsx
    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        if (moduleOf(n.data.type) === 'contracts') {
            navigate('/contracts');
        } else {
            navigate(`/employees?highlight=${n.data.employee_id}`);
        }
        onClose();
    };
```

Then update the list item body to render contract rows. Replace the icon + text block (the `n.data.subtype === 'offboarding' ? ... ` icon and the title/subtitle `div`s) with:

```tsx
                        {n.data.type === 'contract_expiring' ? (
                            <CalendarClock className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', n.read ? 'text-muted-foreground' : 'text-amber-500')} />
                        ) : n.data.subtype === 'offboarding' ? (
                            <UserMinus className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', n.read ? 'text-muted-foreground' : 'text-red-500')} />
                        ) : (
                            <UserPlus className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', n.read ? 'text-muted-foreground' : 'text-amber-500')} />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className={cn('text-sm leading-snug', !n.read && 'font-semibold')}>
                                {n.data.type === 'contract_expiring'
                                    ? `${n.data.contract_vendor} (${n.data.contract_code})`
                                    : `${n.data.employee_name} (${n.data.employee_code})`}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                {n.data.type === 'contract_expiring'
                                    ? t('notif_contract_expiring').replace('{days}', String(n.data.days_remaining))
                                    : n.data.subtype === 'offboarding' ? t('notif_resigned') : t('notif_cred_required')}
                            </div>
                        </div>
```

Add `CalendarClock` to the lucide-react import at the top:

```tsx
import { CalendarClock, UserMinus, UserPlus, X } from 'lucide-react';
```

- [ ] **Step 5: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: no new errors in `notifications-dropdown.tsx`, `notificationApi.ts`, or `i18n.ts`. (Pre-existing errors in `add-employee-drawer.tsx` and `use-session-timeout.ts` are unrelated WIP — ignore them.)

- [ ] **Step 6: Manual verification**

Run the app (`npm run dev` / `composer run dev`). With a `contracts.alerts` user logged in, seed/create a contract expiring within an enabled threshold, run `php artisan contracts:send-expiry-alerts`, then open the bell → the Contracts tab shows the alert with vendor/code and "Expires in N days"; clicking navigates to `/contracts`.

- [ ] **Step 7: Commit**

```bash
git add resources/js/services/notificationApi.ts resources/js/lib/i18n.ts resources/js/components/shell/notifications-dropdown.tsx
git commit -m "Render contract expiry alerts in the notification bell"
```

---

## Task 10: Full suite check

- [ ] **Step 1: Run the feature tests for this module**

Run: `php artisan test --compact tests/Feature/ContractExpiryAlertTest.php`
Expected: PASS — all cases (7).

- [ ] **Step 2: Confirm no regression in contracts**

Run: `php artisan test --compact tests/Feature/ContractApiTest.php`
Expected: PASS (unchanged).

Note: the broader suite has pre-existing failures in `Auth/*`, `Settings/*`, and `DashboardTest` (Breeze scaffolding tests that don't match this Sanctum SPA) — those are unrelated to this work.

---

## Self-review notes
- Spec "dedup table" → Tasks 1, 3, 5. "single flexible email template" → Task 2. "scheduled daily command" → Tasks 6, 7. "bell + email to contracts.alerts users" → Task 5. "renew resets cycle" → Task 8. "frontend bell" → Task 9. All spec sections covered.
- Type consistency: `ContractExpiryAlertService::run()` / `resetForContract()`, notification payload keys (`contract_*`, `days_remaining`), template key `contract.expiry_alert`, and command signature `contracts:send-expiry-alerts` are used identically across tasks.
- i18n: confirmed `useT()` has no interpolation, so Task 9 substitutes `{days}` at the call site with `.replace()` — no blocking unknown.
