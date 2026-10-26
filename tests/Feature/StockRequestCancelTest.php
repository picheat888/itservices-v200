<?php

// Cancelling a stock request: who may cancel at each status, the stock an approved request releases, and the requester's bell.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Notifications\StockRequestNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class StockRequestCancelTest extends TestCase
{
    use RefreshDatabase;

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'cancel_'.uniqid(), 'name' => 'Cancel Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function requestBy(User $owner, string $status, int $qty = 3): StockRequest
    {
        $item = StockItem::create([
            'sku' => 'SK-CXL-'.fake()->unique()->numerify('###'),
            'name' => 'Cancel item',
            'unit' => 'unit',
            'cost' => 100,
            'current_stock' => 10,
            'min_stock' => 0,
            'max_stock' => 0,
            'warehouse' => 'WH-HQ',
        ]);

        return StockRequest::create([
            'stock_item_id' => $item->id,
            'user_id' => $owner->id,
            'requester_name' => $owner->name,
            'qty' => $qty,
            'reason' => 'Test',
            'status' => $status,
        ]);
    }

    public function test_requester_cancels_own_pending_request(): void
    {
        Notification::fake();
        $owner = $this->userWith(['stock.module', 'stock.request', 'stock.view_request']);
        $request = $this->requestBy($owner, 'pending');

        $this->actingAs($owner)->postJson("/api/stock-requests/{$request->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancelled_by', $owner->name)
            ->assertJsonPath('data.can_cancel', false);

        $this->assertNotNull($request->fresh()->cancelled_at);
        $this->assertTrue(AuditLog::where('action', 'Cancelled stock request')->exists());
        // Nobody else to tell when the requester cancels their own
        Notification::assertNothingSent();
    }

    public function test_requester_cannot_cancel_after_approval(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request', 'stock.view_request']);
        $request = $this->requestBy($owner, 'approved');

        $this->actingAs($owner)->postJson("/api/stock-requests/{$request->id}/cancel")->assertForbidden();
        $this->assertSame('approved', $request->fresh()->status);
    }

    public function test_someone_else_without_rights_cannot_cancel_a_pending_request(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request']);
        $other = $this->userWith(['stock.module', 'stock.request', 'stock.view_request']);
        $request = $this->requestBy($owner, 'pending');

        $this->actingAs($other)->postJson("/api/stock-requests/{$request->id}/cancel")->assertForbidden();
    }

    public function test_approver_cancels_pending_and_approved_and_the_requester_is_told(): void
    {
        Notification::fake();
        $owner = $this->userWith(['stock.module', 'stock.request']);
        $approver = $this->userWith(['stock.module', 'stock.view_request', 'stock.approve']);

        foreach (['pending', 'approved'] as $status) {
            $request = $this->requestBy($owner, $status);
            $this->actingAs($approver)->postJson("/api/stock-requests/{$request->id}/cancel")
                ->assertOk()
                ->assertJsonPath('data.status', 'cancelled')
                ->assertJsonPath('data.cancelled_by', $approver->name);
        }

        Notification::assertSentToTimes($owner, StockRequestNotification::class, 2);
    }

    public function test_fulfiller_cancels_approved_but_not_pending(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request']);
        $fulfiller = $this->userWith(['stock.module', 'stock.view_request', 'stock.fulfill']);

        $pending = $this->requestBy($owner, 'pending');
        $this->actingAs($fulfiller)->postJson("/api/stock-requests/{$pending->id}/cancel")->assertForbidden();

        $approved = $this->requestBy($owner, 'approved');
        $this->actingAs($fulfiller)->postJson("/api/stock-requests/{$approved->id}/cancel")->assertOk();
    }

    public function test_cancelling_an_approved_request_releases_its_reserved_stock(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request']);
        $approver = $this->userWith(['stock.module', 'stock.view_request', 'stock.approve']);
        $request = $this->requestBy($owner, 'approved', 4);
        $item = $request->item;
        $this->assertSame(6, $item->availableToRequest());

        $this->actingAs($approver)->postJson("/api/stock-requests/{$request->id}/cancel")->assertOk();

        $this->assertSame(10, $item->fresh()->availableToRequest());
        $this->assertSame(10, $item->fresh()->current_stock);
    }

    public function test_finished_requests_cannot_be_cancelled(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request']);
        $approver = $this->userWith(['stock.module', 'stock.view_request', 'stock.approve', 'stock.fulfill']);

        foreach (['fulfilled', 'rejected', 'cancelled'] as $status) {
            $request = $this->requestBy($owner, $status);
            $this->actingAs($approver)->postJson("/api/stock-requests/{$request->id}/cancel")
                ->assertStatus(422)
                ->assertJsonPath('message', 'request_not_cancellable');
            $this->assertSame($status, $request->fresh()->status);
        }
    }

    public function test_list_flags_what_the_reader_may_cancel_and_filters_cancelled(): void
    {
        $owner = $this->userWith(['stock.module', 'stock.request', 'stock.view_request']);
        $pending = $this->requestBy($owner, 'pending');
        $approved = $this->requestBy($owner, 'approved');
        $this->requestBy($owner, 'cancelled');

        $rows = collect($this->actingAs($owner)->getJson('/api/stock-requests')->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($rows[$pending->id]['can_cancel']);
        $this->assertFalse($rows[$approved->id]['can_cancel']);

        $this->actingAs($owner)->getJson('/api/stock-requests?status=cancelled')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'cancelled');
    }
}
