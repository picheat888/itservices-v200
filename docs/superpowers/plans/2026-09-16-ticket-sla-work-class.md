# Ticket SLA `work_class` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เคสซ่อม hardware / เดินสาย วิ่งบนเป้าหมาย 30 วัน (ช่างในองค์กร) / 45 วัน (vendor) ได้ โดยเคส Network ทั่วไปยังอยู่บนนาฬิกา SLA ตาม priority เหมือนเดิม

**Architecture:** เพิ่ม scope ที่สามชื่อ `work_class` ให้กับตาราง `sla_targets` ที่มีอยู่แล้ว โดยคีย์จาก *ลักษณะงาน* แทน *ความเร่งด่วน* (priority) หรือ *สิ่งที่ขอ* (request_type) · ค่าเริ่มต้น `standard` ไม่ match กฎไหนเลย ทำให้ scope นี้ชนะลำดับบนสุดได้อย่างปลอดภัย · แต่ละแถวกฎเลือกโหมดนาฬิกาได้เอง (`business` = เวลาทำการเหมือนเดิม / `calendar` = 24/7) ซึ่งเป็นคำตอบของ "30 วันคือวันทำการหรือวันปฏิทิน" · ตัวเลขสรุปแยกเป็น SLA งานปกติ กับ KPI งานซ่อม

**Tech Stack:** Laravel 12 · PHP 8.2 · PHPUnit 11 · React 19 + TypeScript · Tailwind 4 · React Query · MariaDB

**Spec:** `docs/superpowers/specs/2026-09-16-ticket-sla-work-class-design.md`

## Global Constraints

- **ลำดับ scope ตายตัว:** `work_class` → `request_type` → `priority` → `defaults()` — ไม่มี UI ให้ลาก
- **Migration ห้ามขยับเดดไลน์ของเคสใดเลย** — `tickets.work_class` default `'standard'`, `sla_targets.clock` default `'business'` · Task 1 มีเทสต์ parity เป็นด่านแรก
- **นาฬิกาตอบรับ (response) ใช้ `business` เสมอ** — เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ (`ticket_sla_response`) ไม่ผูกกับแถวกฎ
- **เดดไลน์คิดจาก `created_at` เสมอ** — ไม่ใช่จากเวลาที่จัดประเภท
- **ข้อความ UI ทุกตัวผ่าน `useT()`** คีย์อยู่ที่ `resources/js/lang/{en,th}/*.ts` — ห้าม hardcode string
- **`lang/**` comment ได้แค่ที่อยู่ของกลุ่มคีย์** รูปแบบ `// <ไฟล์> — <ส่วนไหนของ UI>` · ห้าม comment ราย key · `en/` กับ `th/` ต้องมี comment กลุ่มเดียวกัน เรียงเหมือนกัน
- **ห้าม inline style** — Tailwind class เท่านั้น (ยกเว้น `style={{ color: meta.color }}` ที่เป็น pattern เดิมของ REQUEST_TYPE_META)
- **import ข้ามโมดูลผ่าน barrel `@/modules/<x>` เท่านั้น**
- **รัน `vendor/bin/pint --dirty --format agent` ก่อน commit ทุกครั้งที่แตะไฟล์ PHP**
- **เพดาน validate เดิมคงไว้:** 1–8760 ชม. (360 ชม. อยู่ในเพดานสบาย ๆ ไม่ต้องขยาย)

## File Structure

**สร้างใหม่ (PHP)**
- `app/Enums/Ticket/TicketWorkClass.php` — 3 ค่า + label()
- `app/Enums/Ticket/TicketSlaClock.php` — 2 ค่า
- `database/migrations/2026_09_16_100000_give_long_repairs_a_clock_of_their_own.php`
- `tests/Feature/TicketWorkClassTest.php`
- `tests/Feature/TicketSlaClockTest.php`

**สร้างใหม่ (TS)**
- `resources/js/modules/settings/components/tickets-sla-tab.tsx` — ย้าย `TicketsTab` ออกจาก `pages/index.tsx` (2,099 บรรทัด) แล้วเพิ่มลิสต์ที่สามในนั้น
- `resources/js/modules/ticket/components/ticket-work-class-modal.tsx` — clone จาก `ticket-update-modal.tsx` (91 บรรทัด)

**แก้ไข (PHP)**
- `app/Enums/Ticket/SlaScope.php` — `case WorkClass` + `precedence()`
- `app/Support/TicketSla.php` — `rules()` โครงใหม่ · `targetFor()` คืน clock · นาฬิกาสองโหมด
- `app/Support/Permissions.php` — `tickets.set_work_class`
- `app/Models/Ticket/Ticket.php` — fillable + cast
- `app/Models/Settings/SlaTarget.php` — fillable + cast
- `app/Services/Ticket/TicketService.php` — `deadlineAfterPriority()` guard · `setWorkClass()`
- `app/Http/Controllers/Api/Ticket/TicketController.php` — `updateWorkClass()` · `summary()` แยกสองตัวเลข
- `app/Http/Controllers/Api/Settings/SettingsController.php` — `ticket_sla_work_class` + clock
- `app/Http/Resources/Ticket/TicketResource.php` — `work_class` + `sla_target.clock`
- `routes/api.php` — route ใหม่

**แก้ไข (TS)**
- `resources/js/modules/permission/lib/permission-labels.ts` — LIVE set
- `resources/js/modules/permission/components/ticket-permission-tree.tsx` — children ของ `view_all`
- `resources/js/modules/settings/pages/index.tsx` — เอา `TicketsTab` ออก import จากไฟล์ใหม่
- `resources/js/modules/ticket/components/ticket-detail-drawer.tsx` — ปุ่ม + modal
- `resources/js/modules/ticket/pages/index.tsx` — badge + KPI card
- `resources/js/modules/ticket/api/ticketApi.ts` + `hooks/use-tickets.ts`
- `resources/js/shared/types/index.ts` — `work_class`, `sla_target.clock`, summary keys
- `resources/js/lang/{en,th}/{ticket,settings,permission}.ts`

---

## Task 1: Enums, migration, และเทสต์ parity

เป้าหมายของ task นี้คือ **โครงข้อมูลพร้อม แต่ยังไม่มีอะไรเปลี่ยนพฤติกรรม** — เทสต์ parity คือหลักฐาน

**Files:**
- Create: `app/Enums/Ticket/TicketWorkClass.php`
- Create: `app/Enums/Ticket/TicketSlaClock.php`
- Create: `database/migrations/2026_09_16_100000_give_long_repairs_a_clock_of_their_own.php`
- Modify: `app/Models/Ticket/Ticket.php` (`$fillable` ~บรรทัด 33–39, `casts()` ~บรรทัด 42–52)
- Modify: `app/Models/Settings/SlaTarget.php` (`$fillable` บรรทัด 16, `casts()` บรรทัด 18–25)
- Test: `tests/Feature/TicketWorkClassTest.php`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces:
  - `App\Enums\Ticket\TicketWorkClass` — `Standard = 'standard'`, `RepairInternal = 'repair_internal'`, `RepairVendor = 'repair_vendor'`; method `label(): string`, `isRepair(): bool`, static `repairValues(): list<string>`
  - `App\Enums\Ticket\TicketSlaClock` — `Business = 'business'`, `Calendar = 'calendar'`
  - `Ticket->work_class` cast เป็น `TicketWorkClass`
  - `SlaTarget->clock` cast เป็น `TicketSlaClock`

- [ ] **Step 1: เขียนเทสต์ parity ที่ต้องเขียวตลอดทั้งงาน**

สร้าง `tests/Feature/TicketWorkClassTest.php`:

```php
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
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: FAIL — `test_every_ticket_starts_as_standard_work` ล้มเพราะยังไม่มีคอลัมน์ `work_class`

- [ ] **Step 3: สร้าง enum `TicketWorkClass`**

`app/Enums/Ticket/TicketWorkClass.php`:

```php
<?php

namespace App\Enums\Ticket;

/**
 * ลักษณะของงานบนเคส — ตอบว่า "งานชิ้นนี้ยาวแค่ไหน"
 *
 * คนละคำถามกับ TicketPriority ("ด่วนแค่ไหน" ซึ่งคนกดรับเป็นคนตอบ) และคนละคำถามกับ
 * RequestType ("ขออะไร" ซึ่งคนกรอกฟอร์มตอบก่อนมีใครไปดูของจริง) เคส Network หนึ่งใบ
 * อาจเป็นการตั้งค่า VPN ที่จบใน 2 ชั่วโมง หรือเป็นการเดินสายใหม่ทั้งชั้นที่ใช้เวลาเป็นเดือน
 * และตัวเลขเดียวไม่มีทางพูดแทนทั้งสองอย่างได้
 *
 * Standard เป็นค่าเริ่มต้นของทุกเคส และตั้งใจให้ "ไม่ match กฎไหนเลย" — นั่นคือสิ่งที่ทำให้
 * scope นี้ชนะลำดับบนสุดได้อย่างปลอดภัย: มันมีผลเฉพาะตอนที่มีคนตั้งใจจัดประเภทจริง ๆ
 */
enum TicketWorkClass: string
{
    case Standard = 'standard';
    case RepairInternal = 'repair_internal';
    case RepairVendor = 'repair_vendor';

    /** ป้ายภาษาอังกฤษ สำหรับที่ที่เรนเดอร์นอก SPA เช่นอีเมล */
    public function label(): string
    {
        return match ($this) {
            self::Standard => 'Standard work',
            self::RepairInternal => 'Repair (in-house)',
            self::RepairVendor => 'Repair (vendor)',
        };
    }

    /** งานซ่อมยาวที่วัดด้วย KPI ของตัวเอง ไม่ใช่ SLA ของงานปกติ */
    public function isRepair(): bool
    {
        return $this !== self::Standard;
    }

    /**
     * ค่าของงานซ่อมทั้งหมด เป็นสตริง สำหรับ query builder ที่เทียบกับคอลัมน์ตรง ๆ
     *
     * @return list<string>
     */
    public static function repairValues(): array
    {
        return array_map(
            fn (self $class) => $class->value,
            array_filter(self::cases(), fn (self $class) => $class->isRepair()),
        );
    }
}
```

- [ ] **Step 4: สร้าง enum `TicketSlaClock`**

`app/Enums/Ticket/TicketSlaClock.php`:

```php
<?php

namespace App\Enums\Ticket;

/**
 * นาฬิกาที่แถวกฎ SLA หนึ่งแถวนับด้วย
 *
 * Business คือพฤติกรรมเดิมของทั้งระบบ — นับเฉพาะเวลาทำการตาม TicketSla::hours()
 * Calendar นับเวลาจริง 24/7 ซึ่งจำเป็นเพราะ KPI อย่าง "ซ่อมให้เสร็จใน 30 วัน" ที่องค์กร
 * ประกาศไว้ ไม่ได้หมายถึง 30 วันทำการเสมอไป และการเดาแทนผู้ดูแลระบบคือการตอบคำถามที่
 * ไม่ใช่คำถามของโค้ด
 */
