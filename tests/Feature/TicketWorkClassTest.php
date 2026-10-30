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

/** ลักษณะงาน (work_class) และลำดับเป้าหมาย work_class → request_type → priority → defaults() */
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
        $ticket = Ticket::factory()->create(['category' => 'hardware']);

        $this->assertSame(TicketWorkClass::Standard, $ticket->work_class);
    }

    public function test_no_work_class_rules_means_every_deadline_is_unchanged(): void
    {
        // ไม่มีกฎ work_class สักข้อ — เป้าหมายต้องมาจาก priority เหมือนก่อนหน้านี้ทุกประการ
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'priority' => TicketPriority::High]);

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

    /** A repair target for one (category, work class) pair; fixtures pin the category. */
    private function workRule(string $category, string $workClass, int $hours): SlaTarget
    {
        return $this->rule(SlaScope::WorkClass, TicketSla::workClassKey($category, $workClass), $hours);
    }

    /** เคสที่มีคำขอผูกอยู่ แบบเดียวกับเคสที่เปิดอัตโนมัติจากคำขอ */
    private function ticketFromRequest(string $type, array $overrides = []): Ticket
    {
        // Category pinned: a repair rule matches the pair
        $ticket = Ticket::factory()->create($overrides + ['category' => 'hardware']);
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
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'priority' => TicketPriority::Critical,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(240, $target['hours']);
        $this->assertSame(SlaScope::WorkClass, $target['scope']);
        $this->assertSame(TicketSla::workClassKey('hardware', 'repair_internal'), $target['value']);
    }

    public function test_a_work_class_rule_beats_a_request_type_rule(): void
    {
        // ลักษณะงานที่ช่างเลือกหลังเห็นงานชนะประเภทคำขอ
        $this->workRule('hardware', 'repair_vendor', 360);
        $this->rule(SlaScope::RequestType, 'hardware', 72);
        $ticket = $this->ticketFromRequest('hardware', ['work_class' => TicketWorkClass::RepairVendor]);

        $this->assertSame(360, TicketSla::targetFor($ticket)['hours']);
    }

    public function test_standard_work_matches_no_rule_even_when_a_row_exists_for_it(): void
    {
        // นี่คือคุณสมบัติที่ทำให้ work_class ชนะลำดับบนสุดได้อย่างปลอดภัย
        $this->workRule('hardware', 'standard', 999);
        $this->rule(SlaScope::RequestType, 'hardware', 72);
        $ticket = $this->ticketFromRequest('hardware');

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(72, $target['hours']);
        $this->assertSame(SlaScope::RequestType, $target['scope']);
    }

    public function test_a_disabled_work_class_rule_is_skipped(): void
    {
        $this->workRule('hardware', 'repair_internal', 240)->update(['enabled' => false]);
        TicketSla::flush();
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'priority' => TicketPriority::High,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);

        $this->assertSame(TicketSla::resolveHours('high'), TicketSla::targetFor($ticket)['hours']);
    }

    public function test_a_target_reports_the_clock_it_is_counted_on(): void
    {
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'work_class' => TicketWorkClass::RepairInternal]);

        // ยังไม่มีใครตั้งเป็น calendar — default ของแถวคือ business
        $this->assertSame(TicketSlaClock::Business, TicketSla::targetFor($ticket)['clock']);
    }

    public function test_taking_a_case_does_not_shorten_a_work_class_deadline(): void
    {
        // "เดินสายใช้เวลา 30 วัน" ไม่ได้เลิกเป็นความจริงเพราะช่างที่กดรับติ๊กว่าด่วน
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'work_class' => TicketWorkClass::RepairInternal]);
        // ตั้งเดดไลน์แบบที่ service::create() ทำ (factory ไม่ทำ)
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
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
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
        $this->workRule('hardware', 'repair_vendor', 360);
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'priority' => TicketPriority::High]);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)
            ->postJson("/api/tickets/{$ticket->id}/updates", [
                'work_class' => 'repair_vendor',
                'body' => 'สายเมนหลักขาด ต้องให้ผู้รับเหมาเดินใหม่ทั้งชั้น',
            ])
            ->assertCreated();

        $ticket->refresh();
        $this->assertSame(TicketWorkClass::RepairVendor, $ticket->work_class);
        $this->assertTrue(
            $ticket->sla_resolve_due_at->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, 360 * 60)),
        );
        // Classifying is an audited action
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'Classified ticket work',
            'target' => "{$ticket->ticket_no} - standard → repair_vendor",
        ]);
    }

    public function test_classifying_the_work_writes_a_note_on_the_timeline(): void
    {
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_internal',
            'body' => 'ต้องรื้อฝ้าเพื่อเดินสายใหม่ ช่างเราทำเองได้',
        ])->assertCreated();

        $this->assertSame(1, $ticket->updates()->count());
        $this->assertStringContainsString('ต้องรื้อฝ้า', (string) $ticket->updates()->first()->body);
        // The same words as the page's work-type picker
        $this->assertStringContainsString('Standard work → In-house technician', (string) $ticket->updates()->first()->body);
    }

    public function test_a_reason_is_required(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_internal',
        ])->assertStatus(422);
    }

    public function test_somebody_without_the_permission_is_refused(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->assigneeOf($ticket);
        $staff->update(['role' => 'user']); // ไม่ใช่ super — ไม่มีคีย์นี้โดยค่าเริ่มต้น

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_internal',
            'body' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(403);
    }

    /** เคสที่ยังไม่มีใครรับ ไม่มี assignee ให้เทียบเลย — คนที่ไม่ใช่เจ้าของถูกปฏิเสธที่ประตูนี้ก่อน */
    public function test_a_case_that_is_not_yours_cannot_be_classified(): void
    {
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware']); // ยัง Open ไม่มีคนรับ
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Free', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_internal',
            'body' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(403);
    }

    /** ผู้ทดสอบเป็น assignee ที่มีสิทธิ์ครบ 422 จึงมาจากสถานะเท่านั้น */
    public function test_a_closed_case_cannot_be_classified(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->assigneeOf($ticket);
        $ticket->update(['status' => TicketStatus::Completed]);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_internal',
            'body' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(422);
    }

    public function test_setting_the_class_back_to_standard_restores_the_priority_deadline(): void
    {
        // กดพลาดครั้งเดียวต้องไม่ติดถาวร
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'priority' => TicketPriority::High,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'standard',
            'body' => 'จัดประเภทผิด เป็นแค่การตั้งค่า switch',
        ])->assertCreated();

        $ticket->refresh();
        $this->assertSame(TicketWorkClass::Standard, $ticket->work_class);
        $expected = TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours('high') * 60);
        $this->assertTrue($ticket->sla_resolve_due_at->equalTo($expected));
    }

    /** บัญชี IT staff ที่ไม่ผูกกับเคสไหน ต่างจาก assigneeOf() ที่ตั้งเคสเป็น in-progress */
    private function itStaff(): User
    {
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Viewer', 'status' => 'active']);

        return User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);
    }

    public function test_the_standard_sla_figure_leaves_repair_cases_out(): void
    {
        $this->workRule('hardware', 'repair_internal', 240);
        $staff = $this->itStaff();

        // งานปกติที่ปิดทันเวลา เทียบกับเดดไลน์ที่คำนวณสด ไม่ใช่คอลัมน์ที่เก็บไว้
        $standard = Ticket::factory()->create(['category' => 'hardware',
            'status' => TicketStatus::Completed,
            'priority' => TicketPriority::Low,
            'created_at' => now()->subDays(20),
        ]);
        $standardDue = TicketSla::resolveDueAt($standard);
        $standard->update(['resolved_at' => $standardDue->copy()->subHour()]);

        // งานซ่อมที่ปิดช้ากว่าเดดไลน์ 240 ชั่วโมงของมันเอง — ต้องไม่ไปฉุด SLA ของงานปกติ
        $repair = Ticket::factory()->create(['category' => 'hardware',
            'status' => TicketStatus::Completed,
            'work_class' => TicketWorkClass::RepairInternal,
            'created_at' => now()->subDays(50),
        ]);
        $repairDue = TicketSla::resolveDueAt($repair);
        $repair->update(['resolved_at' => $repairDue->copy()->addHour()]);

        $body = $this->actingAs($staff)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->assertSame(100, $body['sla_met_pct']);
        $this->assertSame(0, $body['repair_kpi_met_pct']);
    }

    public function test_the_repair_figure_is_null_when_no_repair_case_has_closed(): void
    {
        $staff = $this->itStaff();

        $body = $this->actingAs($staff)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->assertNull($body['repair_kpi_met_pct']);
    }

    /** The dialog's predicted deadline equals what classifying actually produces. */
    public function test_the_forecast_deadline_for_a_class_matches_what_classifying_it_actually_produces(): void
    {
        $this->workRule('hardware', 'repair_vendor', 360);
        // Days back, so a clock started at now() could not pass by accident
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'priority' => TicketPriority::High, 'created_at' => now()->subDays(5)]);
        $staff = $this->assigneeOf($ticket);

        $before = $this->actingAs($staff)->getJson("/api/tickets/{$ticket->id}")->assertOk()->json('data');
        $forecast = collect($before['work_class_forecast'])->firstWhere('work_class', 'repair_vendor');
        $this->assertNotNull($forecast);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_vendor',
            'body' => 'ส่ง vendor เดินสายใหม่ทั้งชั้น',
        ])->assertCreated();

        $ticket->refresh();
        $this->assertSame($ticket->sla_resolve_due_at->toIso8601String(), $forecast['due_at']);
    }

    /** A repair class with no configured rule falls through to priority. */
    public function test_the_forecast_leaves_out_a_repair_class_with_no_rule_for_this_type(): void
    {
        // A class with no priced pair for this kind of case is not offered
        $this->workRule('network', 'repair_vendor', 720);
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'priority' => TicketPriority::Medium]);
        $staff = $this->assigneeOf($ticket);

        $body = $this->actingAs($staff)->getJson("/api/tickets/{$ticket->id}")->assertOk()->json('data');
        $offered = collect($body['work_class_forecast'])->pluck('work_class')->all();

        // The network rule prices repair_vendor for network cases, not for this hardware one.
        $this->assertSame(['standard'], $offered);
    }

    public function test_a_class_priced_for_another_ticket_type_is_refused(): void
    {
        // Same pair, wrong half: the rule exists, but not for this kind of case.
        $this->workRule('network', 'repair_vendor', 720);
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'work_class' => 'repair_vendor',
            'body' => 'ส่งศูนย์เปลี่ยนเมนบอร์ด',
        ])->assertStatus(422);

        $this->assertSame(TicketWorkClass::Standard, $ticket->fresh()->work_class);
    }

    /** Reverting to standard is a supported action, so it must always be one of the options. */
    public function test_the_forecast_always_includes_standard_as_an_option(): void
    {
        $this->workRule('hardware', 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'priority' => TicketPriority::Low, 'work_class' => TicketWorkClass::RepairInternal]);
        $staff = $this->assigneeOf($ticket);

        $body = $this->actingAs($staff)->getJson("/api/tickets/{$ticket->id}")->assertOk()->json('data');
        $classes = collect($body['work_class_forecast'])->pluck('work_class');
        $this->assertTrue($classes->contains('standard'));

        $standard = collect($body['work_class_forecast'])->firstWhere('work_class', 'standard');
        $this->assertSame(TicketSla::resolveHours('low'), $standard['hours']);
    }

    /** The forecast is computed on the single-ticket read only, never for list rows. */
    public function test_the_forecast_is_left_out_of_the_list_response(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        $staff = $this->itStaff();

        $body = $this->actingAs($staff)->getJson('/api/tickets')->assertOk()->json();
        $row = collect($body['data'])->firstWhere('id', $ticket->id);

        $this->assertNotNull($row);
        $this->assertArrayNotHasKey('work_class_forecast', $row);
    }

    /** A canceled case has no SLA, so no forecast either. */
    public function test_the_forecast_is_null_for_a_canceled_case(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware', 'status' => TicketStatus::Canceled]);
        $staff = $this->itStaff();

        $body = $this->actingAs($staff)->getJson("/api/tickets/{$ticket->id}")->assertOk()->json('data');

        $this->assertArrayHasKey('work_class_forecast', $body);
        $this->assertNull($body['work_class_forecast']);
    }

    /** repair_backlog counts open repair work only (TicketSummaryService). */
    public function test_the_summary_counts_only_open_repair_cases_in_the_backlog(): void
    {
        $staff = $this->itStaff();

        // Open repair work — counted.
        Ticket::factory()->create(['category' => 'hardware',
            'status' => TicketStatus::Open,
            'work_class' => TicketWorkClass::RepairInternal,
        ]);
        // In-progress repair work — also counted.
        Ticket::factory()->create(['category' => 'hardware',
            'status' => TicketStatus::InProgress,
            'work_class' => TicketWorkClass::RepairVendor,
        ]);
        // Closed repair work — already resolved, must NOT count as backlog.
        Ticket::factory()->create(['category' => 'hardware',
            'status' => TicketStatus::Completed,
            'work_class' => TicketWorkClass::RepairInternal,
            'resolved_at' => now(),
        ]);
        // Open, but not repair — must not count either.
        Ticket::factory()->create(['category' => 'hardware', 'status' => TicketStatus::Open]);

        $body = $this->actingAs($staff)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->assertSame(2, $body['repair_backlog']);
    }

    public function test_the_summary_says_whether_repair_rules_exist_at_all(): void
    {
        // หน้าจอใช้ค่านี้ตัดสินว่าจะโชว์การ์ด KPI ไหม
        $staff = $this->itStaff();

        $before = $this->actingAs($staff)->getJson('/api/tickets/summary')->json();
        $this->assertFalse($before['has_repair_rules']);

        $this->workRule('hardware', 'repair_internal', 240);

        $after = $this->actingAs($staff)->getJson('/api/tickets/summary')->json();
        $this->assertTrue($after['has_repair_rules']);
    }

    public function test_a_request_born_case_cannot_be_classified(): void
    {
        // A request-born case is refused outright, not merely hidden on screen
        $this->workRule('hardware', 'repair_vendor', 360);
        $ticket = $this->ticketFromRequest('hardware');
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'body' => 'ส่งให้ผู้รับเหมาเดินสายใหม่',
            'work_class' => 'repair_vendor',
        ])->assertStatus(422);

        $this->assertSame(TicketWorkClass::Standard, $ticket->fresh()->work_class);
    }

    public function test_a_request_born_case_still_takes_an_ordinary_progress_note(): void
    {
        // Only the classification is refused; saying what is happening must still work.
        $ticket = $this->ticketFromRequest('hardware');
        $staff = $this->assigneeOf($ticket);

        $this->actingAs($staff)->postJson("/api/tickets/{$ticket->id}/updates", [
            'body' => 'ติดต่อผู้ขายแล้ว รออีเมลยืนยัน',
        ])->assertCreated();

        $this->assertSame(1, $ticket->updates()->count());
    }

    public function test_a_request_born_case_is_sent_no_work_class_forecast(): void
    {
        // Nothing on screen can use it, and computing it walks the SLA rules three times.
        $ticket = $this->ticketFromRequest('hardware');
        $staff = $this->assigneeOf($ticket);

        $body = $this->actingAs($staff)->getJson("/api/tickets/{$ticket->id}")->assertOk()->json();

        $this->assertNull($body['data']['work_class_forecast']);
    }
}
