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
            // Left out of the payload rather than hidden on screen, so it is not in the JSON
            // either — see showsDeskInternals.
            'priority' => $this->when(self::showsDeskInternals($request), fn () => $this->priority?->value),
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
            'sla' => $this->when(self::showsDeskInternals($request), fn () => TicketSla::forTicket($this->resource)),
            // Where this case's resolution target came from, so a three-day deadline on an
            // urgent case can be read rather than argued about. scope null = the built-in
            // default, which is the one case where nobody chose the number.
            'sla_target' => $this->when(self::showsDeskInternals($request), fn () => $this->slaTarget()),
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

            // Progress notes, oldest first — only on the single-ticket read, since the list
            // has nowhere to show them and would pay for every row's timeline.
            'updates' => $this->whenLoaded('updates', fn () => $this->updates->map(fn ($u) => [
                'id' => $u->id,
                'author_name' => $u->author_name,
                'body' => $u->body,
                'created_at' => $u->created_at?->toIso8601String(),
            ])),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Whether this viewer is shown the desk's own view of a case: its priority and its SLA clocks.
     *
     * Both exist to run the queue — priority orders it, the clocks measure the team against its
     * targets — and neither is news for the person waiting, who chose neither and can act on
     * neither. A requester reading "overdue by 27 days" in red on their own ticket is being
     * shown the desk's report card, not an answer.
     *
     * The Take Case gate, and static so the Asset module's ticket rows ask the same question
     * and get the same answer — one rule, two callers.
     */
    public static function showsDeskInternals(Request $request): bool
    {
        return (bool) $request->user()?->hasPermission('tickets.resolve');
    }

    /**
     * @return array{hours: int, scope: ?string, value: ?string}
     */
    private function slaTarget(): array
    {
        $target = TicketSla::targetFor($this->resource);

        return [
            'hours' => $target['hours'],
            'scope' => $target['scope']?->value,
            'value' => $target['value'],
        ];
    }
}
