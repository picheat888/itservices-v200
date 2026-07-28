<?php

namespace App\Http\Resources\Ticket;

use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Ticket */
class TicketResource extends JsonResource
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
            'description' => $this->description,
            'category' => $this->category?->value,
            'priority' => $this->priority?->value,
            'status' => $this->status?->value,

            'requester_id' => $this->requester_id,
            'requester_code' => $this->whenLoaded('requester', fn () => $this->requester?->code),
            'requester_name' => $this->whenLoaded('requester', fn () => $this->requester?->name),

            'assignee_id' => $this->assignee_id,
            'assignee_name' => $this->whenLoaded('assignee', fn () => $this->assignee?->name),

            'callback_phone' => $this->callback_phone,

            'related_asset_id' => $this->related_asset_id,
            'related_asset_tag' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->asset_code),
            'related_asset_tag_name' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->tag),
            'related_asset_type' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->category?->name),
            'related_asset_type_th' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->category?->name_th),
            'related_asset_brand' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->brand?->name),
            'related_asset_model' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->model?->name),
            'related_asset_serial' => $this->whenLoaded('relatedAsset', fn () => $this->relatedAsset?->serial),

            'take_note' => $this->take_note,
            'resolution' => $this->resolution,
            // Both SLA clocks + the state of whichever clock currently matters (null for canceled).
            'sla' => TicketSla::forTicket($this->resource),
            'responded_at' => $this->responded_at?->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),

            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->original_name,
                'size' => $a->size,
                'mime' => $a->mime,
                'url' => $a->url(),
                'created_at' => $a->created_at?->toIso8601String(),
            ])),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