enum TicketSlaClock: string
{
    case Business = 'business';
    case Calendar = 'calendar';
}
```

- [ ] **Step 5: สร้าง migration**

```
php artisan make:migration give_long_repairs_a_clock_of_their_own --no-interaction
```

เปลี่ยนชื่อไฟล์ที่ได้เป็น `2026_09_16_100000_give_long_repairs_a_clock_of_their_own.php` แล้วเขียน:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * สองคอลัมน์ที่ทำให้งานซ่อมยาวมีที่ยืนใน SLA
 *
 * ทั้งคู่มี default ที่เท่ากับพฤติกรรมเดิมเป๊ะ — ทุกเคสที่มีอยู่เป็นงานปกติ และทุกแถวกฎ
 * ที่มีอยู่นับด้วยเวลาทำการ การรัน migration นี้จึงไม่ขยับเดดไลน์ของเคสใดเลย
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            // NOT NULL default 'standard': "ไม่มีค่า" กับ "เป็นงานปกติ" คือเรื่องเดียวกัน
            // และสองวิธีเขียนเรื่องเดียวกันคือจุดที่มันเริ่มไม่ตรงกัน
            $table->string('work_class', 32)->default('standard')->after('priority');
        });

        Schema::table('sla_targets', function (Blueprint $table) {
            $table->string('clock', 16)->default('business')->after('resolve_hours');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('work_class');
        });

        Schema::table('sla_targets', function (Blueprint $table) {
            $table->dropColumn('clock');
        });
    }
};
```

- [ ] **Step 6: ต่อ enum เข้ากับโมเดล**

ใน `app/Models/Ticket/Ticket.php` เพิ่ม import `use App\Enums\Ticket\TicketWorkClass;` แล้ว:

`$fillable` — เพิ่ม `'work_class'` ต่อจาก `'priority'`:
```php
        'category', 'priority', 'work_class', 'status',
```

`casts()` — เพิ่มบรรทัด:
```php
            'work_class' => TicketWorkClass::class,
```

ใน `app/Models/Settings/SlaTarget.php` เพิ่ม import `use App\Enums\Ticket\TicketSlaClock;` แล้ว:

```php
    protected $fillable = ['scope', 'match_value', 'resolve_hours', 'clock', 'enabled'];

    protected function casts(): array
    {
        return [
            'scope' => SlaScope::class,
            'resolve_hours' => 'integer',
            'clock' => TicketSlaClock::class,
            'enabled' => 'boolean',
        ];
    }
```

- [ ] **Step 7: รัน migration แล้วรันเทสต์ให้เขียว**

```
php artisan migrate --no-interaction
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: PASS ทั้งสองตัว

- [ ] **Step 8: รันทั้ง suite ยืนยันว่าไม่มีอะไรพัง**

```
php artisan test --compact
```

Expected: ทุกตัวเขียว (baseline ปัจจุบัน 1,210 passed) — นี่คือ**เทสต์ parity ตัวจริง**: เคสเดิมทุกใบยังได้เดดไลน์เท่าเดิม

- [ ] **Step 9: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Enums/Ticket/TicketWorkClass.php app/Enums/Ticket/TicketSlaClock.php database/migrations/2026_09_16_100000_give_long_repairs_a_clock_of_their_own.php app/Models/Ticket/Ticket.php app/Models/Settings/SlaTarget.php tests/Feature/TicketWorkClassTest.php
git commit -m "feat(sla): give a ticket somewhere to say how long the work is"
```

---

## Task 2: `SlaScope::WorkClass` และลำดับใหม่

**Files:**
- Modify: `app/Enums/Ticket/SlaScope.php`
- Modify: `app/Support/TicketSla.php` (`rules()` ~บรรทัด 196–213, `targets()` ~บรรทัด 57–72, `targetFor()` ~บรรทัด 161–190)
- Test: `tests/Feature/TicketWorkClassTest.php` (เพิ่ม)

**Interfaces:**
- Consumes: `TicketWorkClass`, `TicketSlaClock` จาก Task 1
- Produces:
  - `SlaScope::WorkClass = 'work_class'`; `SlaScope::precedence(): list<self>` = `[WorkClass, RequestType, Priority]`
  - `TicketSla::rules(): array<string, array<string, array{hours: int, clock: TicketSlaClock}>>` — **โครงเปลี่ยนจากเดิมที่เป็น `=> int`**
  - `TicketSla::targetFor(Ticket): array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

เพิ่มใน `tests/Feature/TicketWorkClassTest.php` (เพิ่ม import `SlaScope`, `SlaTarget`, `ServiceRequest`, `Employee`, `User`, `TicketSlaClock`):

```php
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
        $this->rule(SlaScope::RequestType, 'equipment', 72);
        $ticket = $this->ticketFromRequest('equipment', ['work_class' => TicketWorkClass::RepairVendor]);

        $this->assertSame(360, TicketSla::targetFor($ticket)['hours']);
    }

    public function test_standard_work_matches_no_rule_even_when_a_row_exists_for_it(): void
    {
        // นี่คือคุณสมบัติที่ทำให้ work_class ชนะลำดับบนสุดได้อย่างปลอดภัย
        $this->rule(SlaScope::WorkClass, 'standard', 999);
        $this->rule(SlaScope::RequestType, 'equipment', 72);
        $ticket = $this->ticketFromRequest('equipment');

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
```

และ helper `ticketFromRequest()` (คัดลอกรูปเดียวกับ `SlaTargetTest`):

```php
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
```

> **หมายเหตุ:** ถ้า `ServiceRequest::create()` ต้องการคอลัมน์อื่นอีก ให้เปิด `tests/Feature/SlaTargetTest.php` บรรทัด 44–60 แล้วคัดลอกชุดฟิลด์จากตรงนั้นมาให้ตรง — เป็น helper เดียวกัน

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: FAIL — `SlaScope::WorkClass` ยังไม่มี (Error: undefined constant)

- [ ] **Step 3: เพิ่ม case และแก้ `precedence()`**

`app/Enums/Ticket/SlaScope.php` — เพิ่ม case และแก้ docblock ของ `precedence()`:

```php
enum SlaScope: string
{
    case WorkClass = 'work_class';
    case Priority = 'priority';
    case RequestType = 'request_type';

    /**
     * scope ไหนชนะเมื่อเคสเข้าหลายข้อ
     *
     * work_class มาก่อนเพราะมันถูกเลือกโดยคนที่เห็นงานแล้ว ส่วน request_type ถูกเลือกโดย
     * คนกรอกฟอร์มก่อนมีใครไปดูของจริง — ข้อมูลที่ใหม่กว่าและแม่นกว่าควรชนะ และมันปลอดภัย
     * เพราะค่าเริ่มต้น `standard` ไม่ match กฎไหนเลย work_class จึงชนะได้เฉพาะตอนที่มีคน
     * ตั้งใจจัดประเภทจริง ๆ
     *
     * request_type มาก่อน priority ด้วยเหตุผลตรงข้าม: เคสจากคำขอ**ถูกตั้ง priority เสมอ**
     * ตอนกดรับ ถ้าให้ priority ชนะ กฎประเภทคำขอจะไม่มีวันทำงานเลยสักครั้ง
     *
     * @return list<self>
     */
    public static function precedence(): array
    {
        return [self::WorkClass, self::RequestType, self::Priority];
    }
}
```

- [ ] **Step 4: เปลี่ยนโครง `rules()` ให้เก็บ clock**

`app/Support/TicketSla.php` — แทนที่ `rules()` ทั้งเมธอด:

```php
    /**
     * เป้าหมายทุกแถวที่เปิดอยู่ อ่านครั้งเดียวต่อ request
     *
     * หน้ารายการ ticket resolve SLA ทีละแถว และตารางนี้เล็กพอที่ query เดียวจะชนะ
     * การ query ต่อแถวในทุกแง่ที่ควรวัด
     *
     * @return array<string, array<string, array{hours: int, clock: TicketSlaClock}>>
     */
    public static function rules(): array
    {
        if (self::$rulesMemo !== null) {
            return self::$rulesMemo;
        }

        $rules = [];
        foreach (SlaTarget::where('enabled', true)->get() as $target) {
            $rules[$target->scope->value][$target->match_value] = [
                'hours' => $target->resolve_hours,
                'clock' => $target->clock,
            ];
        }

        return self::$rulesMemo = $rules;
    }
```

และแก้ docblock ของ `$rulesMemo` ให้ตรง:

```php
    /** memo ของกฎที่เปิดอยู่ต่อ request, เป็น [scope][match_value] => ['hours', 'clock'] */
    private static ?array $rulesMemo = null;
```

- [ ] **Step 5: แก้ call site ที่อ่าน `rules()` แบบโครงเดิม**

ใน `targets()` เปลี่ยนบรรทัดที่อ่านค่าจาก stored:

```php
        $targets = self::defaults();
        foreach ($targets as $priority => $default) {
            $targets[$priority] = ['resolve' => (int) ($stored[$priority]['hours'] ?? $default['resolve'])];
        }
```

- [ ] **Step 6: แก้ `targetFor()` ให้เดินตาม precedence ใหม่และคืน clock**

แทนที่ body ของ `targetFor()`:

```php
    /**
     * เป้าหมายปิดเคสของ ticket หนึ่งใบ เป็นชั่วโมง — คำตอบของ "ทำไมเดดไลน์เป็นวันนี้"
     *
     * ลักษณะงาน ชนะ ประเภทคำขอ ชนะ priority ชนะ ค่าเริ่มต้นในโค้ด (ดู SlaScope::precedence)
     *
     * @return array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}
     */
    public static function targetFor(Ticket $ticket): array
    {
        $rules = self::rules();
        // Builder::value() ใช้ cast ของโมเดล ทั้งสองทางจึงคืน enum ได้ — บีบเป็นสตริงตรงนี้
        // เพราะนั่นคือสิ่งที่ match_value เก็บ
        $requestType = $ticket->relationLoaded('serviceRequest')
            ? $ticket->serviceRequest?->type
            : $ticket->serviceRequest()->value('type');
        $requestType = $requestType instanceof BackedEnum ? (string) $requestType->value : $requestType;

        // งานปกติไม่เข้ากฎไหน แม้จะมีแถว 'standard' อยู่ในตาราง — นั่นคือสิ่งที่ทำให้
        // scope นี้ชนะลำดับบนสุดได้โดยไม่มีทางแอบทับเงียบ ๆ
        $workClass = $ticket->work_class?->isRepair() ? $ticket->work_class->value : null;

        $candidates = [
            SlaScope::WorkClass->value => $workClass,
            SlaScope::RequestType->value => $requestType,
            SlaScope::Priority->value => $ticket->priority?->value,
        ];

        foreach (SlaScope::precedence() as $scope) {
            $value = $candidates[$scope->value] ?? null;
            $rule = $value === null ? null : ($rules[$scope->value][$value] ?? null);
            if ($rule !== null) {
                return ['hours' => $rule['hours'], 'scope' => $scope, 'value' => $value, 'clock' => $rule['clock']];
            }
        }

        // ไม่มีอะไรตั้งไว้สำหรับเคสนี้: ค่าเริ่มต้นตาม priority และ medium เมื่อยังไม่มี priority
        // รายงานเป็น scope null เพราะไม่มีใครเลือกมัน — และนับด้วยเวลาทำการ ซึ่งคือพฤติกรรมเดิม
        return [
            'hours' => self::resolveHours($ticket->priority?->value),
            'scope' => null,
            'value' => null,
            'clock' => TicketSlaClock::Business,
        ];
    }
```

เพิ่ม import `use App\Enums\Ticket\TicketSlaClock;` ที่หัวไฟล์

- [ ] **Step 7: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=TicketWorkClassTest
php artisan test --compact --filter=SlaTargetTest
```

Expected: PASS ทั้งสองไฟล์ — `SlaTargetTest` เดิมต้องไม่แดงเลย เพราะลำดับ request_type → priority ยังเหมือนเดิม

- [ ] **Step 8: พิสูจน์ guard ด้วยการถอดออกแล้วดูให้แดง**

ชั่วคราว: เปลี่ยน `$workClass` ให้เป็น `$ticket->work_class?->value` (ตัด `isRepair()` ออก) แล้วรัน

```
php artisan test --compact --filter=test_standard_work_matches_no_rule_even_when_a_row_exists_for_it
```

Expected: FAIL — ยืนยันว่าเทสต์ตัวนี้จับของจริง แล้ว**ใส่กลับ**

- [ ] **Step 9: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Enums/Ticket/SlaScope.php app/Support/TicketSla.php tests/Feature/TicketWorkClassTest.php
git commit -m "feat(sla): the nature of the work outranks what was asked for"
```

---

## Task 3: นาฬิกาสองโหมด

**Files:**
- Modify: `app/Support/TicketSla.php` (`resolveDueAt()` ~บรรทัด 289, `forTicket()` ~บรรทัด 320–360)
- Test: `tests/Feature/TicketSlaClockTest.php`

**Interfaces:**
- Consumes: `TicketSlaClock`, `targetFor()` ที่คืน `clock` จาก Task 2
- Produces:
  - `TicketSla::addMinutesOn(Carbon $from, int $minutes, TicketSlaClock $clock): Carbon`
  - `TicketSla::minutesBetweenOn(Carbon $from, Carbon $to, TicketSlaClock $clock): int`
  - `forTicket()` payload เพิ่มคีย์ `clock: string`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `tests/Feature/TicketSlaClockTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "ซ่อมให้เสร็จใน 30 วัน" ที่องค์กรประกาศไว้ ไม่ได้แปลว่า 30 วันทำการเสมอไป
 *
 * นาฬิกาจึงเป็นค่าต่อแถวกฎ ไม่ใช่ค่าที่ฝังในโค้ด ผู้ดูแลระบบเป็นคนตอบว่า 30 วันของ
 * องค์กรตัวเองนับยังไง เทสต์ชุดนี้ตรึงว่าเดดไลน์กับ % ความคืบหน้าใช้นาฬิกาเรือนเดียวกัน
 * ซึ่งถ้าหลุดจะได้แถบความคืบหน้าที่ต่ำกว่าความจริงมาก เคสจะดูสุขภาพดีทั้งที่ใกล้หมดเวลา
 */
class TicketSlaClockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
    }

    private function calendarRule(string $value, int $hours): void
    {
        SlaTarget::create([
            'scope' => SlaScope::WorkClass->value,
            'match_value' => $value,
            'resolve_hours' => $hours,
            'clock' => TicketSlaClock::Calendar->value,
            'enabled' => true,
        ]);
        TicketSla::flush();
    }

    public function test_calendar_minutes_run_straight_through_nights_and_weekends(): void
    {
        // ศุกร์ 16:00 + 720 ชม. ปฏิทิน = 30 วันต่อมาเป๊ะ ไม่สนใจหน้าต่างเวลาทำการ
        $from = \Carbon\Carbon::parse('2026-10-02 16:00:00');

        $due = TicketSla::addMinutesOn($from, 720 * 60, TicketSlaClock::Calendar);

        $this->assertSame('2026-11-01 16:00:00', $due->format('Y-m-d H:i:s'));
    }

    public function test_business_minutes_still_behave_exactly_as_before(): void
    {
        $from = \Carbon\Carbon::parse('2026-10-02 16:00:00');

        $this->assertTrue(
            TicketSla::addMinutesOn($from, 4 * 60, TicketSlaClock::Business)
                ->equalTo(TicketSla::addBusinessMinutes($from, 4 * 60)),
        );
    }

    public function test_a_calendar_rule_gives_the_ticket_a_calendar_deadline(): void
    {
        $this->calendarRule('repair_vendor', 1080); // 45 วันปฏิทิน
        $ticket = Ticket::factory()->create([
            'work_class' => TicketWorkClass::RepairVendor,
            'created_at' => \Carbon\Carbon::parse('2026-10-02 16:00:00'),
        ]);

        $due = TicketSla::resolveDueAt($ticket);

        $this->assertSame('2026-11-16 16:00:00', $due->format('Y-m-d H:i:s'));
    }

    public function test_progress_percent_is_measured_on_the_same_clock_as_the_deadline(): void
    {
        $this->calendarRule('repair_internal', 720); // 30 วันปฏิทิน
        $ticket = Ticket::factory()->create([
            'work_class' => TicketWorkClass::RepairInternal,
            'priority' => TicketPriority::Medium,
            'status' => \App\Enums\Ticket\TicketStatus::InProgress,
            'responded_at' => now()->subDays(15),
            'created_at' => now()->subDays(15),
        ]);

        $sla = TicketSla::forTicket($ticket);

        // 15 วันจาก 30 วันปฏิทิน = ราวครึ่งทาง ถ้าเผลอนับด้วยเวลาทำการจะได้ราว 12 ไม่ใช่ 50
        $this->assertNotNull($sla);
        $this->assertGreaterThanOrEqual(45, $sla['pct_elapsed']);
        $this->assertLessThanOrEqual(55, $sla['pct_elapsed']);
        $this->assertSame('on_track', $sla['state']);
    }

    public function test_the_response_clock_stays_on_business_time_even_under_a_calendar_rule(): void
    {
        // เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ ไม่ได้ผูกกับแถวกฎ จึงไม่มีเหตุให้เปลี่ยนนาฬิกา
        $this->calendarRule('repair_internal', 720);
        $ticket = Ticket::factory()->create([
            'work_class' => TicketWorkClass::RepairInternal,
            'created_at' => \Carbon\Carbon::parse('2026-10-02 16:00:00'),
        ]);

        $this->assertTrue(
            TicketSla::responseDueAt($ticket)
                ->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::responseMinutes())),
        );
    }
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=TicketSlaClockTest
```

Expected: FAIL — `addMinutesOn()` ยังไม่มี

- [ ] **Step 3: เพิ่มนาฬิกาสองโหมดใน `TicketSla`**

วางต่อจาก `businessMinutesBetween()`:

```php
    /**
     * เวลาที่ถึงหลังใช้เวลาไป $minutes นับด้วยนาฬิกาที่กฎกำหนด
     *
     * โหมด calendar นับเวลาจริงตรง ๆ เพราะ KPI อย่าง "ซ่อมเสร็จใน 30 วัน" ที่องค์กร
     * ประกาศไว้ ไม่ได้หยุดเดินตอนคนกลับบ้าน
     */
    public static function addMinutesOn(Carbon $from, int $minutes, TicketSlaClock $clock): Carbon
    {
        return $clock === TicketSlaClock::Calendar
            ? $from->copy()->addMinutes(max(0, $minutes))
            : self::addBusinessMinutes($from, $minutes);
    }

    /** เวลาที่ผ่านไประหว่างสองจุด นับด้วยนาฬิกาเรือนเดียวกับที่ตั้งเดดไลน์ */
    public static function minutesBetweenOn(Carbon $from, Carbon $to, TicketSlaClock $clock): int
    {
        if ($clock === TicketSlaClock::Calendar) {
            return $to->lessThanOrEqualTo($from) ? 0 : (int) $from->diffInMinutes($to);
        }

        return self::businessMinutesBetween($from, $to);
    }
