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
        // เฉพาะ single-ticket read (show / storeUpdate ฯลฯ) เท่านั้นที่ยังไม่ได้ eager-load
        // serviceRequest มาก่อน — TicketController::index() โหลดไว้แล้วในคิวรีหลัก
        // (->with([..., 'serviceRequest'])) ดังนั้นบรรทัดนี้ "no-op" กับหน้ารายการ ไม่มีผลอะไรที่นั่น
        //
        // โหลดให้ทุกคนไม่ใช่เฉพาะฝั่งเดสก์ เพราะ 'from_request' ด้านล่างต้องตอบได้เสมอว่าเคสนี้
        // มาจากคำขอไหม — whenLoaded() จะตัดคีย์ทิ้งถ้า relation ไม่ถูกโหลด ทำให้ "ไม่ได้มาจากคำขอ"
        // กับ "ไม่ได้โหลดมา" หน้าตาเหมือนกัน ซึ่งเป็นความกำกวมแบบที่เคยทำให้ไดอะล็อกโกหกมาแล้ว
        $this->resource->loadMissing('serviceRequest');

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

            // The reference of the request this case was opened from, or null when somebody
            // reported it directly. Not gated: which of the two a case is decides whether the
            // Take dialog asks for a priority at all, and the requester reading their own case
            // is being told where it came from, not shown the desk's own view of it.
            'from_request' => $this->whenLoaded('serviceRequest', fn () => $this->serviceRequest?->reference),

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
            // ลักษณะงาน — ไม่ได้อยู่หลังประตู showsDeskInternals เหมือนฟิลด์รอบ ๆ
            //
            // priority กับนาฬิกา SLA เป็นเครื่องมือบริหารคิวและใบประเมินของทีม คนที่รอไม่ได้เลือก
            // และทำอะไรกับมันไม่ได้ แต่ "เครื่องถูกส่งไปที่ช่างภายนอกแล้ว" เป็นที่อยู่ของงาน
            // ไม่ใช่คะแนน มันคือคำอธิบายว่าทำไมเคสถึงใช้เวลาเป็นสัปดาห์ และเป็นเรื่องของเจ้าของเคส
            // โดยตรง เก็บไว้ก็มีแต่ทำให้ความเงียบดูเหมือนไม่มีใครทำอะไร
            'work_class' => $this->work_class?->value,
            // Where this case's resolution target came from, so a three-day deadline on an
            // urgent case can be read rather than argued about. scope null = the built-in
            // default, which is the one case where nobody chose the number.
            'sla_target' => $this->when(self::showsDeskInternals($request), fn () => $this->slaTarget()),
            // เดดไลน์ที่แต่ละลักษณะงาน (รวม standard) จะสร้างขึ้น ถ้าเคสนี้ถูกจัดประเภทเป็นแบบนั้น —
            // สิ่งที่ไดอะล็อกจัดประเภทโชว์ก่อนช่างยืนยัน ต้องเป็นตัวเลขจริง ไม่ใช่การเดา
            //
            // คำนวณเฉพาะ single-ticket read เท่านั้น (relationLoaded('updates') คือสัญญาณเดียวกับที่
            // ฟิลด์ 'updates' ด้านล่างใช้อยู่แล้ว) เพราะแต่ละตัวเลือกเรียก targetFor() + resolveDueAt()
            // เต็มรูปแบบ (เดินนาฬิกาทำการทีละหน้าต่าง ไม่ใช่แค่ lookup อาเรย์เหมือน sla_target) — คิด
            // เป็นหลักพัน Carbon step ต่อหนึ่งตัวเลือกสำหรับเป้าหมายงานซ่อมหลักสิบวัน หน้ารายการไม่มีที่
            // แสดงมันเลยสักบรรทัด จึงไม่ต้องจ่ายราคานั้นให้ทุกแถว
            'work_class_forecast' => $this->when(
                self::showsDeskInternals($request) && $this->resource->relationLoaded('updates'),
                fn () => $this->workClassForecast(),
            ),
            // The one date from the SLA machinery the person waiting is entitled to: when the
            // desk expects to be finished. NOT gated behind showsDeskInternals — "when will my
            // case be done" is the requester's own question, and it is the only part of the
            // block above that answers it rather than scoring the team.
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
        return self::targetPayload(TicketSla::targetFor($this->resource));
    }

    /**
     * เมื่อไรที่คาดว่าเคสนี้จะเสร็จ — null เมื่อยังตอบไม่ได้หรือไม่ต้องตอบแล้ว
     *
     * - เคสที่ปิดหรือยกเลิกไปแล้ว: เสร็จจริงไปแล้ว วันที่จริงอยู่บนไทม์ไลน์ การคาดการณ์ไม่มีความหมายอีก
     * - เคสที่ยังไม่มีใครรับ: นาฬิกาปิดเคสยังไม่เริ่มเดิน (ดู TicketSla::resolveStart) วันที่ที่เก็บไว้
     *   เป็นค่าชั่วคราวที่จะขยับทันทีที่มีคนกดรับ การบอกวันที่ที่กำลังจะผิดกับคนที่รออยู่ แย่กว่า
     *   การบอกว่ายังไม่รู้
     */
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
     * รูปแบบเดียวที่ frontend อ่านเป้าหมายหนึ่งอัน — ใช้ทั้ง sla_target และทุกแถวของ forecast
     *
     * แถวของลักษณะงานถูกคีย์เป็นคู่ ("network:repair_vendor") ตรงนี้จึงคืนเฉพาะครึ่งที่บอกว่า
     * ใครเป็นคนทำ ประเภท Ticket อีกครึ่งอยู่บนตัว ticket เองอยู่แล้ว ถ้าส่งคีย์ดิบออกไป ฝั่ง
     * frontend จะต้องรู้จักรูปแบบคีย์ภายในเพื่อจะแปลชื่อ แล้ววันที่มันแปลไม่ออกมันก็จะพิมพ์
     * คีย์ดิบลงหน้าจอแทนที่จะพัง — บั๊กที่เงียบกว่าการ error
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
     * null เมื่อ SLA ไม่ใช้กับเคสนี้เลย (เคสที่ยกเลิก หรือยังไม่มี created_at) — เงื่อนไขเดียวกับที่
     * TicketSla::forTicket() ใช้คืน null สำหรับฟิลด์ 'sla' ด้านบน เพราะ resolveDueAt() รับ Carbon
     * ที่ไม่ nullable และจะ error ถ้าไม่กันไว้ก่อน ไม่ใช่แค่ "ไม่มีกฎ" แต่ "ไม่มีเดดไลน์ให้พยากรณ์เลย"
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

        // A case opened from a request cannot be classified at all, so there is no control for
        // this to feed — and working it out means three targetFor() walks and a resolveDueAt()
        // per class on every detail read of a case that can never use them.
        if ($ticket->serviceRequest !== null) {
            return null;
        }

        // Only what an administrator has actually priced for THIS kind of case, plus Standard.
        //
        // A repair target belongs to a pair — the ticket's category and who does the work — so
        // "send it to an external technician" is a different length of job on a network case
        // than on a hardware one. Offering a class with no rule for this category would let a
        // technician pick an option that silently falls back to the priority target, which is
        // the short deadline this whole feature exists to stop such cases from breaching.
        // Standard is always offered: reverting a misclassification must never be impossible.
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
