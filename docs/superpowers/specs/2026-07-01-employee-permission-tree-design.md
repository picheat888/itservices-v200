# Employee Control — Stock-style Permission Tree

**Date:** 2026-07-01
**Module:** Permission Management (Role Template) + Employee Management
**Goal:** ปรับ card สิทธิ์ **Employee Control** ในหน้า Role Template ให้มีรูปแบบการใช้งานแบบ **master → view → management tree with cascade** เหมือน Stock Module พร้อม **full enforcement** (frontend + backend) mirror จาก Stock

---

## 1. Background / Current State

- **Stock** ใช้ `StockPermissionTree` (frontend) + `Permissions::stockHierarchy()` / `normalizeStock()` (backend): master `stock.module` คุมทั้งโมดูล + ไอคอน sidebar → view groups (มี chip "View") → management children แบบ cascade. Controllers enforce ด้วย `abort_unless($user?->hasPermission('stock.xxx'), 403)` ต่อ method
- **Employees** ปัจจุบันเป็น card list ธรรมดา (fallback ในหน้า permissions) มี keys: `view, add, import, edit, edit_own, reset_password, resign, cancel_resign, set_credentials`
  - เมนู sidebar `/employees` gate ด้วย `employees.view`
  - หน้า Employees มี **6 tabs**: dashboard / directory / sections / departments / positions / orgchart
  - Directory management (add/edit/import/reset_password/resign/cancel_resign/set_credentials) ใช้สิทธิ์ granular `employees.*` และ enforce ใน `EmployeeController` แล้ว
  - **Section / Department / Position CRUD + Dashboard + Org chart** ปัจจุบัน gate ด้วย `role === 'super'` (`User::canManageOrg()`) แบบ hardcode — store/update ของ org controllers **ไม่มี** backend check เลย มีแค่ `destroy` เช็ค `canManageOrg()`
  - `allow_special_position` (per-position toggle) = super เท่านั้น

---

## 2. Target Design

### 2.1 Permission Key Hierarchy (catalog module `employees`)

```
employees.module               ← MASTER (คุมโมดูล + ไอคอน sidebar; เหมือน stock.module)
├─ employees.view_dashboard    (Dashboard tab)          [single-switch, chip:false]
├─ employees.view              (Directory/Employee tab) [View chip]
│   ├─ employees.add
│   ├─ employees.import
│   ├─ employees.edit
│   ├─ employees.reset_password
│   ├─ employees.resign
│   ├─ employees.cancel_resign
│   └─ employees.set_credentials
├─ employees.view_section      (Sections tab)           [View chip]
│   ├─ employees.section_add
│   ├─ employees.section_edit
│   └─ employees.section_delete
├─ employees.view_department   (Departments tab)        [View chip]
│   ├─ employees.department_add
│   ├─ employees.department_edit
│   └─ employees.department_delete
├─ employees.view_position     (Positions tab)          [View chip]
│   ├─ employees.position_add
│   ├─ employees.position_edit
│   ├─ employees.position_delete
│   └─ employees.position_special   (toggle allow_special_position)
├─ employees.view_org          (Org chart tab)          [single-switch, chip:false]
└─ employees.edit_own          ← STANDALONE (ไม่ถูก master ปิด — self-service)
```

**เหตุผลการออกแบบ**
- `employees.edit_own` แยกจาก cascade เพราะ role `user` ทั่วไปต้องแก้โปรไฟล์ตัวเองได้เสมอ แม้ปิด master. Render เป็น standalone switch ที่ไม่ถูก master lock (คล้ายสิทธิ์พิเศษ)
- `view_dashboard` / `view_org` เป็น single-switch group (ไม่มี management children, `chip:false`) เหมือน `stock.view_count` / `stock.view_events`
- key ทั้งหมดอยู่ใต้ catalog module เดียว (`employees`) — prefix `employees.` ทุกตัว

### 2.2 Cascade Behavior (mirror Stock)