```

- [ ] **Step 4: ให้ `resolveDueAt()` ใช้นาฬิกาของเป้าหมาย**

```php
    /** เดดไลน์ปิดเคส นับด้วยนาฬิกาที่เป้าหมายของเคสนี้กำหนด — ใช้ร่วมกับ SLA % บน dashboard */
    public static function resolveDueAt(Ticket $ticket): Carbon
    {
        $target = self::targetFor($ticket);

        return self::addMinutesOn($ticket->created_at, $target['hours'] * 60, $target['clock']);
    }
```

`responseDueAt()` **ไม่แตะ** — เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ ไม่ผูกกับแถวกฎ

- [ ] **Step 5: ให้ `forTicket()` คิด % ด้วยนาฬิกาเรือนเดียวกัน**

แทนที่ body ตั้งแต่ `$responseTarget` ถึง `return self::payload(...)` ตัวสุดท้าย:

```php
        $target = self::targetFor($ticket);
        $clock = $target['clock'];
        $responseTarget = self::responseMinutes();
        $resolveTarget = $target['hours'] * 60;
        // นาฬิกาตอบรับเป็น business เสมอ: เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ ไม่ได้มาจากแถวกฎ
        $responseDue = self::addBusinessMinutes($ticket->created_at, $responseTarget);
        $resolveDue = self::addMinutesOn($ticket->created_at, $resolveTarget, $clock);

        if ($ticket->status === TicketStatus::Completed && $ticket->resolved_at !== null) {
            $state = $ticket->resolved_at->lessThanOrEqualTo($resolveDue) ? 'met' : 'missed';

            return self::payload($responseDue, $resolveDue, $state, 100, $clock);
        }

        // นาฬิกาที่กำลังเดิน: ตอบรับระหว่างที่ยังเปิด ปิดเคสหลังจากนั้น
        $responseActive = $ticket->responded_at === null && $ticket->status === TicketStatus::Open;
        $due = $responseActive ? $responseDue : $resolveDue;
        $total = max(1, $responseActive ? $responseTarget : $resolveTarget);
        // เวลาที่ผ่านไปต้องนับด้วยนาฬิกาเรือนเดียวกับที่ตั้งเดดไลน์ ไม่งั้นแถบความคืบหน้าจะโกหก
        $elapsed = self::minutesBetweenOn(
            $ticket->created_at,
            now(),
            $responseActive ? TicketSlaClock::Business : $clock,
        );
        $pct = (int) min(100, round(($elapsed / $total) * 100));

        $state = now()->greaterThan($due) ? 'breached' : ($pct >= self::AT_RISK_PCT ? 'at_risk' : 'on_track');

        return self::payload($responseDue, $resolveDue, $state, $pct, $clock);
```

และแก้ `payload()`:

```php
    /**
     * @return array{response_due_at: string, resolve_due_at: string, state: string, pct_elapsed: int, clock: string}
     */
    private static function payload(Carbon $responseDue, Carbon $resolveDue, string $state, int $pct, TicketSlaClock $clock): array
    {
        return [
            'response_due_at' => $responseDue->toIso8601String(),
            'resolve_due_at' => $resolveDue->toIso8601String(),
            'state' => $state,
            'pct_elapsed' => $pct,
            'clock' => $clock->value,
        ];
    }
```

แก้ docblock ของ `forTicket()` ให้ระบุคีย์ `clock` ด้วย

- [ ] **Step 6: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=TicketSlaClockTest
php artisan test --compact --filter=TicketSlaTest
```

Expected: PASS ทั้งคู่

- [ ] **Step 7: พิสูจน์ด้วยการถอดออกแล้วดูให้แดง**

ชั่วคราว: ใน `forTicket()` เปลี่ยน `$elapsed` กลับไปใช้ `self::businessMinutesBetween(...)` แล้วรัน

```
php artisan test --compact --filter=test_progress_percent_is_measured_on_the_same_clock_as_the_deadline
```

