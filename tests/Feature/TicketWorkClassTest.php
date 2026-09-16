<?php

namespace Tests\Feature;

use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * งานซ่อมยาว (เดินสาย / ส่ง vendor) ไม่ควรถูกบันทึกว่าหลุด SLA ทั้งที่ไม่มีอะไรผิดพลาด
 *
 * `work_class` ตอบว่า "งานชิ้นนี้ยาวแค่ไหน" ซึ่งเป็นคนละคำถามกับ priority ("ด่วนแค่ไหน")
 * และคนละคำถามกับ request_type ("ขออะไร") เทสต์ชุดนี้ตรึงลำดับ
 * work_class → request_type → priority → defaults() และผลที่ตามมาจากลำดับนั้น
 */
class TicketWorkClassTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // กฎถูก memo ไว้ต่อ process และเทสต์ที่ roll back แล้วทิ้ง memo ค้างไว้
        TicketSla::flush();
    }

    public function test_every_ticket_starts_as_standard_work(): void
    {
        $ticket = Ticket::factory()->create();

        $this->assertSame(TicketWorkClass::Standard, $ticket->work_class);
    }

    public function test_no_work_class_rules_means_every_deadline_is_unchanged(): void
    {
        // ไม่มีกฎ work_class สักข้อ — เป้าหมายต้องมาจาก priority เหมือนก่อนหน้านี้ทุกประการ
        $ticket = Ticket::factory()->create(['priority' => TicketPriority::High]);

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(TicketSla::resolveHours('high'), $target['hours']);
    }
}
