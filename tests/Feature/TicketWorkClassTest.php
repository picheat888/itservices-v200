<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketService;
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

    public function test_taking_a_case_does_not_shorten_a_work_class_deadline(): void
    {
        // "เดินสายใช้เวลา 30 วัน" ไม่ได้เลิกเป็นความจริงเพราะช่างที่กดรับติ๊กว่าด่วน
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['work_class' => TicketWorkClass::RepairInternal]);
        // ตั้งเดดไลน์เสมือนว่าบันทึกมันตั้งแต่สร้าง (สำหรับเทสต์: factory ไม่ทำเช่นนั้น service::create() ทำ)
        $ticket->update(['sla_resolve_due_at' => TicketSla::resolveDueAt($ticket)]);
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Test', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        app(TicketService::class)->take($ticket, $staff, TicketPriority::Critical, 'ดูให้', null);

        $this->assertTrue(
            $ticket->fresh()->sla_resolve_due_at->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, 240 * 60)),
        );
    }

    public function test_taking_an_ordinary_case_still_sets_the_deadline_from_priority(): void
    {
        $ticket = Ticket::factory()->create();
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Two', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        app(TicketService::class)->take($ticket, $staff, TicketPriority::Critical, 'ดูให้', null);

        $expected = TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours('critical') * 60);
        $this->assertTrue($ticket->fresh()->sla_resolve_due_at->equalTo($expected));
    }

    /** ช่างที่ถือเคสอยู่ พร้อมสิทธิ์จัดประเภท */
    private function assigneeOf(Ticket $ticket): User
    {
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Owner', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);
        $ticket->update(['assignee_id' => $staff->id, 'status' => TicketStatus::InProgress]);

        return $staff;
    }

    public function test_the_assignee_classifies_the_work_and_the_deadline_follows(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_vendor', 360);
        $ticket = Ticket::factory()->create(['priority' => TicketPriority::High]);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)
            ->patchJson("/api/tickets/{$ticket->id}/work-class", [
                'work_class' => 'repair_vendor',
                'reason' => 'สายเมนหลักขาด ต้องให้ผู้รับเหมาเดินใหม่ทั้งชั้น',
            ])
            ->assertOk();

        $ticket->refresh();
        $this->assertSame(TicketWorkClass::RepairVendor, $ticket->work_class);
        $this->assertTrue(
            $ticket->sla_resolve_due_at->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, 360 * 60)),
        );
    }

    public function test_classifying_the_work_writes_a_note_on_the_timeline(): void
    {
        $ticket = Ticket::factory()->create();
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'repair_internal',
            'reason' => 'ต้องรื้อฝ้าเพื่อเดินสายใหม่ ช่างเราทำเองได้',
        ])->assertOk();

        $this->assertSame(1, $ticket->updates()->count());
        $this->assertStringContainsString('ต้องรื้อฝ้า', (string) $ticket->updates()->first()->body);
    }

    public function test_a_reason_is_required(): void
    {
        $ticket = Ticket::factory()->create();
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'repair_internal',
        ])->assertStatus(422);
    }

    public function test_somebody_without_the_permission_is_refused(): void
    {
        $ticket = Ticket::factory()->create();
        $staff = $this->assigneeOf($ticket);
        $staff->update(['role' => 'user']); // ไม่ใช่ super — ไม่มีคีย์นี้โดยค่าเริ่มต้น

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'repair_internal',
            'reason' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(403);
    }

    public function test_a_case_nobody_has_taken_cannot_be_classified(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create(); // ยัง Open ไม่มีคนรับ
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Free', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'repair_internal',
            'reason' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(422);
    }

    public function test_setting_the_class_back_to_standard_restores_the_priority_deadline(): void
    {
        // กดพลาดครั้งเดียวต้องไม่ติดถาวร
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create([
            'priority' => TicketPriority::High,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'standard',
            'reason' => 'จัดประเภทผิด เป็นแค่การตั้งค่า switch',
        ])->assertOk();

        $ticket->refresh();
        $this->assertSame(TicketWorkClass::Standard, $ticket->work_class);
        $expected = TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours('high') * 60);
        $this->assertTrue($ticket->sla_resolve_due_at->equalTo($expected));
    }
}
