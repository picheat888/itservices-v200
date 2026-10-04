<?php

namespace App\Console\Commands;

use App\Services\Ticket\TicketSlaAlertService;
use Illuminate\Console\Command;

/** Frequent sweep: bell (+ breach email) alerts for tickets nearing or past their SLA. */
class SendTicketSlaAlerts extends Command
{
    protected $signature = 'tickets:send-sla-alerts';

    protected $description = 'Send SLA near-due / over-SLA alerts for active tickets';

    public function handle(TicketSlaAlertService $service): int
    {
        $r = $service->run();
        $this->info("Ticket SLA alerts — near due: {$r['near_due']}, over SLA: {$r['over_sla']}");

        return self::SUCCESS;
    }
}