Expected: FAIL (pct ตกไปราว 12 แทนที่จะอยู่ในช่วง 45–55) แล้ว**ใส่กลับ**

- [ ] **Step 8: รันทั้ง suite**

```
php artisan test --compact
```

Expected: ทุกตัวเขียว

- [ ] **Step 9: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Support/TicketSla.php tests/Feature/TicketSlaClockTest.php
git commit -m "feat(sla): a target says which clock counts it"
```

---

## Task 4: กดรับไม่ทับเดดไลน์ที่มาจากลักษณะงาน

**Files:**
- Modify: `app/Services/Ticket/TicketService.php:213–225` (`deadlineAfterPriority()`)
- Test: `tests/Feature/TicketWorkClassTest.php` (เพิ่ม)

**Interfaces:**
- Consumes: `TicketSla::targetFor()['scope']` จาก Task 2
- Produces: ไม่มี signature ใหม่ — พฤติกรรมเปลี่ยนอย่างเดียว

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

เพิ่มใน `tests/Feature/TicketWorkClassTest.php` (เพิ่ม import `TicketService`, `User`, `Employee`):

```php
    public function test_taking_a_case_does_not_shorten_a_work_class_deadline(): void
    {
        // "เดินสายใช้เวลา 30 วัน" ไม่ได้เลิกเป็นความจริงเพราะช่างที่กดรับติ๊กว่าด่วน
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create(['work_class' => TicketWorkClass::RepairInternal]);
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Test', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        app(TicketService::class)->take($ticket, $staff, TicketPriority::Critical, 'ดูให้');

        $this->assertTrue(
            $ticket->fresh()->sla_resolve_due_at->equalTo(TicketSla::addBusinessMinutes($ticket->created_at, 240 * 60)),
        );
    }

    public function test_taking_an_ordinary_case_still_sets_the_deadline_from_priority(): void
    {
        $ticket = Ticket::factory()->create();
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Two', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        app(TicketService::class)->take($ticket, $staff, TicketPriority::Critical, 'ดูให้');

        $expected = TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours('critical') * 60);
        $this->assertTrue($ticket->fresh()->sla_resolve_due_at->equalTo($expected));
    }
```

> **หมายเหตุ:** เช็ค signature จริงของ `TicketService::take()` ที่ `app/Services/Ticket/TicketService.php` ก่อนเขียน — ถ้าพารามิเตอร์ไม่ตรง ให้ปรับตามของจริง

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=test_taking_a_case_does_not_shorten_a_work_class_deadline
```

Expected: FAIL — เดดไลน์ถูกเขียนทับด้วยค่าของ critical

- [ ] **Step 3: ทำ guard ให้เป็นกฎเดียว แทนการไล่เช็คทีละ scope**

`app/Services/Ticket/TicketService.php` — แทนที่ `deadlineAfterPriority()`:

```php
    /**
     * คอลัมน์เดดไลน์ที่ต้องเขียนเมื่อเคสถูกรับหรือถูกมอบหมายและได้ priority
     *
     * เคสที่เป้าหมายมาจากอย่างอื่นที่ไม่ใช่ priority จะเก็บเดดไลน์นั้นไว้: "จอต้องใช้เวลา
     * จัดหา 3 วัน" และ "เดินสายใช้เวลา 30 วัน" ไม่ได้เลิกเป็นความจริงเพราะช่างที่กดรับ
     * ติ๊กว่าด่วน priority ยังตัดสินทุกอย่างที่มันเคยตัดสิน แค่ไม่หดเดดไลน์ที่ถูกกำหนด
     * โดยเนื้องาน
     *
     * เขียนเป็นกฎเดียว ("scope ที่ชนะไม่ใช่ priority") แทนการไล่เช็คทีละ scope — รายการ
     * ที่เขียนด้วยมือคือรายการที่วันหนึ่งจะมีคนเพิ่ม scope ใหม่แล้วลืมมาแก้ตรงนี้
     *
     * @return array<string, mixed>
     */
    private function deadlineAfterPriority(Ticket $ticket, TicketPriority $priority): array
    {
        $scope = TicketSla::targetFor($ticket)['scope'];
        if ($scope !== null && $scope !== SlaScope::Priority) {
            return [];
        }

        $hours = TicketSla::resolveHours($priority->value);

        return [
            'sla_resolve_due_at' => TicketSla::addBusinessMinutes($ticket->created_at, $hours * 60),
            'sla_resolve_alert_level' => null,
        ];
    }
```

- [ ] **Step 4: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=TicketWorkClassTest
php artisan test --compact --filter=SlaTargetTest
```

Expected: PASS — `SlaTargetTest` ที่ตรึงพฤติกรรม request_type เดิมต้องยังเขียว

- [ ] **Step 5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Ticket/TicketService.php tests/Feature/TicketWorkClassTest.php
git commit -m "fix(sla): one rule decides whether priority may move a deadline"
```

---

## Task 5: permission `tickets.set_work_class`

คีย์ต้องอยู่ครบ **สามที่** — PHP catalog, TS LIVE set, และ tree · `PermissionMatrixTest` จับ drift นี้

**Files:**
- Modify: `app/Support/Permissions.php` (catalog `'tickets'` ~บรรทัด 20–27, `defaults()` admin ~บรรทัด 138–145, ticketHierarchy)
- Modify: `resources/js/modules/permission/lib/permission-labels.ts:31–34`
- Modify: `resources/js/modules/permission/components/ticket-permission-tree.tsx:18`
- Modify: `resources/js/lang/{en,th}/permission.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces: permission key `tickets.set_work_class` — เป็นลูกของ `tickets.view_all` เหมือน `resolve`/`forward`/`assign`

- [ ] **Step 1: เพิ่มคีย์ใน catalog**

`app/Support/Permissions.php` — ใน `catalog()` บล็อก `'tickets'`:

```php
            'tickets' => [
                'module',
                'view_dashboard', 'view_all',
                'resolve', 'forward', 'assign', 'set_work_class',
                'level_hardware', 'level_software', 'level_network', 'level_other',
                'create', 'edit_own',
                'my', 'jobs',
            ],
```

- [ ] **Step 2: ให้ role admin ถือคีย์นี้ตั้งแต่ต้น**

ใน `defaults()` บล็อก `'admin'` เพิ่ม `'tickets.set_work_class'` ต่อจาก `'tickets.assign'`:

```php
                'tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class',
```

- [ ] **Step 3: หา `ticketHierarchy()` แล้วแขวนคีย์ใต้ `view_all`**

```
grep -n "ticketHierarchy" -A 20 app/Support/Permissions.php
```

เพิ่ม `'tickets.set_work_class'` เข้าไปในลิสต์ children ของ `'tickets.view_all'` (อยู่ข้าง `resolve`/`forward`/`assign`)

- [ ] **Step 4: เพิ่มคีย์ใน LIVE set ฝั่ง TS**

`resources/js/modules/permission/lib/permission-labels.ts` — หลังบรรทัด `'tickets.resolve',`:

```ts
    'tickets.set_work_class',
