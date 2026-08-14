<?php

namespace App\Console\Commands;

use App\Services\Request\RequestStalledService;
use Illuminate\Console\Command;

/** Weekly sweep: one mail per approver listing the requests they have left waiting. */
class SendRequestStalledDigest extends Command
{
    protected $signature = 'requests:send-stalled-digest';

    protected $description = 'Mail each approver a summary of the requests still waiting on them';

    public function handle(RequestStalledService $service): int
    {
        $sent = $service->digest();
        $this->info("Stalled request digest — recipients: {$sent['recipients']}, requests listed: {$sent['requests']}");

        return self::SUCCESS;
    }
}
