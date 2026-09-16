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
