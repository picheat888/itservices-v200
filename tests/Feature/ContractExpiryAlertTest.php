<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Contract;
use App\Models\ContractAlertLog;
use App\Models\ContractBellLog;
use App\Models\Role;
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

    /** Grants a permission to a role (resolved to role_id), creating the role if needed. */
    private function grant(string $roleKey, string $permission): void
    {
        $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission], ['allowed' => true]);
    }

    /** A user whose role grants contracts.alerts. */
    private function alertedUser(string $email = 'it@inaba.co.th'): User
    {
        $this->grant('itrole', 'contracts.alerts');

        return User::factory()->create(['role' => 'itrole', 'email' => $email]);
    }

    /** Creates a contract whose end date is $days from now (negative = already expired) with the given thresholds enabled. */
    private function contractExpiringIn(int $days, array $thresholds): Contract
    {
        // Explicitly set all notify columns so DB defaults don't bleed in.
        $attrs = [
            'vendor' => 'Microsoft', 'name' => 'M365', 'type' => 'software',
            'start_date' => now()->subYear(), 'end_date' => now()->addDays($days),
            'value' => 1000, 'billing_cycle' => 'yearly',
        ];
        foreach (Contract::REMINDER_DAYS as $d) {
            $attrs["notify_{$d}"] = in_array($d, $thresholds, true);
        }

        return Contract::create($attrs);
    }

    private function service(): ContractExpiryAlertService
    {
        return app(ContractExpiryAlertService::class);
    }

    public function test_fires_a_daily_bell_for_a_contract_in_its_reminder_window(): void
    {
        Notification::fake();
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);

        $belled = $this->service()->run();

        $this->assertSame(1, $belled);
        Notification::assertSentTo($user, ContractExpiryNotification::class);
        $this->assertSame(1, ContractBellLog::where('contract_id', $contract->id)
            ->whereDate('bell_date', now()->toDateString())->count());
    }

    public function test_bell_does_not_fire_twice_on_the_same_day(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(30, [30]);

        $this->service()->run();
        $secondRun = $this->service()->run();

        $this->assertSame(0, $secondRun);
        $this->assertSame(1, ContractBellLog::count());
    }

    public function test_bell_fires_again_the_next_day(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(30, [30]);

        $this->service()->run();
        $this->travel(1)->days();
        $secondRun = $this->service()->run();

        $this->assertSame(1, $secondRun);
        $this->assertSame(2, ContractBellLog::count());
        // The email channel must NOT re-fire — same threshold already covered.
        $this->assertSame(1, ContractAlertLog::count());
    }

    public function test_fires_a_bell_for_an_expired_contract(): void
    {
        Notification::fake();
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(-5, [30]);

        $belled = $this->service()->run();

        $this->assertSame(1, $belled);
        Notification::assertSentTo($user, ContractExpiryNotification::class);
        $this->assertDatabaseHas('contract_bell_logs', ['contract_id' => $contract->id]);
    }

    public function test_emails_at_a_crossed_threshold_and_logs_it(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);

        $this->service()->run();

        Bus::assertDispatched(SendTemplatedEmail::class);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 30]);
    }

    public function test_does_not_email_the_same_threshold_twice(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(30, [30]);

        $this->service()->run();
        $this->travel(1)->days();
        $this->service()->run();

        // One threshold email across both days (the bell carries the daily nag).
        Bus::assertDispatchedTimes(SendTemplatedEmail::class, 1);
        $this->assertSame(1, ContractAlertLog::count());
    }

    public function test_crossing_multiple_thresholds_emails_once_and_logs_all(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(25, [60, 30]); // both 60 and 30 crossed

        $this->service()->run();

        Bus::assertDispatchedTimes(SendTemplatedEmail::class, 1);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 30]);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 60]);
    }

    public function test_sends_one_expired_email_then_no_more(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(-5, [30]);

        $this->service()->run();
        $this->travel(1)->days();
        $this->service()->run();

        // The expired mail is one-shot (sentinel threshold 0); the bell still nags daily.
        Bus::assertDispatchedTimes(SendTemplatedEmail::class, 1);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 0]);
        $this->assertSame(2, ContractBellLog::count());
    }

    public function test_skips_a_contract_with_no_reminders_enabled(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $this->contractExpiringIn(-5, []); // expired but opted out of all reminders

        $belled = $this->service()->run();

        $this->assertSame(0, $belled);
        Notification::assertNothingSent();
        $this->assertSame(0, ContractBellLog::count());
        $this->assertSame(0, ContractAlertLog::count());
    }

    public function test_cancelled_contracts_are_skipped(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $cancelled = $this->contractExpiringIn(30, [30]);
        $cancelled->update(['cancelled_at' => now()]);

        $belled = $this->service()->run();

        $this->assertSame(0, $belled);
        $this->assertSame(0, ContractBellLog::count());
    }

    public function test_user_without_permission_is_not_notified(): void
    {
        Notification::fake();
        Bus::fake();
        User::factory()->create(['role' => 'user', 'email' => 'nobody@inaba.co.th']);
        $this->contractExpiringIn(30, [30]);

        $belled = $this->service()->run();

        $this->assertSame(0, $belled);
        Notification::assertNothingSent();
        // No ledger may be burned when nobody is configured to receive alerts —
        // otherwise enabling the permission later would never deliver them.
        $this->assertSame(0, ContractBellLog::count());
        $this->assertSame(0, ContractAlertLog::count());
    }

    public function test_reset_clears_both_ledgers(): void
    {
        Notification::fake();
        Bus::fake();
        $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);
        $this->service()->run();

        $this->assertSame(1, ContractBellLog::count());
        $this->assertSame(1, ContractAlertLog::count());

        $this->service()->resetForContract($contract);

        $this->assertSame(0, ContractBellLog::count());
        $this->assertSame(0, ContractAlertLog::count());
    }

    public function test_renewing_via_api_resets_the_ledgers(): void
    {
        Notification::fake();
        Bus::fake();
        $this->grant('itrole', 'contracts.renew');
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);
        $this->service()->run(); // logs bell + threshold 30

        $this->actingAs($user)
            ->postJson("/api/contracts/{$contract->id}/renew", ['months' => 12])
            ->assertOk();

        $this->assertSame(0, ContractAlertLog::where('contract_id', $contract->id)->count());
        $this->assertSame(0, ContractBellLog::where('contract_id', $contract->id)->count());
    }

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

    public function test_alerts_on_the_90_day_threshold(): void
    {
        Notification::fake();
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(90, [90]);

        $belled = $this->service()->run();

        $this->assertSame(1, $belled);
        Notification::assertSentTo($user, ContractExpiryNotification::class);
        $this->assertDatabaseHas('contract_alert_logs', ['contract_id' => $contract->id, 'threshold' => 90]);
    }

    /** Returns the count of bell notifications a user holds for one contract. */
    private function bellsFor(User $user, Contract $contract): int
    {
        return $user->fresh()->notifications()
            ->where('type', ContractExpiryNotification::class)
            ->where('data->contract_id', $contract->id)
            ->count();
    }

    public function test_daily_bell_overwrites_instead_of_stacking(): void
    {
        // Real notifications (no Notification::fake) so we can inspect the rows.
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);

        $this->service()->run();   // day 1
        $this->travel(1)->days();
        $this->service()->run();   // day 2 — overwrites, does not stack

        $this->assertSame(1, $this->bellsFor($user, $contract));
    }

    public function test_daily_bell_resurfaces_as_unread_after_being_read(): void
    {
        Bus::fake();
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);

        $this->service()->run();                              // unread bell appears
        $user->fresh()->unreadNotifications->markAsRead();    // user reads it
        $this->assertSame(0, $user->fresh()->unreadNotifications()->count());

        $this->travel(1)->days();
        $this->service()->run();                              // next day re-surfaces it

        $this->assertSame(1, $user->fresh()->unreadNotifications()->count());
        $this->assertSame(1, $this->bellsFor($user, $contract));
    }

    public function test_renew_removes_the_bell_notification(): void
    {
        Bus::fake();
        $this->grant('itrole', 'contracts.renew');
        $user = $this->alertedUser();
        $contract = $this->contractExpiringIn(30, [30]);
        $this->service()->run();
        $this->assertSame(1, $this->bellsFor($user, $contract));

        $this->actingAs($user)
            ->postJson("/api/contracts/{$contract->id}/renew", ['months' => 12])
            ->assertOk();

        $this->assertSame(0, $this->bellsFor($user, $contract));
    }
}