```

- [ ] **Step 5: เพิ่มเข้า tree**

`resources/js/modules/permission/components/ticket-permission-tree.tsx` บรรทัด 18:

```ts
    { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class'] },
```

- [ ] **Step 6: เพิ่มคีย์ภาษา**

`resources/js/lang/en/permission.ts` — ในกลุ่มคีย์ของ tickets:

```ts
    'perm_act_tickets.set_work_class': 'Classify long repair work',
    'perm_desc_tickets.set_work_class':
        'Mark a case as in-house or vendor repair so it is judged against the repair KPI instead of the standard SLA. Every change asks for a reason and is written to the case timeline.',
```

`resources/js/lang/th/permission.ts` — ตำแหน่งเดียวกัน:

```ts
    'perm_act_tickets.set_work_class': 'จัดประเภทงานซ่อมยาว',
    'perm_desc_tickets.set_work_class':
        'ตั้งเคสเป็นงานซ่อมโดยช่างในองค์กรหรือ vendor เพื่อให้วัดด้วย KPI งานซ่อมแทน SLA ของงานปกติ ทุกครั้งที่เปลี่ยนต้องกรอกเหตุผล และถูกบันทึกลงไทม์ไลน์ของเคส',
```

- [ ] **Step 7: รันเทสต์ permission**

```
php artisan test --compact --filter=PermissionMatrixTest
npx tsc --noEmit
```

Expected: PASS / 0 error — ถ้า `PermissionMatrixTest` แดง แปลว่าลืมใส่ที่ใดที่หนึ่งใน 3 ที่

- [ ] **Step 8: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Support/Permissions.php resources/js/modules/permission resources/js/lang/en/permission.ts resources/js/lang/th/permission.ts
git commit -m "feat(permissions): a switch for classifying long repair work"
```

---

## Task 6: endpoint เปลี่ยนลักษณะงาน + guard rails

**Files:**
- Modify: `app/Services/Ticket/TicketService.php` (เพิ่ม `setWorkClass()` ต่อจาก `addUpdate()` ~บรรทัด 256)
- Modify: `app/Http/Controllers/Api/Ticket/TicketController.php` (เพิ่ม `updateWorkClass()` ต่อจาก `storeUpdate()` ~บรรทัด 632)
- Modify: `routes/api.php:201` (เพิ่ม route ถัดจาก `tickets/{ticket}/updates`)
- Test: `tests/Feature/TicketWorkClassTest.php` (เพิ่ม)

**Interfaces:**
- Consumes: `TicketWorkClass` (Task 1) · `TicketSla::resolveDueAt()` (Task 3) · `tickets.set_work_class` (Task 5)
- Produces:
  - `TicketService::setWorkClass(Ticket $ticket, User $staff, TicketWorkClass $class, string $reason): Ticket`
  - `PATCH /api/tickets/{ticket}/work-class` รับ `{ work_class: string, reason: string }` คืน `TicketResource`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

เพิ่มใน `tests/Feature/TicketWorkClassTest.php`:

```php
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

    public function test_a_case_that_is_not_yours_cannot_be_classified(): void
    {
        // gate ที่สอง: มีสิทธิ์ครบ แต่ไม่ได้ถือเคสนี้ — ลำดับเดียวกับ storeUpdate() คือ
        // เจ้าของเคสถูกเช็คก่อนสถานะ เคสที่ยังไม่มีใครรับจึงตอบ 403 ไม่ใช่ 422
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $ticket = Ticket::factory()->create(); // ยัง Open ไม่มีคนรับ
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Free', 'status' => 'active']);
        $staff = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        $this->actingAs($staff)->patchJson("/api/tickets/{$ticket->id}/work-class", [
            'work_class' => 'repair_internal',
            'reason' => 'เหตุผลที่ยาวพอจะผ่าน validate',
        ])->assertStatus(403);
    }

    public function test_a_closed_case_cannot_be_classified(): void
    {
        // gate ที่สาม: ถือเคสอยู่และมีสิทธิ์ครบ เหลือ status เป็นเงื่อนไขเดียวที่ปฏิเสธได้
        // ถ้า gate อื่นปฏิเสธได้ด้วย เทสต์นี้จะไม่ได้พิสูจน์อะไรเลย
        $ticket = Ticket::factory()->create();
        $staff = $this->assigneeOf($ticket);
        $ticket->update(['status' => TicketStatus::Completed]);

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
```

เพิ่ม import `use App\Enums\Ticket\TicketStatus;`

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: FAIL — 404 เพราะยังไม่มี route

- [ ] **Step 3: เพิ่ม `setWorkClass()` ใน service**

`app/Services/Ticket/TicketService.php` — วางต่อจาก `addUpdate()`:

```php
    /**
     * จัดประเภทลักษณะงานของเคสที่กำลังทำอยู่ และคำนวณเดดไลน์ใหม่ตามนั้น
     *
     * นี่คือจุดที่คนถือเคสขยับเดดไลน์ของตัวเองได้ ซึ่งเป็นสิ่งที่ Pending เคยทำแล้วถูกถอนออก
     * ความต่างคือ Pending ให้หยุดนาฬิกาได้เท่าไหร่ก็ได้โดยคนถือเคสเป็นคนกำหนด ส่วนอันนี้
     * ให้เลือกป้ายจากลิสต์ตายตัวที่ super admin เป็นเจ้าของตัวเลขทุกตัวและอนุมัติไว้ล่วงหน้า
     * ทุกครั้งที่เปลี่ยนจึงต้องมีเหตุผล และเหตุผลนั้นไปอยู่บนไทม์ไลน์ที่ผู้แจ้งเห็น
     *
     * เดดไลน์คิดจาก created_at เสมอ ไม่ใช่จากเวลาที่จัดประเภท — เคสที่ถูกจัดประเภทวันที่ 5
     * ได้ 30 วันนับจากวันแจ้ง ซึ่งตรงกับที่ KPI ขององค์กรวัด
     */
    public function setWorkClass(Ticket $ticket, User $staff, TicketWorkClass $class, string $reason): Ticket
    {
        $before = $ticket->work_class;
        $ticket->update(['work_class' => $class]);
        $ticket = $ticket->fresh();

        $ticket->forceFill([
            'sla_resolve_due_at' => TicketSla::resolveDueAt($ticket),
            // เดดไลน์ขยับแล้ว สถานะการเตือนที่ค้างอยู่ต้องประเมินใหม่
            'sla_resolve_alert_level' => null,
        ])->saveQuietly();

        // เขียนผ่าน addUpdate() ตัวเดิม เพื่อให้ผู้แจ้งได้ทั้งกระดิ่งและอีเมลเหมือนบันทึกอื่น ๆ
        $this->addUpdate($ticket, $staff, trim(sprintf(
            "%s → %s\n%s",
            $before?->label() ?? TicketWorkClass::Standard->label(),
            $class->label(),
            $reason,
        )));

        return $ticket->fresh();
    }
```

เพิ่ม import `use App\Enums\Ticket\TicketWorkClass;`

- [ ] **Step 4: เพิ่ม `updateWorkClass()` ใน controller**

`app/Http/Controllers/Api/Ticket/TicketController.php` — วางต่อจาก `storeUpdate()`:

```php
    /**
     * จัดประเภทลักษณะงานของเคส (tickets.set_work_class)
     *
     * ประตูเดียวกับการเขียนบันทึก: เฉพาะคนที่ถือเคสอยู่ และเฉพาะเคสที่ยังทำอยู่ —
     * การจัดประเภทคือการพูดว่างานนี้คืออะไร ซึ่งเป็นสิทธิ์ของคนที่กำลังทำมัน
     */
    public function updateWorkClass(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.set_work_class'), 403);
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'Only the assignee can classify this ticket.');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'Only a case in progress can be classified.');

        $data = $request->validate([
            'work_class' => ['required', new Enum(TicketWorkClass::class)],
            // เหตุผลยาวเท่ากับบันทึกความคืบหน้า เพราะมันกลายเป็นบันทึกความคืบหน้าจริง ๆ
            'reason' => ['required', 'string', 'min:5', 'max:5000'],
        ]);

        $before = $ticket->work_class;
        $ticket = $this->service->setWorkClass(
            $ticket,
            $request->user(),
            TicketWorkClass::from($data['work_class']),
            $data['reason'],
        );

        AuditLog::record(
            'Classified ticket work',
            sprintf('%s - %s → %s', $ticket->ticket_no, $before?->value ?? 'standard', $ticket->work_class->value),
        );

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments', 'updates'])))
            ->additional(['message' => 'success'])->response();
    }
```

เพิ่ม import `use App\Enums\Ticket\TicketWorkClass;` และ `use Illuminate\Validation\Rules\Enum;` (ถ้ายังไม่มี — เช็คหัวไฟล์ก่อน)

- [ ] **Step 5: เพิ่ม route**

`routes/api.php` ถัดจากบรรทัด 201:

```php
    Route::patch('tickets/{ticket}/work-class', [TicketController::class, 'updateWorkClass'])->name('api.tickets.work-class.update');
```

- [ ] **Step 6: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: PASS ทุกตัว

- [ ] **Step 7: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Ticket/TicketService.php app/Http/Controllers/Api/Ticket/TicketController.php routes/api.php tests/Feature/TicketWorkClassTest.php
git commit -m "feat(ticket): the person doing the work says what kind of work it is"
```

---

## Task 7: API resource + shared types

**Files:**
- Modify: `app/Http/Resources/Ticket/TicketResource.php` (`slaTarget()` บรรทัด 100–109, และ array หลัก ~บรรทัด 54)
- Modify: `resources/js/shared/types/index.ts:316, 396, 416`

**Interfaces:**
- Consumes: `targetFor()['clock']` (Task 2), `Ticket->work_class` (Task 1)
- Produces:
  - JSON: `ticket.work_class: 'standard'|'repair_internal'|'repair_vendor'`
  - JSON: `ticket.sla_target.clock: 'business'|'calendar'`
  - TS: `TicketWorkClass` type, `Ticket['work_class']`, `sla_target.clock`

- [ ] **Step 1: เพิ่ม `work_class` และ `clock` ใน resource**

`app/Http/Resources/Ticket/TicketResource.php` — ใน array หลัก ถัดจาก `'priority'`:

```php
            // ลักษณะงาน: งานปกติ หรืองานซ่อมที่วัดด้วย KPI ของตัวเอง เห็นได้เท่าที่เห็น SLA
            'work_class' => $this->work_class?->value,
```

และใน `slaTarget()`:

```php
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
```

- [ ] **Step 2: อัปเดต TS types**

`resources/js/shared/types/index.ts`:

```ts
export type TicketWorkClass = 'standard' | 'repair_internal' | 'repair_vendor';
```

บรรทัด 316 (interface `Ticket`) เพิ่มถัดจาก `priority`:
```ts
    work_class?: TicketWorkClass;
```

บรรทัด 416 แก้ `sla_target`:
```ts
    sla_target?: {
        hours: number;
        scope: 'work_class' | 'priority' | 'request_type' | null;
        value: string | null;
        clock: 'business' | 'calendar';
    };
```

- [ ] **Step 3: ตรวจ**

```
npx tsc --noEmit
php artisan test --compact --filter=TicketDeskInternalsVisibilityTest
```

Expected: 0 error / PASS

- [ ] **Step 4: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/Ticket/TicketResource.php resources/js/shared/types/index.ts
git commit -m "feat(ticket): the API says what kind of work a case is and which clock judges it"
```

---

## Task 8: Settings API — ลิสต์ที่สาม และ clock ทุกแถว

**Files:**
- Modify: `app/Http/Controllers/Api/Settings/SettingsController.php` (`updateSla()` บรรทัด 114–212, `show()` ~บรรทัด 401–412)
- Test: `tests/Feature/SlaTargetTest.php` (เพิ่ม)

**Interfaces:**
- Consumes: `TicketWorkClass`, `TicketSlaClock`, `SlaScope::WorkClass`
- Produces:
  - `PUT /api/settings/sla` รับเพิ่ม `ticket_sla_work_class: [{work_class, resolve, clock, enabled}]` (ทั้งลิสต์) และ `ticket_sla.*.clock`, `ticket_sla_request.*.clock`
  - `GET /api/settings` คืน `ticket_sla_work_class` และ `clock` บนทุกแถว

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

เพิ่มใน `tests/Feature/SlaTargetTest.php`:

```php
    public function test_work_class_targets_save_as_rows(): void
    {
        $admin = $this->staff();

        $this->actingAs($admin)->putJson('/api/settings/sla', [
            'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
            'ticket_sla_work_class' => [
                ['work_class' => 'repair_internal', 'resolve' => 720, 'clock' => 'calendar', 'enabled' => true],
                ['work_class' => 'repair_vendor', 'resolve' => 1080, 'clock' => 'calendar', 'enabled' => true],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('sla_targets', [
            'scope' => 'work_class', 'match_value' => 'repair_internal', 'resolve_hours' => 720, 'clock' => 'calendar',
        ]);
        $this->assertDatabaseHas('sla_targets', [
            'scope' => 'work_class', 'match_value' => 'repair_vendor', 'resolve_hours' => 1080, 'clock' => 'calendar',
        ]);
    }

    public function test_a_work_class_row_left_out_of_the_list_is_deleted(): void
    {
        $admin = $this->staff();
        SlaTarget::create(['scope' => 'work_class', 'match_value' => 'repair_vendor', 'resolve_hours' => 1080, 'enabled' => true]);

        $this->actingAs($admin)->putJson('/api/settings/sla', [
            'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
            'ticket_sla_work_class' => [],
        ])->assertOk();

        $this->assertDatabaseMissing('sla_targets', ['scope' => 'work_class', 'match_value' => 'repair_vendor']);
    }

    public function test_saving_the_priority_form_alone_leaves_work_class_rules_untouched(): void
    {
        $admin = $this->staff();
        SlaTarget::create(['scope' => 'work_class', 'match_value' => 'repair_internal', 'resolve_hours' => 720, 'enabled' => true]);

        $this->actingAs($admin)->putJson('/api/settings/sla', [
            'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
        ])->assertOk();

        $this->assertDatabaseHas('sla_targets', ['scope' => 'work_class', 'match_value' => 'repair_internal']);
    }

    public function test_standard_is_rejected_as_a_work_class_rule(): void
    {
        // งานปกติไม่มีเป้าหมายของตัวเอง มันคือกรณีที่ priority ตอบอยู่แล้ว
        // แถวที่สร้างได้แต่ไม่มีวันทำงานคือแถวที่จะทำให้คนเข้าใจผิด
        $admin = $this->staff();

        $this->actingAs($admin)->putJson('/api/settings/sla', [
            'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
            'ticket_sla_work_class' => [['work_class' => 'standard', 'resolve' => 100, 'clock' => 'business', 'enabled' => true]],
        ])->assertStatus(422);
    }
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=test_work_class_targets_save_as_rows
```

Expected: FAIL

- [ ] **Step 3: เพิ่ม validation**

`app/Http/Controllers/Api/Settings/SettingsController.php` — ใน `Validator::make()` เพิ่มหลังบล็อก `ticket_sla_request`:

```php
            'ticket_sla.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            'ticket_sla_request.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            // เป้าหมายตามลักษณะงาน — ไม่มี 'standard' เพราะงานปกติคือกรณีที่ priority ตอบอยู่แล้ว
            'ticket_sla_work_class' => ['sometimes', 'array'],
            'ticket_sla_work_class.*.work_class' => ['required', 'distinct', Rule::in(TicketWorkClass::repairValues())],
            'ticket_sla_work_class.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
            'ticket_sla_work_class.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            'ticket_sla_work_class.*.enabled' => ['sometimes', 'boolean'],
```

เพิ่ม import `use App\Enums\Ticket\TicketSlaClock;`, `use App\Enums\Ticket\TicketWorkClass;`, `use Illuminate\Validation\Rule;`

- [ ] **Step 4: เขียนแถวลง DB**

ในบล็อกที่เขียน priority rows เพิ่ม clock:

```php
        foreach ($data['ticket_sla'] as $priority => $row) {
            SlaTarget::updateOrCreate(
                ['scope' => SlaScope::Priority->value, 'match_value' => (string) $priority],
                [
                    'resolve_hours' => (int) $row['resolve'],
                    'clock' => $row['clock'] ?? TicketSlaClock::Business->value,
                    'enabled' => true,
                ],
            );
        }
```

ในบล็อก `ticket_sla_request` เพิ่ม clock เหมือนกัน:

```php
                SlaTarget::updateOrCreate(
                    ['scope' => SlaScope::RequestType->value, 'match_value' => $row['type']],
                    [
                        'resolve_hours' => (int) $row['resolve'],
                        'clock' => $row['clock'] ?? TicketSlaClock::Business->value,
                        'enabled' => (bool) ($row['enabled'] ?? true),
                    ],
                );
```

แล้วเพิ่มบล็อกใหม่ต่อจากบล็อก request-type:

```php
        // เป้าหมายตามลักษณะงานมาเป็นทั้งลิสต์เหมือนกฎประเภทคำขอ แถวที่ผู้ดูแลลบบนหน้าจอ
        // คือแถวที่หายไปตรงนี้ ไม่ส่งคีย์นี้มาเลย = ไม่แตะกฎเดิม
        if (array_key_exists('ticket_sla_work_class', $data)) {
            $keep = [];
            foreach ($data['ticket_sla_work_class'] as $row) {
                $keep[] = $row['work_class'];
                SlaTarget::updateOrCreate(
                    ['scope' => SlaScope::WorkClass->value, 'match_value' => $row['work_class']],
                    [
                        'resolve_hours' => (int) $row['resolve'],
                        'clock' => $row['clock'] ?? TicketSlaClock::Business->value,
                        'enabled' => (bool) ($row['enabled'] ?? true),
                    ],
                );
            }
            SlaTarget::where('scope', SlaScope::WorkClass->value)->whereNotIn('match_value', $keep)->delete();
        }
```

- [ ] **Step 5: คืนค่าใน `show()`**

หาบล็อก `$values['ticket_sla_request'] = ...` (~บรรทัด 406) แล้วเพิ่ม `clock` เข้าไปใน map เดิม พร้อมเพิ่มบล็อกใหม่:

```php
        $values['ticket_sla_work_class'] = SlaTarget::where('scope', SlaScope::WorkClass->value)
            ->orderBy('match_value')
            ->get()
            ->map(fn (SlaTarget $target) => [
                'work_class' => $target->match_value,
                'resolve' => $target->resolve_hours,
                'clock' => $target->clock->value,
                'enabled' => $target->enabled,
            ])
            ->values();
```

> เปิดบล็อก `ticket_sla_request` ที่มีอยู่แล้วคัดลอกรูปให้ตรง — โครง map อาจต่างจากที่เขียนไว้ตรงนี้เล็กน้อย

- [ ] **Step 6: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=SlaTargetTest
```

Expected: PASS ทุกตัว (ของเดิม 14 ตัว + ใหม่ 4 ตัว)

- [ ] **Step 7: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/Settings/SettingsController.php tests/Feature/SlaTargetTest.php
git commit -m "feat(settings): repair targets are rows, and every row names its clock"
```

---

## Task 9: แยกตัวเลข SLA ออกจาก KPI งานซ่อม

**Files:**
- Modify: `app/Http/Controllers/Api/Ticket/TicketController.php` (`summary()` บรรทัด ~250–315, helper `slaMetPct()`)
- Test: `tests/Feature/TicketWorkClassTest.php` (เพิ่ม)

**Interfaces:**
- Consumes: `TicketWorkClass::repairValues()` (Task 1)
- Produces: `GET /api/tickets/summary` เพิ่มคีย์ `repair_kpi_met_pct: int|null`, `repair_kpi_delta_pts: int|null`, `repair_backlog: int`, `has_repair_rules: bool`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

เพิ่มใน `tests/Feature/TicketWorkClassTest.php`:

```php
    public function test_the_standard_sla_figure_leaves_repair_cases_out(): void
    {
        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);
        $staff = $this->assigneeOf(Ticket::factory()->create());

        // งานปกติที่ปิดทันเวลา
        Ticket::factory()->create([
            'status' => TicketStatus::Completed,
            'priority' => TicketPriority::Low,
            'resolved_at' => now()->subDay(),
            'sla_resolve_due_at' => now()->addDay(),
        ]);
        // งานซ่อมที่ปิดช้า — ต้องไม่ไปฉุด SLA ของงานปกติ
        Ticket::factory()->create([
            'status' => TicketStatus::Completed,
            'work_class' => TicketWorkClass::RepairInternal,
            'resolved_at' => now()->subDay(),
            'sla_resolve_due_at' => now()->subDays(5),
        ]);

        $body = $this->actingAs($staff)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->assertSame(100, $body['sla_met_pct']);
        $this->assertSame(0, $body['repair_kpi_met_pct']);
    }

    public function test_the_repair_figure_is_null_when_no_repair_case_has_closed(): void
    {
        $staff = $this->assigneeOf(Ticket::factory()->create());

        $body = $this->actingAs($staff)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->assertNull($body['repair_kpi_met_pct']);
    }

    public function test_the_summary_says_whether_repair_rules_exist_at_all(): void
    {
        // หน้าจอใช้ค่านี้ตัดสินว่าจะโชว์การ์ด KPI ไหม — องค์กรที่ไม่ได้ใช้ฟีเจอร์นี้
        // ไม่ควรเห็นการ์ดที่ขึ้น "—" ตลอดกาล
        $staff = $this->assigneeOf(Ticket::factory()->create());

        $before = $this->actingAs($staff)->getJson('/api/tickets/summary')->json();
        $this->assertFalse($before['has_repair_rules']);

        $this->rule(SlaScope::WorkClass, 'repair_internal', 240);

        $after = $this->actingAs($staff)->getJson('/api/tickets/summary')->json();
        $this->assertTrue($after['has_repair_rules']);
    }
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

```
php artisan test --compact --filter=test_the_standard_sla_figure_leaves_repair_cases_out
```

Expected: FAIL — คีย์ `repair_kpi_met_pct` ยังไม่มี

- [ ] **Step 3: แยกกลุ่มใน `summary()`**

ใน `app/Http/Controllers/Api/Ticket/TicketController.php` หลังบรรทัดที่นิยาม `$resolvedInWindow` เพิ่ม:

```php
        // 30/45 วันเป็น KPI คนละตัวกับ SLA อยู่แล้วในความเป็นจริงขององค์กร การเอาเป้าหมาย
        // 4 ชั่วโมงกับ 360 ชั่วโมงมาเฉลี่ยเป็นเปอร์เซ็นต์เดียวทำให้ตัวเลขอ่านยากขึ้น ไม่ใช่ง่ายขึ้น
        // เคสตกกลุ่มไหนตัดสินจากค่า work_class ปัจจุบัน — AuditLog เก็บประวัติไว้ให้แล้วถ้าต้องสาว
        $isRepair = fn (Ticket $t) => $t->work_class?->isRepair() ?? false;
        $standardIn = fn ($start, $end) => $resolvedInWindow($start, $end)->reject($isRepair);
        $repairIn = fn ($start, $end) => $resolvedInWindow($start, $end)->filter($isRepair);
```

แก้สองบรรทัดที่คำนวณ `$slaCur` / `$slaPrev`:

```php
        $slaCur = $this->slaMetPct($standardIn($curStart, $curEnd));
        $slaPrev = $this->slaMetPct($standardIn($prevStart, $curStart));

        $repairCur = $this->slaMetPct($repairIn($curStart, $curEnd));
        $repairPrev = $this->slaMetPct($repairIn($prevStart, $curStart));
```

เพิ่มคีย์ใน response ถัดจาก `sla_delta_pts`:

```php
            'repair_kpi_met_pct' => $repairCur,
            'repair_kpi_delta_pts' => ($repairCur === null || $repairPrev === null) ? null : $repairCur - $repairPrev,
            // งานซ่อมที่ยังไม่ปิด — ทำให้อ่านออกว่า null แปลว่า "ไม่มีงาน" หรือ "ยังไม่มีอันไหนปิด"
            'repair_backlog' => $tickets
                ->filter(fn (Ticket $t) => in_array($t->status, TicketStatus::live(), true))
                ->filter($isRepair)
                ->count(),
            // หน้าจอใช้ค่านี้ตัดสินว่าจะโชว์การ์ด KPI ไหม
            'has_repair_rules' => ! empty(TicketSla::rules()[SlaScope::WorkClass->value] ?? []),
```

เพิ่ม import `use App\Enums\Ticket\SlaScope;` (ถ้ายังไม่มี)

`sla_breached_now` **ไม่แตะ** — เคสซ่อมที่เลย 30 วันก็คือเลยกำหนดจริง ไม่ใช่เรื่องที่ควรซ่อน

- [ ] **Step 4: รันเทสต์ให้เขียว**

```
php artisan test --compact --filter=TicketWorkClassTest
```

Expected: PASS ทุกตัว

- [ ] **Step 5: รันทั้ง suite**

```
php artisan test --compact
```

Expected: ทุกตัวเขียว

- [ ] **Step 6: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/Ticket/TicketController.php tests/Feature/TicketWorkClassTest.php
git commit -m "feat(ticket): a four-hour target and a 45-day one stop sharing a percentage"
```

---

## Task 10: Settings UI — แยกไฟล์ + ลิสต์ที่สาม + clock

`resources/js/modules/settings/pages/index.tsx` อยู่ที่ 2,099 บรรทัด และงานนี้จะเพิ่มอีกราว 150 — `TicketsTab` ย้ายออกมาเป็นไฟล์ของตัวเองก่อน

**Files:**
- Create: `resources/js/modules/settings/components/tickets-sla-tab.tsx`
- Modify: `resources/js/modules/settings/pages/index.tsx` (ตัด `TicketsTab` ออก แล้ว import)
- Modify: `resources/js/shared/types/index.ts` (`TicketSlaWorkClassTarget`, เพิ่ม `clock` ใน `TicketSlaRequestTarget`)
- Modify: `resources/js/lang/{en,th}/settings.ts`

**Interfaces:**
- Consumes: `GET /api/settings` → `ticket_sla_work_class` (Task 8)
- Produces: `TicketSlaWorkClassTarget = { work_class: 'repair_internal'|'repair_vendor'; resolve: number; clock: 'business'|'calendar'; enabled: boolean }`

- [ ] **Step 1: ย้าย `TicketsTab` ออกมาเป็นไฟล์ใหม่ ยังไม่เปลี่ยนพฤติกรรม**

ตัดฟังก์ชัน `TicketsTab` (เริ่มที่บรรทัด ~1363) พร้อมค่าคงที่ที่มันใช้คนเดียว (`SLA_DAYS` บรรทัด 1361, `workingDaysHint` ถ้ามี) ไปไว้ใน `resources/js/modules/settings/components/tickets-sla-tab.tsx` แล้ว `export function TicketsSlaTab()` · ใน `pages/index.tsx` เพิ่ม `import { TicketsSlaTab } from '../components/tickets-sla-tab';` แล้วเปลี่ยนจุดที่เรียก `<TicketsTab />` เป็น `<TicketsSlaTab />`

หัวไฟล์ใหม่ใส่ docblock:

```tsx
/**
 * Settings → Tickets & SLA — เป้าหมายปิดเคส สามชุด และหน้าต่างเวลาทำการที่นาฬิกานับด้วย
 *
 * แยกออกมาจาก pages/index.tsx เพราะแท็บนี้ยาวกว่าแท็บอื่นมาก และการเพิ่มลิสต์ที่สาม
 * (เป้าหมายตามลักษณะงาน) จะดันไฟล์รวมไปเกิน 2,200 บรรทัด
 */
```

- [ ] **Step 2: ตรวจว่าย้ายแล้วไม่พัง**

```
npx tsc --noEmit
npm run build
```

Expected: 0 error / build ผ่าน

- [ ] **Step 3: Commit การย้ายแยกจากการเพิ่มฟีเจอร์**

```bash
git add resources/js/modules/settings
git commit -m "refactor(settings): the SLA tab moves into a file of its own"
```

- [ ] **Step 4: เพิ่ม types**

`resources/js/shared/types/index.ts`:

```ts
export interface TicketSlaWorkClassTarget {
    work_class: 'repair_internal' | 'repair_vendor';
    resolve: number;
    clock: 'business' | 'calendar';
    enabled: boolean;
}
```

เพิ่ม `clock: 'business' | 'calendar';` ใน `TicketSlaRequestTarget` ที่มีอยู่ และเพิ่ม `ticket_sla_work_class?: TicketSlaWorkClassTarget[];` ใน type ของ settings payload

- [ ] **Step 5: เพิ่มคีย์ภาษา**

`resources/js/lang/en/settings.ts` — ในกลุ่มคีย์ของแท็บ Tickets:

```ts
    // tickets-sla-tab.tsx — เป้าหมายตามลักษณะงาน
    set_sla_work_title: 'Targets by kind of work',
    set_sla_work_desc:
        'Repair work is measured against its own KPI, not the table above. A row here wins over every other rule, and only applies once somebody classifies a case.',
    set_sla_work_empty: 'No repair targets yet — every case is judged on the table above.',
    set_sla_work_add: 'Add a repair target',
    set_sla_work_all_used: 'Both kinds of repair already have a target.',
    set_sla_work_repair_internal: 'Repair (in-house)',
    set_sla_work_repair_vendor: 'Repair (vendor)',
    set_sla_clock: 'Counted on',
    set_sla_clock_business: 'Working hours',
    set_sla_clock_calendar: 'Calendar time',
```

`resources/js/lang/th/settings.ts` — comment กลุ่มเดียวกัน เรียงเหมือนกัน:

```ts
    // tickets-sla-tab.tsx — เป้าหมายตามลักษณะงาน
    set_sla_work_title: 'เป้าหมายตามลักษณะงาน',
    set_sla_work_desc:
        'งานซ่อมวัดด้วย KPI ของตัวเอง ไม่ใช่ตารางด้านบน แถวตรงนี้ชนะกฎอื่นทุกข้อ และมีผลเฉพาะเมื่อมีคนจัดประเภทเคสแล้วเท่านั้น',
    set_sla_work_empty: 'ยังไม่มีเป้าหมายงานซ่อม — ทุกเคสตัดสินด้วยตารางด้านบน',
    set_sla_work_add: 'เพิ่มเป้าหมายงานซ่อม',
    set_sla_work_all_used: 'งานซ่อมทั้งสองแบบมีเป้าหมายครบแล้ว',
    set_sla_work_repair_internal: 'ซ่อมโดยช่างในองค์กร',
    set_sla_work_repair_vendor: 'ซ่อมโดย vendor',
    set_sla_clock: 'นับด้วย',
    set_sla_clock_business: 'เวลาทำการ',
    set_sla_clock_calendar: 'เวลาปฏิทิน',
```

- [ ] **Step 6: เพิ่มลิสต์ที่สามในแท็บ**

ใน `tickets-sla-tab.tsx` เพิ่ม state และ handlers คู่ขนานกับ `reqTargets`:

```tsx
    // เป้าหมายตามลักษณะงาน — ลิสต์ที่เพิ่มแถวเอง เหมือนเป้าหมายตามประเภทคำขอ
    const [workTargets, setWorkTargets] = useState<TicketSlaWorkClassTarget[]>([]);

    useEffect(() => {
        if (data?.ticket_sla_work_class) setWorkTargets(data.ticket_sla_work_class);
    }, [data?.ticket_sla_work_class]);

    const WORK_CLASSES = ['repair_internal', 'repair_vendor'] as const;
    const availableWorkClasses = WORK_CLASSES.filter((c) => !workTargets.some((r) => r.work_class === c));

    const addWorkTarget = () => {
        const next = availableWorkClasses[0];
        if (!next) return;
        setWorkTargets((rows) => [...rows, { work_class: next, resolve: 720, clock: 'calendar', enabled: true }]);
    };
    const setWorkTarget = (key: string, patch: Partial<TicketSlaWorkClassTarget>) =>
        setWorkTargets((rows) => rows.map((r) => (r.work_class === key ? { ...r, ...patch } : r)));
    const removeWorkTarget = (key: string) => setWorkTargets((rows) => rows.filter((r) => r.work_class !== key));
```

แล้ววาง JSX ต่อจากบล็อก request-type (บล็อกที่มี `set_sla_request_title`) โดยใช้โครงเดียวกันเป๊ะ — `<div className="border-border/70 mt-5 ml-1 border-l-2 pl-4">`, หัวข้อ `t('set_sla_work_title')`, ลิสต์ `<ul className="mb-3 space-y-2">`, และปุ่ม `<Button type="button" variant="outline" size="sm" onClick={addWorkTarget} disabled={availableWorkClasses.length === 0}>`

แต่ละแถวประกอบด้วย: `SearchSelect` ของลักษณะงาน · `Input` ชั่วโมง (min 1 max 8760) · `SearchSelect` ของ clock (สองตัวเลือก) · สวิตช์เปิด/ปิด (ขีดฆ่าชื่อเมื่อปิด เหมือนแถว request type) · ปุ่มลบ

เพิ่ม `clock` select ลงในแถว request-type และแถว priority ด้วย โดยใช้คีย์ `set_sla_clock*` ชุดเดียวกัน

- [ ] **Step 7: ส่งค่าใหม่ตอนเซฟ**

หาบรรทัดที่เรียก `update.mutate(...)` (บรรทัดเดิม ~1524) แล้วเพิ่มคีย์:

```tsx
            {
                ticket_sla: draft,
                ticket_sla_request: reqTargets,
                ticket_sla_work_class: workTargets,
                ticket_sla_response: respTarget,
                ticket_sla_hours: hours,
            },
```

- [ ] **Step 8: ตรวจ**

```
npx tsc --noEmit
npm run build
```

Expected: 0 error / build ผ่าน

- [ ] **Step 9: Commit**

```bash
git add resources/js/modules/settings resources/js/shared/types/index.ts resources/js/lang/en/settings.ts resources/js/lang/th/settings.ts
git commit -m "feat(settings): repair targets get a list, and every target names its clock"
```

---

## Task 11: ไดอะล็อกจัดประเภท + ป้ายในรายการ

**Files:**
- Create: `resources/js/modules/ticket/components/ticket-work-class-modal.tsx`
- Modify: `resources/js/modules/ticket/api/ticketApi.ts`
- Modify: `resources/js/modules/ticket/hooks/use-tickets.ts`
- Modify: `resources/js/modules/ticket/components/ticket-detail-drawer.tsx`
- Modify: `resources/js/modules/ticket/pages/index.tsx` (badge ในตาราง)
- Modify: `resources/js/modules/ticket/index.ts` (barrel ถ้าต้อง export)
- Modify: `resources/js/lang/{en,th}/ticket.ts`

**Interfaces:**
- Consumes: `PATCH /api/tickets/{id}/work-class` (Task 6), `ticket.work_class` + `sla_target` (Task 7)
- Produces: `useSetTicketWorkClass()` mutation hook

- [ ] **Step 1: เพิ่ม api + hook**

`ticketApi.ts` — ต่อจาก call ที่เรียก `/updates`:

```ts
    setWorkClass: (id: number, payload: { work_class: TicketWorkClass; reason: string }) =>
        axios.patch(`/api/tickets/${id}/work-class`, payload).then((r) => r.data),
```

`use-tickets.ts` — คู่ขนานกับ hook ของ update:

```ts
/** จัดประเภทลักษณะงาน — เดดไลน์ของเคสขยับตาม จึงต้อง invalidate ทั้งรายการและตัวสรุป */
export function useSetTicketWorkClass() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...payload }: { id: number; work_class: TicketWorkClass; reason: string }) =>
            ticketApi.setWorkClass(id, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tickets'] });
            qc.invalidateQueries({ queryKey: ['ticket-summary'] });
        },
    });
}
```

> เปิด `use-tickets.ts` ดู queryKey จริงของ list/summary ก่อนเขียน แล้วใช้ให้ตรง

- [ ] **Step 2: เพิ่มคีย์ภาษา**

`resources/js/lang/en/ticket.ts`:

```ts
    // ticket-work-class-modal.tsx — จัดประเภทลักษณะงาน
    ticket_work_class: 'Kind of work',
    ticket_work_class_change: 'Change kind of work',
    ticket_work_class_standard: 'Standard work',
    ticket_work_class_repair_internal: 'Repair (in-house)',
    ticket_work_class_repair_vendor: 'Repair (vendor)',
    ticket_work_class_reason: 'Why this is repair work',
    ticket_work_class_reason_hint: 'Goes on the case timeline, where the person who reported it will read it.',
    ticket_work_class_deadline_from: 'Deadline now',
    ticket_work_class_deadline_to: 'Deadline after this change',
    ticket_work_class_no_rule: 'No target is set for this kind of work yet, so the deadline will not move.',
    // pages/index.tsx — การ์ด KPI และป้ายในตาราง
    ticket_repair_badge: 'Repair',
    ticket_repair_kpi: 'Repair KPI met',
    ticket_repair_backlog: '{n} still open',
    ticket_sla_met_standard: 'Standard cases closed in SLA',
```

`resources/js/lang/th/ticket.ts` — comment กลุ่มเดียวกัน เรียงเหมือนกัน:

```ts
    // ticket-work-class-modal.tsx — จัดประเภทลักษณะงาน
    ticket_work_class: 'ลักษณะงาน',
    ticket_work_class_change: 'เปลี่ยนลักษณะงาน',
    ticket_work_class_standard: 'งานปกติ',
    ticket_work_class_repair_internal: 'ซ่อมโดยช่างในองค์กร',
    ticket_work_class_repair_vendor: 'ซ่อมโดย vendor',
    ticket_work_class_reason: 'ทำไมถึงเป็นงานซ่อม',
    ticket_work_class_reason_hint: 'ข้อความนี้ขึ้นบนไทม์ไลน์ของเคส ผู้แจ้งจะได้อ่าน',
    ticket_work_class_deadline_from: 'เดดไลน์ตอนนี้',
    ticket_work_class_deadline_to: 'เดดไลน์หลังเปลี่ยน',
    ticket_work_class_no_rule: 'ยังไม่มีเป้าหมายสำหรับลักษณะงานนี้ เดดไลน์จึงไม่ขยับ',
    // pages/index.tsx — การ์ด KPI และป้ายในตาราง
    ticket_repair_badge: 'งานซ่อม',
    ticket_repair_kpi: 'ปิดงานซ่อมทัน KPI',
    ticket_repair_backlog: 'ยังไม่ปิด {n} เคส',
    ticket_sla_met_standard: 'ปิดงานปกติทัน SLA',
```

- [ ] **Step 3: สร้าง modal**

`resources/js/modules/ticket/components/ticket-work-class-modal.tsx` — clone โครงจาก `ticket-update-modal.tsx` (91 บรรทัด, เปิดอ่านก่อน แล้วทำตามรูปเดิมทุกอย่าง: Dialog, footer, ปุ่ม loading state)

เนื้อในต่างจากตัวเดิมตรงนี้:
- `SearchSelect` ของลักษณะงาน 3 ตัวเลือก
- `textarea` เหตุผล (min 5 ตัวอักษร ให้ตรงกับ backend) พร้อม hint `ticket_work_class_reason_hint`
- **แถบเดดไลน์เก่า → ใหม่** อ่านจาก `ticket.sla_resolve_due_at` เทียบกับเป้าหมายของ class ที่เลือก · ถ้าหา target ของ class ที่เลือกไม่เจอ ให้ขึ้น `ticket_work_class_no_rule` แทนตัวเลข
- validation ฝั่ง UX ตามมาตรฐานโปรเจกต์: border แดง + helper text แดง + shake banner + ปุ่ม loading

- [ ] **Step 4: ต่อเข้ากับ drawer**

`ticket-detail-drawer.tsx` — ใกล้ ๆ ปุ่มเขียนบันทึกความคืบหน้า เพิ่มปุ่ม `ticket_work_class_change` gate ด้วย `can('tickets.set_work_class')` **และ** `ticket.assignee_id === me.id` **และ** `ticket.status === 'in_progress'` (ให้ตรงกับ guard ฝั่ง server — ปุ่มที่กดแล้วได้ 403 คือปุ่มที่ไม่ควรโชว์)

แสดงลักษณะงานปัจจุบันเป็นข้อความข้างปุ่มเมื่อไม่ใช่ `standard`

- [ ] **Step 5: ป้ายในตาราง**

`resources/js/modules/ticket/pages/index.tsx` — ในคอลัมน์ที่แสดง SLA/สถานะ เพิ่ม badge `ticket_repair_badge` เมื่อ `row.work_class` ไม่ใช่ `standard`

เหตุผลที่ต้องมี: เคสซ่อมที่วิ่งมา 20 วันจะดูเหมือนกำลังจะหลุด ทั้งที่มีเวลาเหลืออีก 10 วัน

- [ ] **Step 6: ตรวจ**

```
npx tsc --noEmit
npm run build
```

Expected: 0 error / build ผ่าน

- [ ] **Step 7: Commit**

```bash
git add resources/js/modules/ticket resources/js/lang/en/ticket.ts resources/js/lang/th/ticket.ts
git commit -m "feat(ticket): classify the work, and see what it does to the deadline first"
```

---

## Task 12: การ์ด KPI งานซ่อม

**Files:**
- Modify: `resources/js/modules/ticket/pages/index.tsx:716–722` (แถวการ์ด KPI)
- Modify: `resources/js/shared/types/index.ts:447–452` (summary type)

**Interfaces:**
- Consumes: `repair_kpi_met_pct`, `repair_kpi_delta_pts`, `repair_backlog`, `has_repair_rules` (Task 9) · คีย์ภาษาจาก Task 11

- [ ] **Step 1: เพิ่มคีย์ใน summary type**

`resources/js/shared/types/index.ts` ถัดจาก `sla_met_pct`:

```ts
    repair_kpi_met_pct: number | null;
    repair_kpi_delta_pts: number | null;
    repair_backlog: number;
    has_repair_rules: boolean;
```

- [ ] **Step 2: เพิ่มการ์ด และแก้ป้ายของการ์ดเดิม**

`resources/js/modules/ticket/pages/index.tsx` — ที่บล็อกการ์ด (~บรรทัด 716–722):

```tsx
                                    <Kpi
                                        label={summary?.has_repair_rules ? t('ticket_sla_met_standard') : t('ticket_sla_met')}
                                        value={summary?.sla_met_pct == null ? '—' : `${summary.sla_met_pct}%`}
                                    />
                                    {/* งานซ่อมวัดด้วย KPI ของตัวเอง — การ์ดโผล่เฉพาะเมื่อมีกฎ ไม่งั้น
                                        องค์กรที่ไม่ได้ใช้ฟีเจอร์นี้จะเห็นการ์ดที่ขึ้น "—" ตลอดกาล */}
                                    {summary?.has_repair_rules && (
                                        <Kpi
                                            label={t('ticket_repair_kpi')}
                                            value={summary.repair_kpi_met_pct == null ? '—' : `${summary.repair_kpi_met_pct}%`}
                                            hint={t('ticket_repair_backlog').replace('{n}', String(summary.repair_backlog))}
                                        />
                                    )}
```

> เปิดคอมโพเนนต์ `Kpi` ที่ใช้อยู่ตรงนั้นก่อน แล้วใช้ prop ให้ตรงของจริง — ถ้าไม่มี prop `hint` ให้วาง backlog เป็นบรรทัดเล็กใต้ค่าตามรูปที่การ์ดอื่นใช้

**ป้ายของการ์ดเดิมแคบลงเฉพาะตอนที่การ์ด KPI โชว์อยู่** — ถ้ายังไม่มีกฎ `work_class` ตัวเลขก็ยังครอบทุกเคสจริง ๆ ป้ายเดิมถูกอยู่แล้ว

- [ ] **Step 3: ตรวจ**

```
npx tsc --noEmit
npm run build
```

Expected: 0 error / build ผ่าน

- [ ] **Step 4: รันทั้ง suite + lint ปิดงาน**

```
php artisan test --compact
npx eslint resources/js --max-warnings=0
vendor/bin/pint --dirty --format agent
```

Expected: ทุกตัวเขียว · eslint 0 error · pint passed

- [ ] **Step 5: Commit**

```bash
git add resources/js/modules/ticket/pages/index.tsx resources/js/shared/types/index.ts
git commit -m "feat(ticket): the repair KPI gets a card of its own"
```

- [ ] **Step 6: เขียนสรุปลง Readme.md**

เพิ่มหัวข้อท้ายไฟล์ตามรูปแบบเดิมของโปรเจกต์:

```markdown
### SLA: งานซ่อมยาวมีเป้าหมายของตัวเอง — `work_class` และนาฬิกาต่อแถว (2026-09-16)
```

เนื้อหาครอบ: ที่มา (เคส Network ไม่ใช่งานชนิดเดียว · KPI 30/45 วัน) · scope ที่สามและเหตุผลที่ชนะ `request_type` · `standard` ไม่ match กฎไหนคือสิ่งที่ทำให้ปลอดภัย · นาฬิกาสองโหมด · guard rails และความต่างจาก Pending ที่ถอนไป · การแยกตัวเลข SLA กับ KPI · และบล็อก **Tests / Verification** ที่ระบุจำนวนเทสต์จริงที่รันได้

```bash
git add Readme.md
git commit -m "docs: record the work-class SLA round"
```

---

## Self-Review

**Spec coverage** — ไล่ทีละหัวข้อของ spec:

| Spec | Task |
|---|---|
| §4.1 `TicketWorkClass` + คอลัมน์ | Task 1 |
| §4.2 `SlaScope::WorkClass` + precedence | Task 2 |
| §4.3 `sla_targets.clock` | Task 1 (คอลัมน์) + Task 8 (บันทึกค่า) |
| §5.1 `targetFor()` คืน clock · `rules()` โครงใหม่ | Task 2 |
| §5.2 นาฬิกาสองโหมด · response เป็น business เสมอ · pct ตรงโหมด | Task 3 |
| §5.3 take/assign ไม่ทับ | Task 4 |
| §6.1 permission สามที่ | Task 5 |
| §6.2 บังคับเหตุผล ลง timeline ไม่เพิ่มคอลัมน์ | Task 6 |
| §6.3 โชว์เดดไลน์เก่า→ใหม่ | Task 11 Step 3 |
| §6.4 AuditLog | Task 6 Step 4 |
| §6.5 ตั้งกลับเป็น standard | Task 6 (เทสต์ + endpoint รับ `standard`) |
| §6.6 เฉพาะเคส in_progress ที่ตัวเองถือ · ไม่ใช่พารามิเตอร์ของ take | Task 6 Step 4 + Task 11 Step 4 |
| §7 แยกสองตัวเลข + `repair_backlog` + เคสตกกลุ่มตาม work_class ปัจจุบัน | Task 9 |
| §7.4 ซ่อนการ์ดเมื่อไม่มีกฎ + แก้ป้ายการ์ดเดิม | Task 12 Step 2 |
| §8 Settings list · drawer · badge · resource · i18n | Task 8, 10, 11 |
| §9 migration ไม่ขยับอะไร + parity test | Task 1 Step 1 & 8 |
| §10 เทสต์ทุกหมวด | Task 1–9 (แต่ละ task มีเทสต์ของตัวเอง) |
| §11 YAGNI | ไม่มี task ไหนแตะ Pending / category scope / approval workflow / DashboardSummaryService |

ไม่มีช่องว่าง

**Placeholder scan** — ไม่มี TBD/TODO · ทุก step ที่เป็นโค้ดมีโค้ดจริง · จุดที่เขียนว่า "เปิดไฟล์ X ดูรูปจริงก่อน" เป็นการชี้ไปที่ pattern ที่มีอยู่ในรีโปแล้ว ไม่ใช่การเลี่ยงเขียนรายละเอียด

**Type consistency**
- `TicketWorkClass::repairValues()` นิยามที่ Task 1 → ใช้ที่ Task 8 Step 3 ✓
- `TicketWorkClass::isRepair()` นิยามที่ Task 1 → ใช้ที่ Task 2 Step 6 และ Task 9 Step 3 ✓
- `TicketSla::addMinutesOn()` / `minutesBetweenOn()` นิยามที่ Task 3 → ใช้ที่ Task 3 เอง ✓
- `TicketService::setWorkClass()` นิยามที่ Task 6 Step 3 → เรียกที่ Task 6 Step 4 ✓
- `rules()` เปลี่ยนโครงที่ Task 2 Step 4 → call site ที่ต้องแก้คือ `targets()` (Step 5) และ `targetFor()` (Step 6) และที่ Task 9 Step 3 อ่าน `rules()[SlaScope::WorkClass->value]` ซึ่งเช็คแค่ว่าว่างไหม ไม่แตะรูปข้างใน ✓
- `TicketSlaWorkClassTarget` นิยามที่ Task 10 Step 4 → ใช้ที่ Task 10 Step 6 ✓
- คีย์ภาษา `ticket_sla_met_standard` / `ticket_repair_kpi` / `ticket_repair_backlog` นิยามที่ Task 11 Step 2 → ใช้ที่ Task 12 Step 2 ✓ (Task 11 มาก่อน Task 12 ตามลำดับ)
