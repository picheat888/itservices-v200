<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
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

    /** แถวกฎหนึ่งแถว เขียนสั้น ๆ เพราะเทสต์ชุดนี้สร้างมันเยอะ */
    private function rule(SlaScope $scope, string $value, int $hours): SlaTarget
    {
        $target = SlaTarget::create([
            'scope' => $scope->value,
            'match_value' => $value,
            'resolve_hours' => $hours,
            'enabled' => true,
        ]);
        TicketSla::flush();

        return $target;
    }

    /** เคสที่มีคำขอผูกอยู่ แบบเดียวกับเคสที่เปิดอัตโนมัติจากคำขอ */
    private function ticketFromRequest(string $type, array $overrides = []): Ticket
    {
        $ticket = Ticket::factory()->create($overrides);
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Test', 'status' => 'active']);
        ServiceRequest::create([
            'reference' => 'RQ-2026-'.fake()->unique()->numberBetween(1000, 9999),
            'type' => $type,
            'origin' => 'direct',
            'user_id' => User::factory()->create(['role' => 'super', 'employee_id' => $employee->id])->id,
            'requester_name' => 'Somebody',
            'title' => 'A thing was requested',
            'reason' => 'Because the old one stopped working.',
            'ticket_id' => $ticket->id,
        ]);

        return $ticket->fresh();
    }

    public function test_a_work_class_rule_beats_the_priority_target(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create([
            'priority' => TicketPriority::Critical,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(240, $target['hours']);
        $this->assertSame(SlaScope::WorkClass, $target['scope']);
        $this->assertSame('repair_internal', $target['value']);
    }

    public function test_a_work_class_rule_beats_a_request_type_rule(): void
    {
        // ประเภทคำขอถูกเลือกโดยคนกรอกฟอร์มก่อนมีใครไปดูของจริง ลักษณะงานถูกเลือกโดยคนที่เห็นงานแล้ว
        // ข้อมูลที่ใหม่กว่าและแม่นกว่าต้องชนะ
        $this->rule(SlaScope::WorkClass, 'repair_vendor', 360);
        $this->rule(SlaScope::RequestType, 'hardware', 72);
        $ticket = $this->ticketFromRequest('hardware', ['work_class' => TicketWorkClass::RepairVendor]);

        $this->assertSame(360, TicketSla::targetFor($ticket)['hours']);
    }

    public function test_standard_work_matches_no_rule_even_when_a_row_exists_for_it(): void
    {
        // นี่คือคุณสมบัติที่ทำให้ work_class ชนะลำดับบนสุดได้อย่างปลอดภัย
        $this->rule(SlaScope::WorkClass, 'standard', 999);
        $this->rule(SlaScope::RequestType, 'hardware', 72);
        $ticket = $this->ticketFromRequest('hardware');

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(72, $target['hours']);
        $this->assertSame(SlaScope::RequestType, $target['scope']);
    }

    public function test_a_disabled_work_class_rule_is_skipped(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240)->update(['enabled' => false]);
        TicketSla::flush();
        $ticket = Ticket::factory()->create([
            'priority' => TicketPriority::High,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);

        $this->assertSame(TicketSla::resolveHours('high'), TicketSla::targetFor($ticket)['hours']);
    }

    public function test_a_target_reports_the_clock_it_is_counted_on(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['work_class' => TicketWorkClass::RepairInternal]);

        // ยังไม่มีใครตั้งเป็น calendar — default ของแถวคือ business
        $this->assertSame(TicketSlaClock::Business, TicketSla::targetFor($ticket)['clock']);
    }
}
