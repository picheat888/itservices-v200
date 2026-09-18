<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "ซ่อมให้เสร็จใน 30 วัน" ที่องค์กรประกาศไว้ ไม่ได้แปลว่า 30 วันทำการเสมอไป
 *
 * นาฬิกาจึงเป็นค่าต่อแถวกฎ ไม่ใช่ค่าที่ฝังในโค้ด ผู้ดูแลระบบเป็นคนตอบว่า 30 วันของ
 * องค์กรตัวเองนับยังไง เทสต์ชุดนี้ตรึงว่าเดดไลน์กับ % ความคืบหน้าใช้นาฬิกาเรือนเดียวกัน
 * ซึ่งถ้าหลุด (นับความคืบหน้าด้วยเวลาทำการ แต่เดดไลน์เป็นปฏิทิน) แถบจะรายงานต่ำกว่าจริง
 * เช่น ผ่านไป 15 วันจาก 30 วันปฏิทิน (ควรราวครึ่งทาง) จะเหลือแค่ราว 12% — เคสใกล้หมดเวลา
 * แต่แถบบอกว่ายังสบาย
 */
class TicketSlaClockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** A calendar-clock repair target for the (hardware, $workClass) pair these tests use. */
    private function calendarRule(string $workClass, int $hours): void
    {
        SlaTarget::create([
            'scope' => SlaScope::WorkClass->value,
            'match_value' => TicketSla::workClassKey('hardware', $workClass),
            'resolve_hours' => $hours,
            'clock' => TicketSlaClock::Calendar->value,
            'enabled' => true,
        ]);
        TicketSla::flush();
    }

    public function test_calendar_minutes_run_straight_through_nights_and_weekends(): void
    {
        // ศุกร์ 16:00 + 720 ชม. ปฏิทิน = 30 วันต่อมาเป๊ะ ไม่สนใจหน้าต่างเวลาทำการ
        $from = Carbon::parse('2026-10-02 16:00:00');

        $due = TicketSla::addMinutesOn($from, 720 * 60, TicketSlaClock::Calendar);

        $this->assertSame('2026-11-01 16:00:00', $due->format('Y-m-d H:i:s'));
    }

    public function test_business_minutes_still_behave_exactly_as_before(): void
    {
        $from = Carbon::parse('2026-10-02 16:00:00');

        $this->assertTrue(
            TicketSla::addMinutesOn($from, 4 * 60, TicketSlaClock::Business)
                ->equalTo(TicketSla::addBusinessMinutes($from, 4 * 60)),
        );
    }

    public function test_a_calendar_rule_gives_the_ticket_a_calendar_deadline(): void
    {
        $this->calendarRule('repair_vendor', 1080); // 45 วันปฏิทิน
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'work_class' => TicketWorkClass::RepairVendor,
            'created_at' => Carbon::parse('2026-10-02 16:00:00'),
        ]);

        $due = TicketSla::resolveDueAt($ticket);

        $this->assertSame('2026-11-16 16:00:00', $due->format('Y-m-d H:i:s'));
    }

    public function test_progress_percent_is_measured_on_the_same_clock_as_the_deadline(): void
    {
        $this->calendarRule('repair_internal', 720); // 30 วันปฏิทิน
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'work_class' => TicketWorkClass::RepairInternal,
            'priority' => TicketPriority::Medium,
            'status' => TicketStatus::InProgress,
            'responded_at' => now()->subDays(15),
            'created_at' => now()->subDays(15),
        ]);

        $sla = TicketSla::forTicket($ticket);

        // 15 วันจาก 30 วันปฏิทิน = ราวครึ่งทาง ถ้าเผลอนับด้วยเวลาทำการจะตกไปเหลือราว 12
        // (นับเฉพาะชั่วโมงทำการ) แถบเลยรายงานว่าเคสยังสบายทั้งที่ใกล้หมดเวลาจริง
        $this->assertNotNull($sla);
        $this->assertGreaterThanOrEqual(45, $sla['pct_elapsed']);
        $this->assertLessThanOrEqual(55, $sla['pct_elapsed']);
        $this->assertSame('on_track', $sla['state']);
    }

    public function test_the_response_clock_stays_on_business_time_even_under_a_calendar_rule(): void
    {
        // เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ ไม่ได้ผูกกับแถวกฎ จึงไม่มีเหตุให้เปลี่ยนนาฬิกา
        $this->calendarRule('repair_internal', 720);
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'work_class' => TicketWorkClass::RepairInternal,
            'created_at' => Carbon::parse('2026-10-02 16:00:00'),
        ]);

        $this->assertTrue(
            TicketSla::responseDueAt($ticket)
                ->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::responseMinutes())),
        );
    }

    /**
     * responseDueAt() is hardcoded to addBusinessMinutes() — it could never read the wrong
     * clock, so the test above can never go red from a clock-selection bug. The branch that CAN
     * break is forTicket()'s elapsed-minutes selector (TicketSla.php ~441-445):
     * `$responseActive ? TicketSlaClock::Business : $clock`. If that ever collapsed to plain
     * `$clock`, an open, untaken case under a calendar work_class rule would have its response
     * progress bar measured in calendar minutes instead of business minutes — a case that just
     * missed a long weekend would read as almost breached when barely any business time passed.
     */
    public function test_response_progress_is_measured_in_business_minutes_even_under_a_calendar_rule(): void
    {
        $this->calendarRule('repair_internal', 720); // 30 วันปฏิทิน — $clock ของเคสนี้คือ calendar
        // ศุกร์ 16:00 → เหลือเวลาทำการอีก 60 นาทีก่อนเลิกงาน
        $ticket = Ticket::factory()->create(['category' => 'hardware',
            'work_class' => TicketWorkClass::RepairInternal,
            'status' => TicketStatus::Open,
            'responded_at' => null, // ยังไม่มีใครรับ — นาฬิกาที่กำลังเดินคือนาฬิกาตอบรับ
            'created_at' => Carbon::parse('2026-10-02 16:00:00'),
        ]);
        // จันทร์ 08:30 — เวลาทำการที่ผ่านไปจริง: 60 นาที (ศุกร์ 16:00-17:00) + 30 นาที (จันทร์ 08:00-08:30) = 90
        // ส่วนเวลาปฏิทินที่ผ่านไปคือ 2 วันครึ่งกว่า (3,870 นาที) — มากกว่าเป้าหมายตอบรับ (120 นาที) จนล้น 100%
        Carbon::setTestNow(Carbon::parse('2026-10-05 08:30:00'));

        $sla = TicketSla::forTicket($ticket);

        $this->assertNotNull($sla);
        // 90 จาก 120 นาทีเป้าหมายตอบรับ = 75% พอดี ถ้านับด้วยนาฬิกาปฏิทินแทน จะได้ 100% (ล้น) และ state
        // จะกลายเป็น at_risk ทั้งที่ยังไม่ถึงเดดไลน์ตอบรับด้วยซ้ำ (จันทร์ 09:00)
        $this->assertSame(75, $sla['pct_elapsed']);
        $this->assertSame('on_track', $sla['state']);
    }
}
