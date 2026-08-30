<?php

namespace App\Console\Commands;

use App\Services\Contract\ContractDigestService;
use Illuminate\Console\Command;

/** Weekly sweep: one mail listing every contract expiring or already overdue. */
class SendContractWeeklyDigest extends Command
{
    protected $signature = 'contracts:send-weekly-digest';

    protected $description = 'Mail a summary of contracts that are expiring or overdue';

    public function handle(ContractDigestService $service): int
    {
        $sent = $service->send();
        $this->info("Weekly contract digest — recipients: {$sent['recipients']}, expiring: {$sent['expiring']}, overdue: {$sent['overdue']}");

        return self::SUCCESS;
    }
}
