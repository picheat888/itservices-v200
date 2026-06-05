<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockCount;
use App\Models\StockItem;
use App\Models\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
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
}
