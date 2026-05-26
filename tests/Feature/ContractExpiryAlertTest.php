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
