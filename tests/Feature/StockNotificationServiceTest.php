<?php

namespace Tests\Feature;

use App\Models\Notification\NotificationTemplate;
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
use App\Support\NotificationCatalogue;
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
        $svc->alert($item); // same day โ’ no duplicate ledger row
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

    public function test_once_approved_the_approvers_waiting_bell_goes(): void
    {
        $approver = $this->userWithPerm('stock.approve');
        $issuer = $this->userWithPerm('stock.fulfill');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'WT-2', 'name' => 'Wt', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        $req = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);
        $service = app(StockNotificationService::class);

        $service->requestWaiting($req);
        $this->assertSame(1, $approver->notifications()->count());

        $req->update(['status' => 'approved']);
        $service->requestWaiting($req);

        $this->assertSame(0, $approver->notifications()->count());
        $this->assertSame(1, $issuer->notifications()->count());
    }

    /** A fresh non-super user holding every listed permission. */
    private function userWithPerms(array $permissions): User
    {
        $user = $this->userWithPerm(array_shift($permissions));
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    private function openRequest(User $owner, string $status): StockRequest
    {
        $item = StockItem::firstOrCreate(['sku' => 'AF-1'], ['name' => 'USB Keyboard Lite', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);

        return StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => $owner->name, 'qty' => 2, 'reason' => 'r', 'status' => $status]);
    }

    /** @return list<int> ids of the stock requests the user holds a waiting bell for */
    private function waitingBellsOf(User $user): array
    {
        return $user->notifications()->get()
            ->filter(fn ($row) => ($row->data['subtype'] ?? null) === 'waiting')
            ->map(fn ($row) => (int) $row->data['stock_request_id'])
            ->sort()->values()->all();
    }

    public function test_awaiting_fulfil_bells_every_issuer_except_the_approver(): void
    {
        Notification::fake();
        $approver = $this->userWithPerms(['stock.approve', 'stock.fulfill']);
        $issuer = $this->userWithPerm('stock.fulfill');
        $onlyApprover = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerm('stock.request');
        $bystander = $this->userWithPerm('stock.view');
        $req = $this->openRequest($owner, 'approved');

        app(StockNotificationService::class)->requestAwaitingFulfil($req, $approver);

        $isAwaiting = fn (StockRequestNotification $n, array $channels, object $to) => $n->toDatabase($to)['subtype'] === 'awaiting_fulfil';
        Notification::assertSentTo($issuer, StockRequestNotification::class, $isAwaiting);
        foreach ([$approver, $onlyApprover, $owner, $bystander] as $other) {
            Notification::assertNotSentTo($other, StockRequestNotification::class);
        }
    }

    public function test_a_requester_who_also_issues_hears_their_own_request_is_ready(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerms(['stock.request', 'stock.fulfill']);
        $req = $this->openRequest($owner, 'approved');

        app(StockNotificationService::class)->requestAwaitingFulfil($req, $approver);

        Notification::assertSentTo($owner, StockRequestNotification::class);
    }

    public function test_the_awaiting_fulfil_bell_carries_number_item_qty_and_requester(): void
    {
        Notification::fake();
        $issuer = $this->userWithPerm('stock.fulfill');
        $owner = $this->userWithPerm('stock.request');
        $req = $this->openRequest($owner, 'approved');

        app(StockNotificationService::class)->requestAwaitingFulfil($req, $this->userWithPerm('stock.approve'));

        Notification::assertSentTo($issuer, StockRequestNotification::class, function (StockRequestNotification $n) use ($issuer, $req, $owner) {
            $data = $n->toDatabase($issuer);

            return $data['subtype'] === 'awaiting_fulfil'
                && $data['reference'] === $req->reference
                && $data['name'] === 'USB Keyboard Lite'
                && $data['qty'] === 2
                && $data['requester_name'] === $owner->name
                && array_key_exists('requester_name_th', $data);
        });
    }

    public function test_the_awaiting_fulfil_bell_can_be_switched_off(): void
    {
        Notification::fake();
        NotificationTemplate::create(['key' => 'notif_stock_req_awaiting_fulfil', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false]);
        NotificationCatalogue::forgetSwitches();
        $this->userWithPerm('stock.fulfill');
        $req = $this->openRequest($this->userWithPerm('stock.request'), 'approved');

        app(StockNotificationService::class)->requestAwaitingFulfil($req, $this->userWithPerm('stock.approve'));
        NotificationCatalogue::forgetSwitches();

        Notification::assertNothingSent();
    }

    public function test_the_daily_reminder_sends_pending_to_approvers_and_approved_to_issuers(): void
    {
        $approver = $this->userWithPerm('stock.approve');
        $issuer = $this->userWithPerm('stock.fulfill');
        $owner = $this->userWithPerm('stock.request');
        $pending = $this->openRequest($owner, 'pending');
        $approved = $this->openRequest($owner, 'approved');

        app(StockNotificationService::class)->run();

        $this->assertSame([$pending->id], $this->waitingBellsOf($approver));
        $this->assertSame([$approved->id], $this->waitingBellsOf($issuer));
        $this->assertSame([], $this->waitingBellsOf($owner));
    }

    public function test_a_holder_of_both_keys_gets_one_daily_reminder_per_request(): void
    {
        $both = $this->userWithPerms(['stock.approve', 'stock.fulfill']);
        $owner = $this->userWithPerm('stock.request');
        $pending = $this->openRequest($owner, 'pending');
        $approved = $this->openRequest($owner, 'approved');

        $service = app(StockNotificationService::class);
        $service->run();
        $service->run();

        $this->assertSame([$pending->id, $approved->id], $this->waitingBellsOf($both));
    }

    public function test_receiving_over_max_fires_a_realtime_overstock_alert(): void
    {
        Notification::fake();
        $watcher = $this->userWithPerm('stock.module');
        $mover = $this->userWithPerm('stock.module');
        RolePermission::create(['role_id' => $mover->role_id, 'permission' => 'stock.receive', 'allowed' => true]);

        $item = StockItem::create(['sku' => 'OV-1', 'name' => 'Ov', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 10, 'current_stock' => 0]);

        // Receive 50 โ’ on-hand 50 > max 10 โ’ overstock โ’ realtime alert to module holders.
        $this->actingAs($mover)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 50,
        ])->assertCreated();

        Notification::assertSentTo($watcher, StockAlertNotification::class);
    }

    public function test_workflow_actions_fire_request_notifications(): void
    {
        Notification::fake();
        $approver = $this->userWithPerm('stock.approve');
        $owner = $this->userWithPerm('stock.request');
        $item = StockItem::create(['sku' => 'WF-1', 'name' => 'Wf', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 10]);

        // Owner submits โ’ approvers get a bell
        $res = $this->actingAs($owner)->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => 1, 'reason' => 'need']);
        $res->assertCreated();
        $reqId = $res->json('data.id');
        Notification::assertSentTo($approver, StockRequestNotification::class);

        // Approve โ’ owner gets a bell
        $this->actingAs($approver)->postJson("/api/stock-requests/{$reqId}/approve")->assertOk();
        Notification::assertSentTo($owner, StockRequestNotification::class);
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

        // The bell carries the count's document number (reference), not just its id,
        // so the dropdown can show "SC-2026-006" rather than "#15".
        Notification::assertSentTo($counter, StockCountDraftNotification::class, function ($notification) use ($counter, $count) {
            $data = $notification->toDatabase($counter);

            return $data['stock_count_id'] === $count->id && $data['reference'] === $count->reference;
        });
    }
}
