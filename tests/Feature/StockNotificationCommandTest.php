<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockAlertLog;
use App\Models\StockCount;
use App\Models\StockItem;
use App\Models\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use App\Services\StockNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class StockNotificationCommandTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_daily_run_emails_one_alert_digest_per_module_holder_not_per_item(): void
    {
        Notification::fake();
        Queue::fake();

        // Two module holders, two alerting items.
        $this->userWithPerm('stock.module');
        $this->userWithPerm('stock.module');
        StockItem::create(['sku' => 'DG-OUT', 'name' => 'Out', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);
        StockItem::create(['sku' => 'DG-OVER', 'name' => 'Over', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 10, 'current_stock' => 99]);

        app(StockNotificationService::class)->run();

        // Exactly one digest per holder (2), NOT one per item-per-holder (would be 4).
        Queue::assertPushed(SendTemplatedEmail::class, 2);
        Queue::assertPushed(SendTemplatedEmail::class, fn (SendTemplatedEmail $job) => $job->templateKey === 'stock.alert_digest');

        // The daily run must NOT send the per-item alert templates (those are real-time only).
        Queue::assertNotPushed(
            SendTemplatedEmail::class,
            fn (SendTemplatedEmail $job) => in_array($job->templateKey, ['stock.out_of_stock', 'stock.low_alert', 'stock.overstock_alert'], true),
        );
    }
}
