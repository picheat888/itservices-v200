<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockAlertLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use App\Services\Stock\StockNotificationService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class StockNotificationCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Stock notification templates now live in EmailTemplateSeeder (no longer seeded by migration).
        $this->seed(EmailTemplateSeeder::class);
    }

    private function userWithPerm(string $permission): User
    {
        $role = Role::create(['key' => 'crole_'.uniqid(), 'name' => 'C', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);

        return User::factory()->create(['role_id' => $role->id, 'email' => 'c'.uniqid().'@x.test']);
    }

    public function test_command_fires_alert_waiting_and_draft(): void
    {
        Notification::fake();
        $module = $this->userWithPerm('stock.module');
        $approver = $this->userWithPerm('stock.approve');
        $counter = $this->userWithPerm('stock.view_count');
        $owner = $this->userWithPerm('stock.request');

        $low = StockItem::create(['sku' => 'C-LOW', 'name' => 'Low', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);
        StockRequest::create(['stock_item_id' => $low->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);
        StockCount::create(['reference' => 'CNT-'.uniqid(), 'status' => 'draft', 'counted_by' => $counter->id]);

        $this->artisan('stock:send-notifications')->assertExitCode(0);

        Notification::assertSentTo($module, StockAlertNotification::class);
        Notification::assertSentTo($approver, StockRequestNotification::class);
        Notification::assertSentTo($counter, StockCountDraftNotification::class);
    }

    public function test_the_daily_run_reminds_issuers_of_approved_requests(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $issuer = $this->userWithPerm('stock.fulfill');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'C-APR', 'name' => 'Apr', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => 'approved']);

        $this->artisan('stock:send-notifications')->assertExitCode(0);

        Notification::assertSentTo($issuer, StockRequestNotification::class);
        Notification::assertNotSentTo($approver, StockRequestNotification::class);
    }

    public function test_force_clears_the_per_day_alert_dedup(): void
    {
        Notification::fake();
        $this->userWithPerm('stock.module');
        $item = StockItem::create(['sku' => 'F-OUT', 'name' => 'Out', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);

        $log = new StockAlertLog;
        $log->stock_item_id = $item->id;
        $log->alert_type = 'out';
        $log->last_alerted_on = now()->toDateString();
        $log->save();

        $this->artisan('stock:send-notifications', ['--force' => true])->assertExitCode(0);

        // --force wipes the dedup ledger so the alert is treated as fresh again.
        $this->assertSame(0, StockAlertLog::count());
    }

    public function test_the_daily_run_rings_bells_and_mails_nobody(): void
    {
        Notification::fake();
        Queue::fake();

        $this->userWithPerm('stock.module');
        StockItem::create(['sku' => 'DG-OUT', 'name' => 'Out', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);

        app(StockNotificationService::class)->run();

        // Anything that crosses a threshold already mailed at the moment it happened; the
        // daily sweep only refreshes the tray, which costs nobody an interruption.
        Queue::assertNothingPushed();
        Notification::assertSentTimes(StockAlertNotification::class, 1);
    }

    public function test_the_weekly_digest_is_one_mail_per_holder_not_one_per_item(): void
    {
        Notification::fake();
        Queue::fake();

        // Two module holders, two alerting items.
        $this->userWithPerm('stock.module');
        $this->userWithPerm('stock.module');
        StockItem::create(['sku' => 'DG-OUT', 'name' => 'Out', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);
        StockItem::create(['sku' => 'DG-OVER', 'name' => 'Over', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 10, 'current_stock' => 99]);

        $this->artisan('stock:send-weekly-digest')->assertExitCode(0);

        // Exactly one digest per holder (2), NOT one per item-per-holder (would be 4).
        Queue::assertPushed(SendTemplatedEmail::class, 2);
        Queue::assertPushed(SendTemplatedEmail::class, fn (SendTemplatedEmail $job) => $job->templateKey === 'stock.alert_digest');

        // And never the per-item alert templates — those fire at the moment of the change.
        Queue::assertNotPushed(
            SendTemplatedEmail::class,
            fn (SendTemplatedEmail $job) => in_array($job->templateKey, ['stock.out_of_stock', 'stock.low_alert', 'stock.overstock_alert'], true),
        );
    }

    private function requestIn(string $status, User $owner, string $sku): StockRequest
    {
        $item = StockItem::create(['sku' => $sku, 'name' => "Item {$sku}", 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);

        return StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => $status]);
    }

    /** @return list<SendTemplatedEmail> */
    private function requestDigestsTo(User $user): array
    {
        return collect(Queue::pushed(SendTemplatedEmail::class))
            ->filter(fn (SendTemplatedEmail $job) => $job->templateKey === 'stock.request_approval_needed' && $job->toEmail === $user->email)
            ->values()->all();
    }

    public function test_the_weekly_request_digest_gives_approvers_pending_and_issuers_approved(): void
    {
        Notification::fake();
        Queue::fake();
        $approver = $this->userWithPerm('stock.approve');
        $issuer = $this->userWithPerm('stock.fulfill');
        $both = $this->userWithPerm('stock.approve');
        RolePermission::create(['role_id' => $both->role_id, 'permission' => 'stock.fulfill', 'allowed' => true]);
        $owner = $this->userWithPerm('stock.request');
        $pending = $this->requestIn('pending', $owner, 'WP-1');
        $approved = $this->requestIn('approved', $owner, 'WA-1');

        $this->artisan('stock:send-weekly-digest')->assertExitCode(0);

        [$toApprover] = $this->requestDigestsTo($approver);
        $this->assertStringContainsString($pending->reference, $toApprover->html);
        $this->assertStringNotContainsString($approved->reference, $toApprover->html);
        $this->assertStringContainsString('1 still open', $toApprover->subject);

        [$toIssuer] = $this->requestDigestsTo($issuer);
        $this->assertStringContainsString($approved->reference, $toIssuer->html);
        $this->assertStringNotContainsString($pending->reference, $toIssuer->html);
        $this->assertStringNotContainsString('Pending Approval', $toIssuer->html);

        // A holder of both keys gets one mail carrying both parts.
        $toBoth = $this->requestDigestsTo($both);
        $this->assertCount(1, $toBoth);
        $this->assertStringContainsString($pending->reference, $toBoth[0]->html);
        $this->assertStringContainsString($approved->reference, $toBoth[0]->html);
        $this->assertStringContainsString('Pending Approval', $toBoth[0]->html);
        $this->assertStringContainsString('Awaiting Fulfilment', $toBoth[0]->html);
        $this->assertStringContainsString('2 still open', $toBoth[0]->subject);

        $this->assertSame([], $this->requestDigestsTo($owner));
    }

    public function test_an_issuer_with_nothing_approved_gets_no_request_digest(): void
    {
        Notification::fake();
        Queue::fake();
        $approver = $this->userWithPerm('stock.approve');
        $issuer = $this->userWithPerm('stock.fulfill');
        $this->requestIn('pending', $this->userWithPerm('stock.request'), 'WP-2');

        $this->artisan('stock:send-weekly-digest')->assertExitCode(0);

        $this->assertCount(1, $this->requestDigestsTo($approver));
        $this->assertSame([], $this->requestDigestsTo($issuer));
    }

    public function test_the_weekly_digest_leaves_the_alert_ledger_alone(): void
    {
        Notification::fake();
        Queue::fake();
        $this->userWithPerm('stock.module');
        $item = StockItem::create(['sku' => 'WD-OUT', 'name' => 'Out', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);

        // The per-item path owns this ledger — it is what stops the same alert going out
        // twice in a day. A summary that wrote to it would make the real-time alert think it
        // had already been sent; one that cleared it would let the alert fire twice.
        $log = new StockAlertLog;
        $log->stock_item_id = $item->id;
        $log->alert_type = 'out';
        $log->last_alerted_on = now()->subDay()->toDateString();
        $log->save();

        $this->artisan('stock:send-weekly-digest')->assertExitCode(0);

        $this->assertSame(1, StockAlertLog::count(), 'the summary added or removed a dedup row');
        $this->assertSame(
            now()->subDay()->toDateString(),
            StockAlertLog::first()->last_alerted_on->toDateString(),
            'the summary stamped a row it does not own'
        );
    }
}
