<?php

use App\Models\StockItem;
use App\Services\StockBalanceService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Seed one balance row per existing item from its current_stock + home warehouse. */
    public function up(): void
    {
        $svc = app(StockBalanceService::class);
        StockItem::query()->chunkById(200, function ($items) use ($svc) {
            foreach ($items as $item) {
                $svc->rebuildFor($item);
            }
        });
    }

    public function down(): void
    {
        // Balances are dropped with the table migration; nothing to reverse here.
    }
};
