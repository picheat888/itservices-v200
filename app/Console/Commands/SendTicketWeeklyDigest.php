<?php

namespace App\Console\Commands;

use App\Services\Ticket\TicketDigestService;
use Illuminate\Console\Command;

/** Weekly sweep: one mail per IT staff listing the cases the team still has open. */
class SendTicketWeeklyDigest extends Command
{
    protected $signature = 'tickets:send-weekly-digest';

    protected $description = 'Mail the IT team a summary of cases not yet taken and not yet closed';

    public function handle(TicketDigestService $service): int
    {
        $sent = $service->send();
        $this->info("Weekly ticket digest — recipients: {$sent['recipients']}, cases listed: {$sent['tickets']}");

        return self::SUCCESS;
    }
}
