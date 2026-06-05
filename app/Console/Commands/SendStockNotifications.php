<?php

namespace App\Console\Commands;

use App\Services\StockNotificationService;
use Illuminate\Console\Command;

/** Daily Stock sweep: re-fires alerts, the waiting-request nag, and draft-count reminders. */
class SendStockNotifications extends Command
{
    protected $signature = 'stock:send-notifications';

    protected $description = 'Send Stock bell/email notifications for alerts, waiting requests, and draft counts';

    public function handle(StockNotificationService $service): int
    {
        $r = $service->run();
        $this->info("Stock notifications — alerts: {$r['alerts']}, waiting: {$r['waiting']}, drafts: {$r['drafts']}");

        return self::SUCCESS;
    }
}
