<?php

// A stock-level alert that fails after the movement is saved is logged, never turned into a 500 for a saved movement.

namespace Tests\Feature;

use App\Models\Stock\StockAlertLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\User;
use App\Services\Stock\StockNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use RuntimeException;
use Tests\TestCase;

class StockAlertFailureTest extends TestCase
{
    use RefreshDatabase;

    private function lowItem(): StockItem
    {
        return StockItem::create(['sku' => 'SKU-ALR-1', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 10, 'max_stock' => 50]);
    }

    public function test_a_receive_whose_alert_fails_is_still_a_201_and_the_failure_is_reported(): void
    {
        Exceptions::fake();
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $item = $this->lowItem();
        StockAlertLog::saving(fn () => throw new RuntimeException('alert down'));

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2])->assertCreated();

        $this->assertSame(1, StockMovement::where('stock_item_id', $item->id)->count());
        $this->assertSame(2, $item->fresh()->current_stock);
        Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'alert down');
    }

    public function test_the_alert_itself_reports_instead_of_throwing(): void
    {
        Exceptions::fake();
        $item = $this->lowItem();
        StockAlertLog::saving(fn () => throw new RuntimeException('alert down'));

        app(StockNotificationService::class)->alert($item);

        Exceptions::assertReported(RuntimeException::class);
    }
}
