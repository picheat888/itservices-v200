<?php

namespace App\Console\Commands;

use App\Services\Ticket\TicketSlaAlertService;
use Illuminate\Console\Command;

/** Frequent sweep: bell (+ breach email) alerts for tickets nearing or past their SLA. */
class SendTicketSlaAlerts extends Command
{
    protected $signature = 'tickets:send-sla-alerts';

    protected $description = 'Send SLA at-risk / breached alerts for active tickets';

    public function handle(TicketSlaAlertService $service): int
    {
        $r = $service->run();
        $this->info("Ticket SLA alerts — at risk: {$r['at_risk']}, breached: {$r['breached']}");

        return self::SUCCESS;
    }
}
