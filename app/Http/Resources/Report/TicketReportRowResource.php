<?php

namespace App\Http\Resources\Report;

use App\Models\Ticket\Ticket;
use App\Services\Report\TicketMetrics;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of the "Ticket & SLA overview" report table.
 *
 * @mixin Ticket
 */
class TicketReportRowResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'ticket_no' => $this->ticket_no,
            'subject' => $this->subject,
            'requester_name' => $this->requester?->name,
            'department_name' => $this->requester?->department?->name,
            'department_name_th' => $this->requester?->department?->name_th,
            'category' => $this->category?->value,
            'priority' => $this->priority?->value,
            'status' => $this->status?->value,
            'assignee_name' => $this->assignee?->name,
            'created_at' => SystemTime::dateTime($this->created_at),
            'resolved_at' => SystemTime::dateTime($this->resolved_at),
            'resolve_hours' => TicketMetrics::resolveHours($this->resource),
            'sla' => TicketMetrics::slaState($this->resource, now()),
        ];
    }
}
