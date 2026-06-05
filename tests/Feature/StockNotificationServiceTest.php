<?php

namespace Tests\Feature;

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
use Tests\TestCase;

class StockNotificationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_alert_log_persists_unique_per_item_and_type(): void
    {
        $item = StockItem::create([
            'sku' => 'AL-1',
            'name' => 'Al',
            'unit' => 'unit',
        ]);

        StockAlertLog::create(['stock_item_id' => $item->id, 'alert_type' => 'low', 'last_alerted_on' => now()->toDateString()]);
        $this->assertDatabaseHas('stock_alert_logs', ['stock_item_id' => $item->id, 'alert_type' => 'low']);
    }

    public function test_stock_request_belongs_to_its_owner(): void
    {
        $user = User::factory()->create();
        $item = StockItem::create(['sku' => 'OWN-1', 'name' => 'Owned', 'unit' => 'unit']);
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $user->id, 'requester_name' => $user->name,
            'qty' => 1, 'reason' => 'r', 'status' => 'pending',
        ]);

        $this->assertSame($user->id, $req->user->id);
    }

    /** Grant a fresh non-super user a single permission. */
    private function userWithPerm(string $permission): User
    {
        $role = Role::create(['key' => 'nrole_'.uniqid(), 'name' => 'N', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);

        return User::factory()->create(['role_id' => $role->id, 'email' => 'r'.uniqid().'@x.test']);
    }

    public function test_alert_bells_module_holders_for_a_low_item(): void
    {
        Notification::fake();
        $recipient = $this->userWithPerm('stock.module');
        $item = StockItem::create(['sku' => 'LOW-1', 'name' => 'Low', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);

        app(StockNotificationService::class)->alert($item);

        Notification::assertSentTo($recipient, StockAlertNotification::class);
        $this->assertDatabaseHas('stock_alert_logs', ['stock_item_id' => $item->id]);
    }

    public function test_alert_dedupes_same_day_and_clears_when_normal(): void
    {
        Notification::fake();
        $this->userWithPerm('stock.module');
        $item = StockItem::create(['sku' => 'D-1', 'name' => 'D', 'unit' => 'unit', 'min_stock' => 5, 'max_stock' => 50, 'current_stock' => 0]);
        $svc = app(StockNotificationService::class);

        $svc->alert($item);
        $svc->alert($item); // same day → no duplicate ledger row
        $this->assertSame(1, StockAlertLog::where('stock_item_id', $item->id)->count());

        $item->update(['current_stock' => 20]); // back to normal
        $svc->alert($item);
        $this->assertSame(0, StockAlertLog::where('stock_item_id', $item->id)->count());
    }

    public function test_request_created_bells_approvers(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'RQ-1', 'name' => 'Rq', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        $req = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 2, 'reason' => 'r', 'status' => 'pending']);

        app(StockNotificationService::class)->requestCreated($req);

        Notification::assertSentTo($approver, StockRequestNotification::class);
        Notification::assertNotSentTo($owner, StockRequestNotification::class);
    }

    public function test_request_responded_bells_only_the_owner(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'RS-1', 'name' => 'Rs', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        $req = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => 'approved']);

        app(StockNotificationService::class)->requestResponded($req, 'approved');

        Notification::assertSentTo($owner, StockRequestNotification::class);
        Notification::assertNotSentTo($approver, StockRequestNotification::class);
    }

    public function test_request_waiting_bells_approvers(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'WT-1', 'name' => 'Wt', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        $req = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);

        app(StockNotificationService::class)->requestWaiting($req);

        Notification::assertSentTo($approver, StockRequestNotification::class);
    }

    public function test_count_draft_is_bell_only_to_view_count_holders(): void
    {
        Notification::fake();
        $counter = $this->userWithPerm('stock.view_count');
        $count = StockCount::create([
            'reference' => 'CNT-TEST-'.uniqid(),
            'status' => 'draft',
            'counted_by' => $counter->id,
        ]);

        app(StockNotificationService::class)->countDraft($count);

        Notification::assertSentTo($counter, StockCountDraftNotification::class);
    }
}
