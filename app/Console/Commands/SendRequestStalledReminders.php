<?php

namespace App\Console\Commands;

use App\Services\Request\RequestStalledService;
use Illuminate\Console\Command;

/** Daily sweep: bell the approver holding a step that has been waiting too long. */
class SendRequestStalledReminders extends Command
{
    protected $signature = 'requests:send-stalled-reminders';

    protected $description = 'Bell the approvers holding requests that have waited too long';

    public function handle(RequestStalledService $service): int
    {
        $sent = $service->nudge();
        $this->info("Stalled request reminders — approvers: {$sent['approvers']}, IT queue: {$sent['queue']}");

        return self::SUCCESS;
    }
}
