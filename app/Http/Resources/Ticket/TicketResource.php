<?php

namespace App\Http\Resources\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
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
        // Always loaded so 'from_request' is present for every reader (TicketListService eager-loads it)
        $this->resource->loadMissing('serviceRequest');

        return [
            'id' => $this->id,
            'ticket_no' => $this->ticket_no,
            'subject' => $this->subject,
            'description' => $this->description,
            'category' => $this->category?->value,
            // Left out of the JSON, not just hidden on screen
            'priority' => $this->when(self::showsDeskInternals($request), fn () => $this->priority?->value),
            'status' => $this->status?->value,

            // Source request reference, or null when reported directly; not a desk internal
            'from_request' => $this->whenLoaded('serviceRequest', fn () => $this->serviceRequest?->reference),

            'requester_id' => $this->requester_id,
            'requester_code' => $this->whenLoaded('requester', fn () => $this->requester?->code),
            'requester_name' => $this->whenLoaded('requester', fn () => $this->requester?->name),
            'requester_name_th' => $this->whenLoaded('requester', fn () => $this->requester?->name_th),

            'assignee_id' => $this->assignee_id,
            'assignee_name' => $this->whenLoaded('assignee', fn () => $this->assignee?->name),
            'assignee_name_th' => $this->whenLoaded('assignee', fn () => $this->assignee?->name_th),

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
            // ลักษณะงาน เปิดให้ผู้แจ้งเห็น ไม่อยู่หลัง showsDeskInternals
            'work_class' => $this->work_class?->value,
            // Where the resolution target came from; scope null = the built-in default
            'sla_target' => $this->when(self::showsDeskInternals($request), fn () => $this->slaTarget()),
            // เดดไลน์ของแต่ละลักษณะงาน คำนวณเฉพาะหน้ารายละเอียด (มี updates) ไม่ทำทุกแถว
            'work_class_forecast' => $this->when(
                self::showsDeskInternals($request) && $this->resource->relationLoaded('updates'),
                fn () => $this->workClassForecast(),
            ),
            // When the desk expects to finish; the requester's own question, so not gated
            'expected_at' => $this->expectedAt(),
            'responded_at' => $this->responded_at?->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),

            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->original_name,
                'size' => $a->size,
                'mime' => $a->mime,
                'url' => $a->url(),
                'created_at' => $a->created_at?->toIso8601String(),
                // Mirrored files all come from the case's one request
                'from_request' => $a->isMirrored() ? $this->serviceRequest?->reference : null,
            ])),

            // Progress notes, oldest first, on the single-ticket read only
            'updates' => $this->whenLoaded('updates', fn () => $this->updates->map(fn ($u) => [
                'id' => $u->id,
                'author_name' => $u->author_name,
                'author_name_th' => $u->relationLoaded('author') ? $u->author?->name_th : null,
                // 'note' (typed) or an event the SPA words itself from `meta` ('forwarded').
                'kind' => $u->kind ?? 'note',
                'meta' => $u->meta,
                'body' => $u->body,
                'created_at' => $u->created_at?->toIso8601String(),
            ])),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** Whether this viewer sees the desk's view of a case (priority, SLA clocks); shared with the Asset module. */
    public static function showsDeskInternals(Request $request): bool
    {
        return (bool) $request->user()?->hasPermission('tickets.resolve');
    }

    /**
     * @return array{hours: int, scope: ?string, value: ?string, clock: string}
     */
    private function slaTarget(): array
    {
        return self::targetPayload(TicketSla::targetFor($this->resource));
    }

    /** วันที่คาดว่าจะเสร็จ null เมื่อเคสปิดแล้วหรือยังไม่มีใครรับ */
    private function expectedAt(): ?string
    {
        /** @var Ticket $ticket */
        $ticket = $this->resource;

        if ($ticket->created_at === null || $ticket->responded_at === null) {
            return null;
        }
        if (in_array($ticket->status, [TicketStatus::Completed, TicketStatus::Canceled], true)) {
            return null;
        }

        return TicketSla::resolveDueAt($ticket)->toIso8601String();
    }

    /**
     * One target as the SPA reads it; a work-class key goes out as the class half only.
     *
     * @param  array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}  $target
     * @return array{hours: int, scope: ?string, value: ?string, clock: string}
     */
    private static function targetPayload(array $target): array
    {
        $value = $target['value'];

        return [
            'hours' => $target['hours'],
            'scope' => $target['scope']?->value,
            'value' => $value !== null && $target['scope'] === SlaScope::WorkClass
                ? TicketSla::workClassFromKey($value)
                : $value,
            // เวลาทำการหรือปฏิทิน
            'clock' => $target['clock']->value,
        ];
    }

    /**
     * เดดไลน์ของแต่ละลักษณะงานที่เลือกได้ คำนวณบนสำเนาด้วย TicketSla ตัวเดียวกับตอนบันทึก
     *
     * @return list<array{work_class: string, hours: int, scope: ?string, value: ?string, clock: string, due_at: string}>|null
     */
    private function workClassForecast(): ?array
    {
        /** @var Ticket $ticket */
        $ticket = $this->resource;

        if ($ticket->status === TicketStatus::Canceled || $ticket->created_at === null) {
            return null;
        }

        // A request-born case cannot be classified
        if ($ticket->serviceRequest !== null) {
            return null;
        }

        // Standard plus only the repair classes priced for this category
        $rules = TicketSla::rules()[SlaScope::WorkClass->value] ?? [];
        $offered = array_values(array_filter(
            TicketWorkClass::cases(),
            fn (TicketWorkClass $class) => ! $class->isRepair()
                || ($ticket->category !== null
                    && isset($rules[TicketSla::workClassKey($ticket->category->value, $class->value)])),
        ));

        return array_map(function (TicketWorkClass $class) use ($ticket): array {
            $clone = clone $ticket;
            $clone->work_class = $class;

            return [
                'work_class' => $class->value,
                ...self::targetPayload(TicketSla::targetFor($clone)),
                'due_at' => TicketSla::resolveDueAt($clone)->toIso8601String(),
            ];
        }, $offered);
    }
}
