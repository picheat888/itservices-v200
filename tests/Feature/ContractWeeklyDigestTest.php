<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Contract\Contract;
use App\Models\Contract\ContractAlertLog;
use App\Models\Contract\ContractBellLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Contract\ContractDigestService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * The Monday summary of contracts needing a decision.
 *
 * The daily sweep answers "what changed today" and deliberately says each thing once; this
 * answers "what is on my plate" and repeats the whole list every week. The two must not
 * interfere: the summary is a read, so it can never consume a threshold the daily channel
 * had not sent yet.
 */
class ContractWeeklyDigestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function alertedUser(string $email = 'it@inaba.co.th'): User
    {
        $roleId = Role::firstOrCreate(['key' => 'itrole'], ['name' => 'IT', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => 'contracts.alerts'], ['allowed' => true]);

        return User::factory()->create(['role' => 'itrole', 'email' => $email, 'name' => 'Anong Wattana']);
    }

    /** @param  list<int>  $thresholds */
    private function contract(string $code, int $days, array $thresholds, ?float $totalValue = 120000): Contract
    {
        $attrs = [
            'code' => $code,
            'vendor_id' => Vendor::firstOrCreate(['name' => 'Acme Co.'])->id,
            'name' => 'Annual support',
            'type' => 'software',
            'start_date' => now()->subYear(),
            'end_date' => now()->addDays($days),
            'value' => 1000,
            'total_value' => $totalValue,
            'billing_cycle' => 'yearly',
        ];
        foreach (Contract::REMINDER_DAYS as $day) {
            $attrs["notify_{$day}"] = in_array($day, $thresholds, true);
        }

        return Contract::create($attrs);
    }

    /** @return array{recipients: int, expiring: int, overdue: int} */
    private function send(): array
    {
        return app(ContractDigestService::class)->send();
    }

    /** The HTML of the one digest mail that was queued. */
    private function digestHtml(): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'contract.weekly_digest');

        $this->assertNotNull($job, 'No weekly contract digest was queued.');

        return $this->prop($job, 'html');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_it_lists_expiring_and_overdue_contracts_in_separate_tables(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30]);   // inside its reminder window
        $this->contract('CT-2025-008', -5, [30]);   // past its end date

        $sent = $this->send();
        $this->assertSame(['recipients' => 1, 'expiring' => 1, 'overdue' => 1], $sent);

        $html = $this->digestHtml();
        $this->assertStringContainsString('CT-2026-014', $html);
        $this->assertStringContainsString('CT-2025-008', $html);
        // Two tables, not one list with both states mixed into it.
        $this->assertSame(2, substr_count($html, '<table'), 'Expiring and overdue must be separate tables.');

        // Each code sits in its own table, in the order the body declares them.
        $start = strpos($html, '<table');
        $expiringTable = substr($html, $start, strpos($html, '</table>') - $start);
        $this->assertStringContainsString('CT-2026-014', $expiringTable);
        $this->assertStringNotContainsString('CT-2025-008', $expiringTable);
    }

    public function test_every_column_the_summary_promises_is_filled(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [90, 30, 7]);

        $this->send();
        $html = $this->digestHtml();

        foreach (ContractDigestService::HEADERS as $header) {
            $this->assertStringContainsString($header, $html, "Missing column: {$header}");
        }

        $this->assertStringContainsString('Acme Co.', $html);
        $this->assertStringContainsString('Annual support', $html);
        $this->assertStringContainsString('120,000.00', $html);
        $this->assertStringContainsString(now()->addDays(20)->format('d-m-Y'), $html);
        // The contract's own reminder settings, in the days-before figures the form shows.
        $this->assertStringContainsString('90, 30, 7 days', $html);
    }

    public function test_a_contract_with_no_total_value_still_renders_a_row(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30], null);

        $this->send();
        $this->assertStringContainsString('CT-2026-014', $this->digestHtml());
    }

    public function test_an_empty_section_says_so_instead_of_rendering_a_bare_heading_row(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30]);

        $this->send();
        $html = $this->digestHtml();

        $this->assertSame(1, substr_count($html, '<table'), 'The empty section should not render a table.');
        $this->assertStringContainsString('Nothing in this list.', $html);
    }

    public function test_a_contract_with_every_reminder_switched_off_is_left_out(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, []);

        // The opt-out the daily sweep honours: a summary that listed it anyway would be a
        // way round the setting.
        $this->assertSame(['recipients' => 0, 'expiring' => 0, 'overdue' => 0], $this->send());
        Bus::assertNothingDispatched();
    }

    public function test_cancelled_and_expired_contracts_are_left_out(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30])->update(['cancelled_at' => now()]);
        $this->contract('CT-2026-015', -5, [30])->update(['expired_at' => now()]);

        $this->assertSame(['recipients' => 0, 'expiring' => 0, 'overdue' => 0], $this->send());
    }

    public function test_nothing_is_sent_to_somebody_without_contract_alerts(): void
    {
        Bus::fake();
        User::factory()->create(['email' => 'sales@inaba.co.th']);
        $this->contract('CT-2026-014', 20, [30]);

        $this->assertSame(0, $this->send()['recipients']);
        Bus::assertNothingDispatched();
    }

    public function test_the_summary_does_not_consume_the_daily_thresholds(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30]);

        $this->send();

        // The summary is a read. If it wrote to either ledger, the daily sweep would skip the
        // alert it had not sent yet — the reader would get the list and never the alert.
        $this->assertSame(0, ContractAlertLog::count());
        $this->assertSame(0, ContractBellLog::count());
    }

    public function test_the_console_command_runs_the_same_send(): void
    {
        Bus::fake();
        $this->alertedUser();
        $this->contract('CT-2026-014', 20, [30]);

        $this->artisan('contracts:send-weekly-digest')
            ->expectsOutputToContain('recipients: 1')
            ->assertSuccessful();
    }
}
