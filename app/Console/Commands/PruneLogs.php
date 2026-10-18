<?php

namespace App\Console\Commands;

use App\Services\Settings\LogFileRetentionService;
use App\Services\Settings\LogRetentionService;
use Illuminate\Console\Command;

/** Nightly retention sweep: empties old email bodies, deletes log rows and log files past their window. */
class PruneLogs extends Command
{
    protected $signature = 'logs:prune';

    protected $description = 'Apply the data-retention windows to email logs, audit logs, notifications, and log files';

    public function handle(LogRetentionService $service, LogFileRetentionService $files): int
    {
        $r = $service->run();
        $logFiles = $files->prune();
        $this->info(
            "Pruned — email bodies emptied: {$r['email_bodies']}, email logs: {$r['email_logs']}, ".
            "audit logs: {$r['audit_logs']}, notifications: {$r['notifications']}, log files: {$logFiles}"
        );

        return self::SUCCESS;
    }
}