Frontend component ใหม่ `EmployeePermissionTree` (คู่ขนานกับ `StockPermissionTree`) + backend `Permissions::employeeHierarchy()` + `normalizeEmployees()`:

- ปิด **master** (`employees.module`) → clear + lock **ทุก** key ใต้ tree (ยกเว้น `edit_own`)
- ปิด **view group** (เช่น `employees.view_section`) → clear + lock children ของกลุ่มนั้น
- เปิด **child** → auto เปิด view group ของมัน + master
- เปิด **view group** → auto เปิด master
- `employees.edit_own` = toggle อิสระ ไม่ผูกกับ master/cascade

`normalizeEmployees()` ทำงานเหมือน `normalizeStock()`: ถ้าไม่มี master → ตัด `employees.*` ทั้งหมดออก **ยกเว้น `employees.edit_own`**; ถ้ามี master แต่ไม่มี view group ใด → ตัด children ของกลุ่มนั้นออก

### 2.3 Enforcement

**Write-level (full backend enforcement — mirror Stock):**
เพิ่ม `abort_unless($request->user()?->hasPermission('employees.xxx'), 403)` ต่อ method:

| Controller | Method | Permission |
|---|---|---|
| SectionController | store / update / destroy | `employees.section_add` / `section_edit` / `section_delete` |
| DepartmentController | store / update / destroy | `employees.department_add` / `department_edit` / `department_delete` |
| PositionController | store / update / destroy | `employees.position_add` / `position_edit` / `position_delete` |
| PositionController | update (เมื่อ `allow_special_position` เปลี่ยน) | `employees.position_special` |
| EmployeeController | orgChart | `employees.view_org` (เดิม `employees.view`) |
| EmployeeController | summary | `employees.view_dashboard` |

- แทนที่ `canManageOrg()` (super-only) ที่ใช้ใน org `destroy` ด้วยสิทธิ์ granular ใหม่
- `position_special`: ใน `PositionController::update` ถ้า payload พยายามเปลี่ยนค่า `allow_special_position` ให้ต่างจากเดิม → ต้องมี `employees.position_special` (ไม่งั้น 403 หรือ ignore field). Field อื่น update ได้ด้วย `position_edit`

**View-level (tab visibility + safe browse gating):**
- **Frontend**: ซ่อน/แสดงแต่ละ tab ตามสิทธิ์ `view_*` (เหมือน Stock ซ่อน tab). Sidebar nav เปลี่ยน gate `/employees` เป็น `employees.module`
- **Backend browse gating** (เฉพาะ endpoint ที่เป็นการ browse ของ tab นั้น ไม่ใช่ reference read):
  - `employees/summary` → gate `employees.view_dashboard`
  - `employees/org-chart` → gate `employees.view_org`
  - directory browse: `employees` index **เมื่อมี `?page=`** → gate `employees.view`
- **สำคัญ — คง reference reads เปิดไว้**: list endpoints ของ `departments` / `positions` / `sections` / `employees` (แบบไม่ paginate) ถูกใช้เป็น **dropdown/picker ข้ามโมดูล** (Asset / Contract / Ticket / Access forms) → **ไม่** gate ด้วย `view_*` เพื่อไม่ให้ฟอร์มที่อื่นพัง

### 2.4 Defaults per Role + Migration Backfill

- **Migration/seed backfill** (ไม่ให้ของจริงพัง): ทุก role ที่ปัจจุบันมี `employees.view` → เพิ่ม `employees.module`, `employees.view_dashboard`, `employees.view_org` ให้อัตโนมัติ (ไม่งั้น sidebar หาย/tab หาย)
- `Permissions::defaults()`:
  - `admin` → เพิ่ม `employees.module`, `view_dashboard`, `view_org`, `view_section`, `view_department`, `view_position` (อ่าน org ได้)
  - `hr` → เพิ่ม `employees.module`, `view_dashboard`, `view_org`, `view_section`, `view_department`, `view_position`
  - `user` → **คงเดิม** (มีแค่ `employees.edit_own`) — `edit_own` เป็น standalone ทำงานได้โดยไม่ต้องมี master; **ไม่** เพิ่ม module ให้ user เพื่อไม่ให้เมนู Employees โผล่ใหม่ (เปลี่ยนพฤติกรรมเดิม)
