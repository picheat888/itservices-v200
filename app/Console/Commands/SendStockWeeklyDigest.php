<?php

namespace App\Console\Commands;

use App\Services\Stock\StockNotificationService;
use Illuminate\Console\Command;

/** Weekly sweep: one mail listing what is out, low or overstocked, and what is still waiting. */
class SendStockWeeklyDigest extends Command
{
    protected $signature = 'stock:send-weekly-digest';

    protected $description = 'Mail a weekly summary of stock alerts and waiting requests';

    public function handle(StockNotificationService $service): int
    {
        $sent = $service->weeklyDigest();
        $this->info("Weekly stock digest — alerts: {$sent['alerts']}, waiting: {$sent['waiting']}");

        return self::SUCCESS;
    }
}
