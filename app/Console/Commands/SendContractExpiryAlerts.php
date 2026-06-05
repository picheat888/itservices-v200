<?php

namespace App\Console\Commands;

use App\Services\ContractExpiryAlertService;
use Illuminate\Console\Command;

/**
 * Daily job that fires contract expiry alerts. Thin wrapper around
 * ContractExpiryAlertService::run(); scheduled in routes/console.php.
 */
class SendContractExpiryAlerts extends Command
{
    protected $signature = 'contracts:send-expiry-alerts {--force : Re-fire today\'s in-app bell even if already sent (testing)}';

    protected $description = 'Send expiry alerts for contracts crossing a reminder threshold';

    public function handle(ContractExpiryAlertService $service): int
    {
        $count = $service->run((bool) $this->option('force'));
        $this->info("Contract expiry alerts sent: {$count}");

        return self::SUCCESS;
    }
}
