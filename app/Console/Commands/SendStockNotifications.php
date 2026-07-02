<?php

namespace App\Console\Commands;

use App\Services\Stock\StockNotificationService;
use Illuminate\Console\Command;

/** Daily Stock sweep: re-fires alerts, the waiting-request nag, and draft-count reminders. */
class SendStockNotifications extends Command
{
    protected $signature = 'stock:send-notifications {--force : Reset the per-day alert dedup so every alert re-fires (testing)}';

    protected $description = 'Send Stock bell/email notifications for alerts, waiting requests, and draft counts';

    public function handle(StockNotificationService $service): int
    {
        $r = $service->run((bool) $this->option('force'));
        $this->info("Stock notifications — alerts: {$r['alerts']}, waiting: {$r['waiting']}, drafts: {$r['drafts']}");

        return self::SUCCESS;
    }
}
