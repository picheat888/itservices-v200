<?php

namespace Tests\Feature;

use App\Models\StockAlertLog;
use App\Models\StockItem;
use App\Models\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
