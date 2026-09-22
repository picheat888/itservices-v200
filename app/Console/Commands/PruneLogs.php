<?php

namespace App\Console\Commands;

use App\Services\Settings\LogRetentionService;
use Illuminate\Console\Command;

/** Nightly retention sweep: empties old email bodies and deletes logs past their window. */
class PruneLogs extends Command
{
    protected $signature = 'logs:prune';

    protected $description = 'Apply the data-retention windows to email logs, audit logs, and notifications';

    public function handle(LogRetentionService $service): int
    {
        $r = $service->run();
        $this->info(
            "Pruned — email bodies emptied: {$r['email_bodies']}, email logs: {$r['email_logs']}, ".
            "audit logs: {$r['audit_logs']}, notifications: {$r['notifications']}"
        );

        return self::SUCCESS;
    }
}
