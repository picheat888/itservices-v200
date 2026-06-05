<?php

namespace Tests\Feature;

use App\Models\StockAlertLog;
use App\Models\StockItem;
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
}