- **Org CRUD (`section_*`, `department_*`, `position_*`, `position_special`) → default: super เท่านั้น** (คงพฤติกรรมเดิม; grant เพิ่มได้ภายหลังผ่าน Role Template)

> **หมายเหตุ `edit_own` + normalize**: `normalizeEmployees()` ต้องไม่ตัด `employees.edit_own` แม้ role ไม่มี `employees.module` — ไม่งั้น role `user` จะเสียสิทธิ์แก้โปรไฟล์ตัวเองทันทีที่บันทึก Role Template

### 2.5 i18n Labels + LIVE set

- เพิ่ม label (en/th) ทุก key ใหม่ใน `permission-labels.ts` (`ACTIONS`)
- เพิ่มทุก key ใหม่ใน `LIVE` set (enforced จริง ไม่ใช่ coming-soon)

---

## 3. Affected Files

**Backend**
- `app/Support/Permissions.php` — catalog (employees keys ใหม่), `employeeHierarchy()`, `normalizeEmployees()`, `defaults()`
- `app/Http/Controllers/Api/RolePermissionController.php` — เรียก `normalizeEmployees()` ใน `update()`
- `app/Http/Controllers/Api/SectionController.php` — gate store/update/destroy
- `app/Http/Controllers/Api/DepartmentController.php` — gate store/update/destroy
- `app/Http/Controllers/Api/PositionController.php` — gate store/update/destroy + special
- `app/Http/Controllers/Api/EmployeeController.php` — gate summary (`view_dashboard`), orgChart (`view_org`), directory browse (`view`)
- `database/migrations/` — backfill migration (grant module/view_dashboard/view_org ให้ role ที่มี employees.view)
- `database/seeders/` — sync defaults ถ้ามี permission seeder

**Frontend**
- `resources/js/components/permissions/employee-permission-tree.tsx` — **ใหม่** (mirror stock-permission-tree.tsx)
- `resources/js/pages/permissions/index.tsx` — render `EmployeePermissionTree` แทน fallback card สำหรับ module `employees`
- `resources/js/lib/permission-labels.ts` — labels + LIVE
- `resources/js/lib/nav.ts` — `/employees` gate → `employees.module`
- `resources/js/pages/employees/index.tsx` — gate tab visibility ด้วย `view_*`; แทน `canManageOrg` ด้วยสิทธิ์ granular สำหรับปุ่ม add/edit/delete/special ของ section/dept/position

**Tests**
- `tests/Unit/` — EmployeePermissionHierarchyTest (mirror StockPermissionHierarchyTest): cascade/normalize
- `tests/Feature/` — EmployeePermissionGatingTest: writes 403 เมื่อไม่มีสิทธิ์, 200 เมื่อมี; reference reads (dropdown) ยังเปิด; edit_own ไม่ถูก master ตัด

---

## 4. Out of Scope / Non-goals

- ไม่แตะ module อื่น (Stock/Assets/Contracts/Tickets) นอกจากการยืนยันว่า dropdown/picker ไม่พัง
- ไม่เพิ่ม view-level gating บน reference-read endpoints (โดยเจตนา — กัน dropdown ข้ามโมดูลพัง)
- ไม่เปลี่ยน UI ของ tabs หน้า Employees นอกจากการซ่อน/แสดงตามสิทธิ์และซ่อนปุ่ม action

---

## 5. Risks

- **Cross-module pickers**: mitigation = ไม่ gate reference reads (ข้อ 2.3). ต้องมี feature test ยืนยัน
- **Live data**: mitigation = backfill migration grant master/view ให้ role เดิม (ข้อ 2.4) — sidebar/tab ต้องไม่หายหลัง deploy
- **`position_special` semantics**: ต้องแยกจาก `position_edit` ให้ชัด — เฉพาะการเปลี่ยนค่า `allow_special_position`
