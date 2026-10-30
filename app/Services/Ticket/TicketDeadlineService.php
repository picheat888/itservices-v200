<?php

// Recomputes the stored SLA deadlines of open tickets after SLA targets or holidays change.

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;

class TicketDeadlineService
{
    /** Stored deadlines of open tickets follow the current targets; closed history stays frozen. Returns tickets changed. */
    public function recomputeOpen(): int
    {
        $changed = 0;

        Ticket::query()->with('serviceRequest')->whereIn('status', TicketStatus::liveValues())->chunkById(200, function ($tickets) use (&$changed) {
            foreach ($tickets as $ticket) {
                // Compute before timestamps=false, which also drops the created_at cast
                $dues = [
                    'sla_response' => TicketSla::responseDueAt($ticket),
                    'sla_resolve' => TicketSla::resolveDueAt($ticket),
                ];
                $changes = [];
                foreach ($dues as $clock => $due) {
                    if ($ticket->{"{$clock}_due_at"}?->timestamp === $due?->timestamp) {
                        continue;
                    }
                    // A moved deadline re-evaluates its own alert stage
                    $changes["{$clock}_due_at"] = $due;
                    $changes["{$clock}_alert_level"] = null;
                }
                if ($changes === []) {
                    continue;
                }
                $ticket->timestamps = false; // a recompute is not an edit, keep updated_at
                $ticket->forceFill($changes)->saveQuietly();
                $changed++;
            }
        });

        return $changed;
    }
}
