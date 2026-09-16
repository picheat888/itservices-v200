<?php

namespace App\Http\Resources\Ticket;

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
        if (self::showsDeskInternals($request)) {
            // 'sla', 'sla_target' และ work_class_forecast ด้านล่างเรียก TicketSla::targetFor()
            // หลายครั้งในคำขอเดียว ซึ่งอ่าน serviceRequest ทุกครั้งที่ยังไม่เจอ relation แคชไว้ —
            // โหลดล่วงหน้าที่นี่ที่เดียวกันคิวรีซ้ำ ไม่ได้แตะตรรกะการคำนวณเดดไลน์เลย
            $this->resource->loadMissing('serviceRequest');
        }

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
            // ลักษณะงาน: งานปกติ หรืองานซ่อมที่วัดด้วย KPI ของตัวเอง เห็นได้เท่าที่เห็น SLA
            'work_class' => $this->when(self::showsDeskInternals($request), fn () => $this->work_class?->value),
            // Where this case's resolution target came from, so a three-day deadline on an
            // urgent case can be read rather than argued about. scope null = the built-in
            // default, which is the one case where nobody chose the number.
            'sla_target' => $this->when(self::showsDeskInternals($request), fn () => $this->slaTarget()),
            // เดดไลน์ที่แต่ละลักษณะงาน (รวม standard) จะสร้างขึ้น ถ้าเคสนี้ถูกจัดประเภทเป็นแบบนั้น —
            // สิ่งที่ไดอะล็อกจัดประเภทโชว์ก่อนช่างยืนยัน ต้องเป็นตัวเลขจริง ไม่ใช่การเดา
            'work_class_forecast' => $this->when(self::showsDeskInternals($request), fn () => $this->workClassForecast()),
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
     * @return array{hours: int, scope: ?string, value: ?string, clock: string}
     */
    private function slaTarget(): array
    {
        $target = TicketSla::targetFor($this->resource);

        return [
            'hours' => $target['hours'],
            'scope' => $target['scope']?->value,
            'value' => $target['value'],
            // นาฬิกาที่เป้าหมายนี้นับด้วย — "240 ชั่วโมง" อ่านได้คนละแบบระหว่างเวลาทำการกับปฏิทิน
            'clock' => $target['clock']->value,
        ];
    }

    /**
     * เดดไลน์ที่จะเกิดขึ้นจริงสำหรับ**แต่ละ**ลักษณะงานที่เลือกได้ (รวม standard) ถ้าเคสนี้ถูกจัดประเภท
     * เป็นแบบนั้น ณ ตอนนี้ — คำนวณบนสำเนาชั่วคราวของ ticket ที่ไม่ถูกบันทึกลงฐานข้อมูล โดยตั้งค่า
     * work_class ในหน่วยความจำแล้วถาม TicketSla::targetFor()/resolveDueAt() ตัวเดียวกับที่ตัดสิน
     * เดดไลน์จริงตอนบันทึก — จงใจไม่คำนวณลำดับความสำคัญ (precedence) หรือเลขคณิตของนาฬิกาซ้ำที่นี่
     * เพราะนั่นคือจุดบกพร่องที่ Task 8 ต้องแก้ไปแล้วครั้งหนึ่ง
     *
     * ฟรอนต์เอนด์อ่านค่านี้ในไดอะล็อกจัดประเภท: ช่างไม่มีสิทธิ์ settings.sla จึงไม่มีทางคำนวณเองได้
     * ถูกต้อง และ sla_target ด้านบนรายงานได้แค่เป้าหมายที่ "ชนะ" อยู่ตอนนี้ ไม่ใช่ของทุกตัวเลือก
     *
     * @return list<array{work_class: string, hours: int, scope: ?string, value: ?string, clock: string, due_at: string}>
     */
    private function workClassForecast(): array
    {
        /** @var Ticket $ticket */
        $ticket = $this->resource;

        return array_map(function (TicketWorkClass $class) use ($ticket): array {
            $clone = clone $ticket;
            $clone->work_class = $class;
            $target = TicketSla::targetFor($clone);

            return [
                'work_class' => $class->value,
                'hours' => $target['hours'],
                'scope' => $target['scope']?->value,
                'value' => $target['value'],
                'clock' => $target['clock']->value,
                'due_at' => TicketSla::resolveDueAt($clone)->toIso8601String(),
            ];
        }, TicketWorkClass::cases());
    }
}
