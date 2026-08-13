# Inaba IT Service Desk

ระบบ **IT Service Desk** สำหรับจัดการงาน IT ภายในองค์กร (Inaba Foods)
พัฒนาด้วย **Laravel 12 + React 19 (SPA) + TypeScript + Tailwind CSS v4**

> สถานะปัจจุบัน: **ถึง Phase-11** — Foundation + Employee + Settings + Permission (+ Admin protection) + Email + Contract & Rental (+ expiry alerts) + Master Data lookups + Stock/Inventory (Items + Min/Max alerts + Dashboard + RBAC + Movements + Request workflow) + **Assets Management (Inventory + Dashboard + Transfer/Accept/Return + Bulk + Asset→Stock + Contract link)** + Org Approval Chain (foundation: manager tree → VP ceiling) + Org Chart tab + Sections (หน่วยงาน)

---

## สถาปัตยกรรม (Architecture)

| Layer | Technology |
|-------|-----------|
| Backend | Laravel 12 (PHP 8.2+) |
| Auth | **Laravel Sanctum** (cookie-based SPA) |
| Frontend | React 19 + TypeScript (**SPA**, ไม่ใช่ Inertia) |
| Routing (FE) | react-router-dom |
| Server state | **TanStack React Query** |
| UI state | **Zustand** (persist) |
| HTTP | axios (`withCredentials` + CSRF) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| Icons | lucide-react |
| Database | MySQL |

> **หมายเหตุ:** โปรเจกต์เริ่มจาก Laravel React Starter Kit (Inertia) แต่ได้ **ถอด Inertia + Ziggy ออกทั้งหมด** แล้วเปลี่ยนเป็น Sanctum SPA + React Query ตามที่กำหนดใน `CLAUDE.md`

---

## Phase-1 — Foundation (สิ่งที่ทำเสร็จแล้ว)

### Backend
- ติดตั้งและตั้งค่า **Sanctum SPA** — stateful API, CORS `supports_credentials`, stateful domains ใน `.env`
- **ถอด Inertia + Ziggy** ออกหมด (composer/npm packages, middleware, controllers, ssr, blade)
- **Auth API** (response format มาตรฐาน `{ data, message }`)
  - `POST /api/login` · `POST /api/logout` · `GET /api/me`
  - `GET /sanctum/csrf-cookie`
- `routes/web.php` เป็น **SPA catch-all**, `app.blade.php` mount React ที่ `#app`
- **Role system** — `App\Enums\UserRole` (super / admin / hr / user) + column `users.role`
- Seeder สร้าง demo users 4 role

### Frontend
- **SPA bootstrap** — react-router + React Query + axios (`services/http.ts` มี `ensureCsrf`) + `ProtectedRoute` ตาม role
- **Theme** — ฟอนต์ Manrope + JetBrains Mono, accent น้ำเงิน (slate enterprise), dark mode, density, radius scale
- **i18n EN/TH** (`lib/i18n.ts`) + ปุ่มสลับภาษาธงชาติ
- **Zustand UI store** (`stores/ui.ts`) — dark / lang / density / radius / sidebar style / branding (persist)
- **App Shell**
  - Sidebar: nav แยกตาม role, collapse/icon mode, brand mark, ปุ่ม sign out
  - Topbar: hamburger, breadcrumb, search, ปุ่มภาษา 🇬🇧/🇹🇭, dark toggle 🌙/☀️, กระดิ่ง, Tweaks
  - Notifications dropdown · Profile drawer · Tweaks panel
- **Shared UI** — DataTable (search + pagination 20/50/100), StatusBadge, Field
- หน้า Login + Dashboard (foundation) + placeholder ของ 11 โมดูล

### ผลการตรวจสอบ
- ✅ `npm run build` (Vite) — ผ่าน
- ✅ `tsc --noEmit` — สะอาด
- ✅ `eslint` — สะอาด
- ✅ Auth flow (curl): login → me → logout → 401 หลัง logout — ถูกต้อง
- ✅ ตรวจ UI ในเบราว์เซอร์ (Playwright): login, dashboard, dark mode, ภาษาไทย, Tweaks panel — ทำงานครบ

---

## Phase-2 (สิ่งที่ทำเสร็จแล้ว)

### 1. Employee module
- **Backend**: ตาราง `departments` / `positions` / `employees` + Models + `EmployeeStatus` enum + `OrgSeeder` (ข้อมูลจาก prototype) + API CRUD + endpoint `POST /api/employees/{id}/resign` + `EmployeeService`
- **Frontend** (`/employees`): 4 sub-tabs — Dashboard (KPI + headcount + recent hires), รายชื่อพนักงาน (DataTable + filter แผนก), Positions (CRUD), Departments (cards + ดูสมาชิก + CRUD); employee view drawer, Add Employee form, position/department modals
- **สิทธิ์**: super จัดการ Positions/Departments ได้; super + HR จัดการพนักงานได้
- บันทึกลาออก → เปลี่ยนสถานะเป็น Resigned (การคืน asset รอโมดูล Assets)

### 2. Settings module
- **Branding** (ใช้งานได้จริง): แก้ชื่อแบรนด์ / ข้อความรอง / สีธีม (accent 7 สี) บันทึกลงตาราง `app_settings` ผ่าน `SettingsController` (เฉพาะ super) แล้ว hydrate ทั้งระบบด้วย `useHydrateSettings` — เปลี่ยนแล้วมีผลทันทีที่ sidebar / login / แท็บเบราว์เซอร์ และคงอยู่หลัง reload
- sub-tabs อื่น (Tickets/SLA, Assets, Email, Security) เป็น placeholder รอโมดูลที่เกี่ยวข้อง

### 3. Dynamic page titles
- ชื่อแท็บเบราว์เซอร์เปลี่ยนตามเมนู รูปแบบ **"`<Module>` - IT Services V2.0"** (`useDocumentTitle`)

**ส่วนที่รอโมดูลอื่น (deferred):** การกำหนด role/group ตอนเพิ่มพนักงาน → Permissions · onboarding requests → Requests · คืน asset ตอนลาออก → Assets

**ตรวจสอบ**: `tsc` ✅ · `eslint` ✅ · `build` ✅ · API (curl) ✅ · UI ในเบราว์เซอร์ (Playwright): Employee 4 tabs + view drawer, Settings branding เปลี่ยนสี+persist หลัง reload ✅

---

## Phase-2.1 – 2.13 (การปรับย่อยที่ทำเพิ่ม)

**Settings & Display**
- **Branding**: เพิ่มอัปโหลด **โลโก้** (PNG/SVG ≤2MB, ใช้เป็น favicon + brand mark), เพิ่ม **Company information** (ชื่อบริษัท/legal/tax/อุตสาหกรรม/ที่อยู่/ประเทศ/สกุลเงิน/เขตเวลา) — ทุกอย่างกด **Save** เสมอ
- **Display** (per-user): Theme color / Density / Corner radius เก็บใน `users.preferences` (JSON) ผ่าน `PUT /api/preferences` — คงค่าหลัง sign out; ย้ายออกจาก topbar มาไว้ในเมนู Settings (กด Save), เอา Dark/Language/Sidebar ออก (มีปุ่มบน topbar แล้ว)
- **Locations**: lookup ใหม่ — ตาราง `locations` + `/api/locations` CRUD (เขียนเฉพาะ super) จัดการที่ Settings → Locations นำไปใช้ที่อื่นได้ (เช่น dropdown Location ของแผนก)
- Settings เป็น **Card เดียว** (nav ซ้าย + เนื้อหาขวา), active = สีธีม; ลำดับ: Company → Branding → Display → Locations → (placeholder)

**Shell / Theme**
- Sidebar + Header สีขาว, body canvas **#F6F8FB**; active module ใช้สีธีม; ย่อ sidebar ซ่อนปุ่ม Sign out
- ปรับ typography/ตาราง/search ให้ใกล้ Claude Design (uppercase table header, ช่องค้นหา + ⌘K, letter-spacing)

**Overview Dashboard**
- KPI cards มีไอคอน (Open tickets / Pending requests / Total assets / Contracts expiring); Recent tickets เป็นการ์ดขาว + ไอคอน (หัวการ์ด + แต่ละแถว); การ์ดที่ยังไม่มีข้อมูล (Tickets overview / Team workload / Recent activity) แสดง **Coming soon**

**Employee Module**
- Tabs อยู่ใน Card เดียวกับเนื้อหา (ไม่มี scroll); KPI cards มีไอคอน
- รายชื่อพนักงาน: คอลัมน์ Email / Joined / Actions (⋯), หัว ID = "รหัสพนักงาน", ช่องค้นหา (ชื่อ/รหัส) อยู่บรรทัดเดียวกับ filter แผนก
- **Add/Edit Employee**: wizard 3 step (Personal / Work / System Access) + อัปโหลดรูป/อวตารเริ่มต้น + validate ไทย + Start date (format ซ้าย, ปฏิทินขวา); แก้ไขผ่าน ⋯ menu และปุ่ม Edit ใน view drawer
- **Record resignation**: modal เตือน + Last working day* + Reason* + Assets to return (Coming soon)
- Positions/Departments: toolbar "All … across the organization" ซ้าย + ปุ่มเพิ่มขวา; Department modal: Department (EN)/(TH), Head = dropdown ค้นหาพนักงาน, Location = dropdown จาก Settings; เอาลูกศรหลังจำนวน member ออก

**ไฟล์ที่เพิ่ม**: `services/preferencesApi.ts`, `services/settingsApi.ts`, `services/orgApi.ts` · `hooks/use-user-preferences.ts`, `use-settings.ts`, `use-org.ts` · `components/shared/searchable-select.tsx` · `app/Models/{Location,AppSetting}.php` · `app/Http/Controllers/Api/{Settings,Location}Controller.php`

> ทุก Phase ผ่าน `tsc` / `eslint` / `build` และตรวจ UI ในเบราว์เซอร์ (Playwright) แล้ว

---

## Phase-3 — Permission Management (#7) + Login & Employee Credentials (เสร็จสมบูรณ์)

> รวมงานย่อย Phase-3.1 – 3.13 และส่วนที่สั่งปรับเพิ่มทั้งหมดไว้ในสรุปเดียว

### 1. Login & Authentication
- รับ **Email หรือ Username** ช่องเดียว + password (`username` unique ใน `users`); `LoginRequest` ตรวจว่าเป็นอีเมลหรือ username แล้ว `Auth::attempt` ตามนั้น
- `users.email` เป็น **nullable** เพื่อรองรับบัญชีแบบ username-only
- **Demo accounts** (password: `password`, ล็อกอินด้วย username หรืออีเมลก็ได้, คลิกเลือกได้ในหน้า login):
  | กลุ่ม | username | email |
  |------|----------|-------|
  | Super Admin | `super` | super@inaba.co.th |
  | IT Technician | `it` | it@inaba.co.th |
  | HR Officer | `hr` | hr@inaba.co.th |
  | Employee | `user` | user@inaba.co.th |

### 2. RBAC (Roles & Permissions)
- **Catalog** สิทธิ์ 6 โมดูล = **34 keys** (`App\Support\Permissions`); ตาราง `role_permissions` (role/permission/allowed)
  - Employee scope 9 keys: `view · add · import · edit · edit_own · reset_password · resign · cancel_resign · set_credentials`
- `User::permissions()` / `hasPermission()` — Super = สิทธิ์เต็มเสมอ (bypass); role อื่นอ่านจาก DB
- หน้า **Permissions → Roles**: เลือก role → matrix toggle ตามการ์ดโมดูล + Save (persist, super ล็อก); ปรับแล้ว**คุมการเข้าถึงจริง**
- ค่าเริ่มต้น 4 กลุ่ม: Super=ทั้งหมด · IT=สิทธิ์ปฏิบัติการกว้าง (รวม reset_password/resign/cancel_resign/set_credentials) · HR=Employee เต็ม + ticket/request ตัวเอง · Employee=ticket/request ตัวเอง + แก้โปรไฟล์
- **Nav/เข้าถึง** อิง permission แทน role hardcode (เช่น Employee เห็นแค่ Dashboard/Tickets/Requests)
- `lib/permission-labels.ts` มี `LIVE` set แยกสิทธิ์ที่บังคับใช้จริง vs. ติดป้าย "(เร็ว ๆ นี้)"

### 3. Group Roles (Role Template)
- ตาราง `group_roles` + `group_role_employee` (pivot); `GroupRole` model + `GroupRoleController`
- แท็บ **Permissions → Groups**: สร้าง/แก้/ลบ group, เลือก role template, กำหนดสมาชิก, ตั้ง default group
- **Auto-sync User.role**: เมื่อพนักงานเข้า/ออก group → `users.role` อัปเดตอัตโนมัติ
- Default group: พนักงานใหม่ถูกเพิ่มเข้า group นี้อัตโนมัติเมื่อ Add Employee (`default_employee_group_id` ใน `app_settings`)

### 4. Employee Credential Flow
- ผู้มีสิทธิ์ `employees.set_credentials` เป็นผู้ตั้ง **Username/Password** ผ่าน **Dialog** (เปิดจากเมนู ⋯ ใน Employee list เมื่อ `has_account=false` หรือจาก view drawer) — *ไม่มี*การสร้าง User อัตโนมัติแล้ว
- Employee list / view drawer แสดง badge **"มีบัญชีแล้ว / ยังไม่มีบัญชี"**
- `EmployeeController` enforce permission จริง: `resetPassword` · `resign` · `cancelResign` · `credentials`

### 5. Resignation & Cancel Resignation
- **บันทึกลาออก** (`employees.resign`): modal เตือน + Last working day + Reason → สถานะเป็น `Resigned`
- **ยกเลิกการลาออก** (`employees.cancel_resign`): `EmployeeService::cancelResign()` คืนสถานะ `Active` + ล้าง `resign_reason`/`last_day`; controller ตรวจว่าสถานะ `resigned` ก่อน + audit "Cancelled resignation"; route `POST /api/employees/{employee}/cancel-resign`
- **UI**: เมื่อพนักงานลาออก → **ซ่อนปุ่ม/เมนู Edit** และแสดงปุ่ม **"ยกเลิกการลาออก"** (เขียว, ใน view drawer + เมนู ⋯) เฉพาะผู้มีสิทธิ์ พร้อม confirm

### 6. Notifications (in-app)
- ตาราง `notifications` (Laravel standard); `NewEmployeeNotification` (database + mail, queued)
- `NotificationController`: GET `/notifications` (30 ล่าสุด + unread count) · PUT `/notifications/{id}/read` · PUT `/notifications/read-all`
- **Bell icon** บน topbar (unread count, poll 60 วิ) + **dropdown** รายการจริง, คลิก → mark read + navigate ไปหน้า employees พร้อม highlight (amber = ต้องตั้ง credentials, brand = พร้อมใช้)

### 7. Audit Log
- ตาราง `audit_logs` + `AuditLog::record()`; log login/logout, แก้สิทธิ์, สร้าง/แก้/ลบพนักงาน, resign/cancel-resign; หน้า **Permissions → Audit log** แสดงตารางจริง (เวลา/ผู้ใช้/การกระทำ/เป้าหมาย)

### 8. Settings Bug Fixes (ระหว่าง phase)
- Reset Logo deferred (รอ Save ค่อย call API), re-upload ไฟล์เดิมได้หลัง Reset, Settings tab hash (`#branding`/`#company`/…) คงค่าหลัง reload

### 9. Demo Data (`OrgSeeder`)
- พนักงานสถานะ **ลาออก 2 คน** (`EMP-2208`, `EMP-2301`) พร้อม reason/last_day เพื่อทดสอบ cancel-resign
- `seedGroupRoles()`: 3 group (All Staff / IT Team / HR Team), ผูกพนักงาน active เข้า All Staff, ผูก IT/HR ตามแผนก, ตั้ง default group
- ใช้ `updateOrCreate` + `syncWithoutDetaching` (idempotent) — `php artisan db:seed` ซ้ำได้โดยไม่ทับข้อมูลจริง

**ไฟล์หลัก**: `app/Support/Permissions.php` · `app/Models/{RolePermission,AuditLog,GroupRole,Employee}.php` · `app/Services/EmployeeService.php` · `app/Http/Controllers/Api/{RolePermission,AuditLog,GroupRole,Employee,Notification}Controller.php` · `app/Notifications/NewEmployeeNotification.php` · `database/seeders/OrgSeeder.php` · `routes/api.php` · `resources/js/services/{permissionApi,notificationApi,orgApi}.ts` · `hooks/{use-permissions,use-notifications,use-org}.ts` · `lib/{permission-labels,i18n}.ts` · `components/shell/{notifications-dropdown,topbar}.tsx` · `components/employees/employee-view-drawer.tsx` · `pages/{permissions,employees,settings}/index.tsx`

**ตรวจสอบ**: `tsc --noEmit` ✅ · `eslint` ✅ · `build` ✅ · `route:list` ✅ · migration ✅ · `db:seed` (idempotent) ✅ · API (curl): login by username, matrix get/update · เบราว์เซอร์: matrix, audit log จริง, nav จำกัดสิทธิ์, credential dialog, resign/cancel-resign ✅

---

## Phase-4 — Email Notifications Module (#9) (เสร็จแล้ว)

สร้างตาม design bundle (module **08 Email Notifications**) + กลไกส่งอีเมลจริง (scope B) — spec: `docs/superpowers/specs/2026-05-24-phase-4-email-notifications-design.md`

### หน้า Email Notifications (`/email-templates`)
- หัวข้อ + ปุ่ม **Send test email** / **New template**; 4 StatCards: Templates · Enabled · Sent today · Delivery rate (ค่าจริงจาก `email_logs`)
- ตาราง: `ID (ET-xx) | Template | Trigger (badge) | Last sent | Enabled (toggle) | Actions` + ช่องค้นหา
- **Preview drawer**: เรนเดอร์อีเมลจริง (From/To, subject `[Brand] …`, body, ตัวแปร `{{…}}`) + ปุ่มส่งทดสอบรายเทมเพลต
- **Edit drawer** (subject/body/enabled) + **Create dialog** (template ใหม่)
- nav item "Email Templates" gate ด้วย `system.configure_notifications`

### Engine การส่ง (ตาม CLAUDE.md)
- `mail_settings` (single row, password เข้ารหัส) แก้ที่ **Settings → Email** (host/port/user/pass/encryption/from)
- `MailConfigService::apply()` override `config('mail.*')` จาก DB ก่อนส่งทุกครั้ง (`.env` เป็น fallback)
- `TemplatedMail` (Mailable) + `SendTemplatedEmail` (queued Job) → event-driven ส่งผ่าน **Queue**; test email ส่งแบบ synchronous เพื่อ feedback ทันที
- `EmailNotificationService`: `sendTemplate(key,to,vars)` (queued) · `sendTest(to)` · `deliver()` (apply config → ส่ง → log → bump `last_sent_at`)
- `email_logs` บันทึกทุกการส่ง (sent/failed) → ใช้คำนวณ stat cards

### ข้อมูล + การเชื่อม event
- seed **13 templates** (ติ๊กเก็ต/คำขอ/สัญญา/ทรัพย์สิน/digest ตาม design + `employee.account_needed` ของจริง)
- เชื่อม event "พนักงานใหม่": แจ้งเตือนในเว็บ (database, sync) + ส่งอีเมลผ่าน template (queued) ให้ผู้มีสิทธิ์ตั้ง credentials
- triggers จากโมดูลที่ยังไม่สร้าง (tickets/requests/contracts/assets) จัดการ/เปิด-ปิดได้ แต่จะยิงจริงเมื่อมีโมดูลนั้น

**ไฟล์เพิ่ม/แก้**: migrations `*_create_mail_settings/email_templates/email_logs` · `app/Models/{MailSetting,EmailTemplate,EmailLog}.php` · `app/Services/{MailConfigService,EmailNotificationService}.php` · `app/Mail/TemplatedMail.php` · `app/Jobs/SendTemplatedEmail.php` · `app/Http/Controllers/Api/EmailTemplateController.php` · `app/Http/Resources/EmailTemplateResource.php` · `SettingsController` (mail settings + test) · `EmployeeService` (wire email) · `routes/api.php` · `pages/email-templates/index.tsx` · `pages/settings/index.tsx` (EmailTab) · `services/{emailTemplateApi,settingsApi}.ts` · `hooks/use-email-templates.ts` · `app.tsx` · `lib/i18n.ts`

**ตรวจสอบ**: `tsc --noEmit` ✅ · `npm run build` ✅ · migration ✅ · tinker (encrypt/config-override/queue/send) ✅ · test suite ไม่มี fail ใหม่

> **หมายเหตุ dev**: อีเมล event-driven ส่งผ่าน Queue (`QUEUE_CONNECTION=database`) — ต้องรัน `php artisan queue:work` ถึงจะประมวลผล; `MAIL_MAILER=log` จะเขียนลง `storage/logs/laravel.log`

---

## Phase-5 — Employee Import, Notifications UX & Bug Fixes (เสร็จแล้ว)

### 1. Employee — Import & Directory UX
- **Bulk Import (CSV)**: ปุ่ม "นำเข้า" → Dialog: ดาวน์โหลด **template CSV** + เลือกไฟล์ + Save
  - `EmployeeService::importRows()` validate ทุกแถวแบบ **all-or-nothing** (มี error แม้แถวเดียว = ไม่ import เลย พร้อมรายงาน error รายแถว), match แผนก/ตำแหน่งด้วย **code**, เช็ค code/email ซ้ำ (กับ DB + ในไฟล์), ผูก default group, ไม่สร้าง account/ไม่ยิง notification (กัน spam)
  - `GET /employees/import-template` (CSV + UTF-8 BOM), `POST /employees/import`
- **Status filter** (ค่าเริ่มต้น All Status) พร้อม**จุดสีนำหน้า**: All / Active (เขียว) / Has account (น้ำเงิน) / No account (เหลือง) / Resigned (แดง) — กรองฝั่ง server (pagination ถูกต้อง), `no_account`/`has_account` ใช้ `whereNotExists`/`whereExists` เทียบ users
- **เรียงลำดับ**: No account ขึ้นก่อน → Has account → Resigned ท้ายสุด (ในแต่ละกลุ่มเรียงตามชื่อ)
- เปลี่ยน label filter แผนกเป็น **"All Departments"**; Department cards แสดง **4 ใบ/แถว** (xl)
- View drawer เพิ่มบรรทัดสถานะ **"ยังไม่มีบัญชีใช้งาน"** (คู่กับ "มีบัญชีใช้งาน")

### 2. Notifications (#8) — UX
- **Tabs แยกตามโมดูล**: ทั้งหมด · Employee (live) · Ticket/Request/Asset/Contract (Coming soon) — `moduleOf(type)` รองรับ type อนาคตอัตโนมัติ
- **ปิดทีละรายการ** (ปุ่ม X ต่อรายการ) — `DELETE /notifications/{id}`; ไอคอน **เทาเมื่ออ่านแล้ว** / เหลืองเมื่อยังไม่อ่าน
- ขยาย dropdown ให้พอดี 6 แท็บ; **แก้บั๊ก** คลิก notification แล้วค้างหน้า Dashboard → ตอนนี้เด้งไปแท็บ Directory + เปิด view drawer ของพนักงานนั้น (อ่าน `?highlight=<id>`)

### 3. Demo Data
- `NotificationDemoSeeder` — สร้าง notification ทดสอบ (มี read/unread + เวลาไล่ระดับ) ให้ผู้มีสิทธิ์ set_credentials, idempotent ผ่าน marker
- `OrgSeeder::linkDemoAccounts()` — ผูก 4 demo user (super/it/hr/user) เข้ากับ employee (match username) → **แก้บั๊ก** ที่ทุกคนขึ้น "No account" ทั้งที่ login ได้
- `AvatarDemoSeeder` — avatar **การ์ตูนคน** (SVG flat: หน้า/ผม/เสื้อ, 3 ทรงผม short/long/bun) ให้ 3 demo user; wire เข้า `DatabaseSeeder` แล้ว

### Fix Bug
- **Display setting เป็น System (ไม่ใช่ per-user)**: ย้าย theme accent/density/radius จาก `users.preferences` → `app_settings` (ใช้ร่วมทุกคน เหมือน Company/Branding/Email); `useUserPreferences` เหลือเฉพาะ dark/lang/sidebar
- **โหมดมืดชนกับ Theme Color ดำ**: `lib/brand-color.ts` คำนวณ luminance — สีเกือบดำในโหมดมืดถูก lighten เป็นเทาอ่านออก + ตั้ง `--brand-foreground` ตามความสว่าง (ปุ่ม/ข้อความ brand อ่านออกทุกสี/โหมด); swatch ใน Display แสดงสีที่ใช้จริง
- **ปุ่ม Save (Settings)**: 3 สถานะ — ปกติ / spinner หมุน / ติ๊กถูกเด้ง (`SaveButton` + tailwindcss-animate) ใช้ทุกแท็บ
- **favicon ค้าง / default logo**: blade ใส่ `<link rel="icon">` ชี้ `logo.svg` + `setFavicon` fallback เป็น default (favicon.ico เดิมว่าง 0 bytes ไม่ถูกใช้แล้ว); **default web logo** ทั้ง sidebar/login/Branding preview ใช้ `public/logo.svg` แทนตัวอักษรย่อ
- **รูปโปรไฟล์ไม่ขึ้นที่ Sidebar**: `User::employeePhotoUrl()` ดึงรูปจาก employee ที่ลิงก์ (email/username) → `UserResource.photo_url`; sidebar + profile drawer render `AvatarImage`
- **สิทธิ์ Add/Edit Employee ไม่ถูกบังคับใช้จริง (Role Template ไม่มีผล)**: เดิม store/update/import เช็คด้วย role ตายตัว `canManageEmployees() = hasRole('super','hr')` ทำให้ toggle `employees.add`/`employees.edit` ใน Permission Module ไม่มีผล (HR ปิด edit ก็ยังแก้ได้) และปุ่ม Edit จุดไข่ปลาใช้ตัวแปรผิด (`canManageEmployees` แทน `canEdit`) IT จึงไม่เห็นเลยแม้เปิดสิทธิ์ — แก้โดย `StoreEmployeeRequest::authorize()` แยกเป็น `employees.add` (store) / `employees.edit` (update) ผ่าน `hasPermission()`, import/template ใช้ `employees.add`, frontend แยก `canAdd`/`canEdit` อิงสิทธิ์จริง (super bypass) ใช้กับปุ่ม header/card/dropdown/drawer ให้ตรงกัน
- **Sidebar แสดง Permission level จาก Role Group**: เดิมแสดง role label ของ Template (เช่น "IT Technician Template") เปลี่ยนเป็นชื่อ Role Group ที่ผู้ใช้สังกัด (เช่น IT Team / HR Team / All Staff) ซึ่งเป็นที่มาของ role จริง — `UserResource.group_name` เลือกกลุ่มที่ `role` ตรงกับ role ของผู้ใช้ (ผู้ใช้อยู่หลายกลุ่มได้ เช่น All Staff + IT Team), fallback เป็นกลุ่มแรก แล้วเป็น role label ถ้าไม่มีกลุ่ม (บัญชี system)
- **My Profile drawer แสดงข้อมูลครบ**: ดึง employee เต็มผ่าน `useEmployee(user.employee_id)` เพิ่มส่วนอ่านอย่างเดียว — รายละเอียดพนักงาน (รหัส/เริ่มงาน/ตำแหน่ง/แผนก) + บัญชีและสิทธิ์ (อีเมล/username/วิธีเข้าระบบ/ระดับสิทธิ์) + badge สถานะ Active/Resigned; ช่องแก้ไข (gate ด้วย `employees.edit_own`) แยก **first/last name ทั้งไทยและอังกฤษ ให้ตรงกับฟอร์ม Add Employee** แล้ว join เป็น `name`/`name_th` ตอนบันทึก (คำแรก=ชื่อ ที่เหลือ=นามสกุล) เพื่อให้ split กลับสอดคล้องกัน + เบอร์/รูป
- **ป้ายช่องชื่อ-นามสกุลภาษาอังกฤษเติม "(English)"**: ปรับ i18n key ร่วม `emp_first_name`/`emp_last_name` → "First name (English)"/"ชื่อ (อังกฤษ)" ให้สมมาตรกับ "(Thai)" มีผลทั้งฟอร์ม Add Employee และ My Profile
- **badge "Has account" กลายเป็นสีส้ม**: tone `blue` ใน `StatusBadge` เดิมผูกกับ `--brand` (`bg-brand/10 text-brand`) ทำให้เปลี่ยนตามสี theme ของผู้ใช้ (theme ส้ม → badge ส้ม ชนกับ "No account" amber) — แก้เป็นสีฟ้าจริง `bg-blue-500/10 text-blue-600` ตรงกับจุดสีฟ้าใน status filter และไม่ผูก theme อีก (tone `blue` ถูกใช้ที่ badge นี้ที่เดียว)
- **Permission ควบคุม Import พนักงานแยกต่างหาก**: เพิ่ม key `employees.import` (catalog → 34 keys / Employee 9 keys) เดิม import ผูกกับ `employees.add` — แยกเป็นสิทธิ์เฉพาะ, controller `import`/`importTemplate` gate ด้วย `employees.import`, frontend แยกปุ่ม Import (gate `canImport`) ออกจาก Add, เพิ่ม default ให้ admin/hr + backfill `role_permissions` ให้ role ที่เคยมี `employees.add` (รักษาความสามารถเดิม), live ใน Permission Module

**ไฟล์หลัก**: `app/Http/Controllers/Api/{Employee,Notification,Settings}Controller.php` · `app/Http/Requests/StoreEmployeeRequest.php` · `app/Services/EmployeeService.php` · `app/Models/User.php` · `app/Http/Resources/UserResource.php` · `database/seeders/{OrgSeeder,NotificationDemoSeeder,AvatarDemoSeeder,DatabaseSeeder}.php` · `routes/api.php` · `resources/views/app.blade.php` · `resources/js/lib/brand-color.ts` · `hooks/{use-apply-theme,use-settings,use-user-preferences,use-org,use-notifications}.ts` · `services/{orgApi,settingsApi,notificationApi}.ts` · `components/shared/{save-button,status-badge}.tsx` · `components/employees/import-employee-dialog.tsx` · `components/shell/{sidebar,profile-drawer,notifications-dropdown}.tsx` · `pages/{employees,settings}/index.tsx` · `lib/i18n.ts`

**ตรวจสอบ**: `tsc --noEmit` ✅ · `route:list` ✅ · seeders idempotent ✅ · tinker (import all-or-nothing, status filter counts, photo resolve, theme payload) ✅

---

## Phase 6 — Contract & Rental Module (#5) (เสร็จแล้ว)

สร้างตาม design bundle (module **05 Contracts** — `window.ContractsPage`) — โมดูลจัดการสัญญากับผู้ขาย/ผู้ให้บริการ พร้อมการติดตามวันหมดอายุ

### หน้า Contracts (`/contracts`) — gate ด้วย `contracts.view`
- หัวข้อ + ปุ่ม **Export** (Coming soon) / **New contract** (gate `contracts.create`)
- 4 StatCards: สัญญาทั้งหมด · ใช้งาน · ใกล้หมดอายุ (60 วัน) · มูลค่ารายปี — **ค่าจริงจาก DB** (มูลค่ารายปี normalize รายเดือน×12 / ไตรมาส×4)
- **แบนเนอร์เตือน** เมื่อมีสัญญาใกล้หมดอายุภายใน 60 วัน
- **3 แท็บ**:
  - **Dashboard**: ไทม์ไลน์การหมดอายุ 12 เดือน (จุดสีไล่ตามความเร่งด่วน คลิกเปิดรายละเอียด) + ผู้ขายที่ใช้จ่ายสูงสุด (bar) + คิวต้องดำเนินการ
  - **All contracts**: ตาราง (ID/ผู้ขาย/ชื่อ/เริ่ม/สิ้นสุด/วันที่เหลือ/มูลค่า/สถานะ) + ค้นหา (ผู้ขาย/ชื่อ/รหัส) + pagination 20/50/100; คอลัมน์ **Days remaining** ใช้สี — **น้ำเงิน** (ยังไม่ถึงกำหนด >60 วัน) / **ส้ม** (อยู่ในช่วงเตือน ≤60 วัน) / **แดง** (หมดอายุแล้ว)
  - **Expiring soon**: กรองเฉพาะใกล้หมดอายุ ≤ 60 วัน (กรองฝั่ง server)
- **Detail drawer**: ข้อมูลสัญญา + badge สถานะ/นับถอยหลัง + กำหนดการแจ้งเตือน 6 ระดับ + ปุ่ม **Edit** (gate `contracts.edit`) / **Renew** (gate `contracts.renew`, ขยายอายุ +12 เดือน)
- **Create/Edit drawer**: **เลขที่สัญญา** (กรอกเองหรือเว้นว่างให้ auto `CT-YYYY-NNN`) + radio ประเภท (Software/Hardware/Service/Connectivity) + ผู้ขาย/ชื่อ/วันเริ่ม-สิ้นสุด/มูลค่า/รอบเรียกเก็บ/ผู้รับผิดชอบ (ค้นหาพนักงาน) + auto-renew toggle + chips แจ้งเตือน **150/120/60/45/30/7 วัน** + validate ไทย

### Backend (ตาม CLAUDE.md: Migration → Model → Service → Request → Resource → Controller → Route)
- ตาราง `contracts` (code/vendor/name/type/start_date/end_date/value/billing_cycle/auto_renew/owner_id/notify_60/30/7/notes); **days_remaining + status (active/expired) คำนวณสด** จาก end_date ไม่เก็บค่าตาย
- `ContractType` enum · `Contract` model (auto code `CT-YYYY-NNN`, owner relation, `annualValue()`) · `ContractService` (create/update/renew) · `StoreContractRequest` (authorize แยก create/edit) · `ContractResource` (value_display `฿x/yr`) · `ContractController` (index paginate+tab, summary stats, CRUD, renew) — ทุก action gate ด้วย permission `contracts.*`
- คอลัมน์แจ้งเตือน 6 ระดับ: `notify_150/120/60/45/30/7` (โยกย้ายเพิ่ม 150/120/45 ภายหลัง) · `code` กรอกเองได้ (unique, blank = auto-gen, แก้ไขแล้วไม่ทับของเดิม)
- `ContractSeeder` — **19 สัญญา demo ครบทุกแบบ**: 8 จาก design (วันที่คงที่) + ชุด coverage (วันที่อิง now() ให้ตกทุกช่วงเตือน 150/120/60/45/30/7 + far-out + **สัญญา delay/overdue 4 ฉบับ**) ครบทุกประเภท/รอบเรียกเก็บ/auto-renew/owner — idempotent updateOrCreate by code, wire เข้า `DatabaseSeeder`

### Permission & ส่วนที่ Coming soon
- `contracts.view/create/edit/renew/alerts` เป็น **live** ทั้งหมด (บังคับใช้จริงทั้ง backend + UI); `contracts.alerts` (Contract Expiry Notification) ควบคุมว่าใครได้รับแจ้งเตือนหมดอายุ (กระดิ่ง + อีเมล) ผ่าน cron รายวัน
- **Coming soon**: Export, อัปโหลดเอกสารแนบ, Linked assets (รอโมดูล Assets)

**ไฟล์เพิ่ม/แก้**: migration `*_create_contracts_table` · `app/Enums/ContractType.php` · `app/Models/Contract.php` · `app/Services/ContractService.php` · `app/Http/Requests/StoreContractRequest.php` · `app/Http/Resources/ContractResource.php` · `app/Http/Controllers/Api/ContractController.php` · `database/seeders/{ContractSeeder,DatabaseSeeder}.php` · `routes/api.php` · `resources/js/types/index.ts` · `services/contractApi.ts` · `hooks/use-contracts.ts` · `pages/contracts/index.tsx` · `components/contracts/{contract-detail-drawer,contract-form-drawer}.tsx` · `app.tsx` · `lib/{i18n,permission-labels}.ts`

**ตรวจสอบ**: `tsc --noEmit` ✅ · `eslint` ✅ · `npm run build` ✅ · `route:list` (7 routes) ✅ · migration + seed ✅ · **PHPUnit `ContractApiTest` 6 ผ่าน** (guest 401, create+list, summary counts, expiring tab, permission 403, renew) ✅

> หมายเหตุ: test ที่ fail 17 รายการเป็นของ starter-kit เดิม (auth/settings แบบ Inertia ที่ถอดออกตั้งแต่ Phase-1) — ไม่เกี่ยวกับโมดูลนี้

---

## Phase 7 — Contract Expiry Alerts + Administrator Protection (เสร็จแล้ว)

> รวมงานย่อยใน session เดียว — spec/plan: `docs/superpowers/specs/2026-05-26-contract-expiry-alerts-design.md` · `docs/superpowers/plans/2026-05-26-contract-expiry-alerts.md`

### 1. Contract Expiry Alerts (`contracts.alerts` → live)
- เดิม `contracts.alerts` เป็น Coming soon (toggle มีแต่ไม่ยิงจริง) — ตอนนี้**ทำงานจริง**: เมื่อสัญญาข้ามเกณฑ์เตือนที่เปิดไว้ จะแจ้งผู้ใช้ที่ role เปิดสิทธิ์ `contracts.alerts` ทั้ง **กระดิ่งในเว็บ + อีเมล**
- **`contracts:send-expiry-alerts`** (Artisan command) ตั้งเวลารายวัน 08:00 ใน `routes/console.php` → เรียก `ContractExpiryAlertService::run()`
- **`ContractExpiryAlertService`**: หาสัญญา active ที่ `daysRemaining ≤ threshold` ที่เปิดไว้และยังไม่เคยแจ้ง → ส่ง **1 ครั้งต่อสัญญา** (ที่จุดด่วนสุด) + บันทึกทุก threshold ที่ข้ามลง `contract_alert_logs` กันยิงซ้ำ
- **กันแจ้งซ้ำ**: ตาราง `contract_alert_logs` (unique `contract_id` + `threshold`) — แจ้งครั้งเดียวต่อ threshold ต่อ cycle; **ต่ออายุ (renew) ล้าง ledger** ให้เริ่ม cycle ใหม่
- **Email**: แทน 3 template เดิม (`contract.expire.60d/30d/7d`) ด้วย template เดียว `contract.expiry_alert` ที่มีตัวแปร `{{contract.days_remaining}}` ครอบทุก threshold (150/120/60/45/30/7); ส่งผ่าน queue ตาม engine Phase-4
- **กระดิ่ง (Notifications #8)**: `ContractExpiryNotification` (database channel) → แท็บ **Contracts ใน dropdown เปลี่ยนเป็น live** แสดง vendor (รหัส) + "หมดอายุในอีก N วัน" (ไอคอน `CalendarClock`) คลิกไปหน้า `/contracts`

### 2. Administrator Protection (Permission #7)
- กันผู้ใช้ที่**ไม่ใช่ super** ทำสิ่งที่กระทบ Administrator (role `super`) บังคับที่ **backend** + mirror UI:
  - **แก้ข้อมูลพนักงานที่เป็น Admin**: `EmployeeController::update` → 403 ถ้า employee ผูกกับบัญชี super และผู้กดไม่ใช่ super (`Employee::isSuperAdmin()`, `EmployeeResource.is_super_admin`); UI ปิดเมนู Edit + tooltip
  - **Role Group Administrator**: `GroupRoleController` (store/update/destroy) → 403 ถ้ากลุ่มมี role `super` (ทั้งเดิม/ที่จะตั้ง) และผู้กดไม่ใช่ super — ปิดทั้งการ "ปลด admin" และ "ยกตัวเองเป็น admin" (escalation); UI การ์ดกลุ่ม Administrator ปิดปุ่ม Edit/Delete + tooltip
  - **เปลี่ยนสิทธิ์ Admin**: มี `abort_if($role === 'super')` ใน `RolePermissionController` อยู่แล้ว
- **ปลดล็อกแก้ข้อมูลตัวเองจากหน้า Employee**: ผู้มีสิทธิ์ `employees.edit` แก้ record ของตัวเองได้แล้ว (เดิมถูกบังคับให้แก้ผ่าน Profile เท่านั้น)

### 3. Profile drawer — SaveButton
- ปุ่ม Save ในหน้าโปรไฟล์ใช้ `SaveButton` ร่วม (ปกติ / spinner / ติ๊กถูก) เหมือนหน้า Settings

**ไฟล์เพิ่ม**: migrations `*_create_contract_alert_logs_table` · `*_replace_contract_expiry_email_templates` · `app/Models/ContractAlertLog.php` · `app/Notifications/ContractExpiryNotification.php` · `app/Services/ContractExpiryAlertService.php` · `app/Console/Commands/SendContractExpiryAlerts.php` · `tests/Feature/{ContractExpiryAlertTest,AdminProtectionTest}.php`
**ไฟล์แก้**: `routes/console.php` · `app/Http/Controllers/Api/{Contract,Employee,GroupRole}Controller.php` · `app/Models/Employee.php` · `app/Http/Resources/EmployeeResource.php` · `resources/js/services/notificationApi.ts` · `resources/js/components/shell/{notifications-dropdown,profile-drawer}.tsx` · `resources/js/components/employees/employee-view-drawer.tsx` · `resources/js/pages/{employees,permissions}/index.tsx` · `resources/js/types/index.ts` · `lib/i18n.ts`

**ตรวจสอบ**: `tsc --noEmit` ✅ (ไฟล์ที่แก้สะอาด) · `vendor/bin/pint` ✅ · migration ✅ · `schedule:list` (08:00 daily) ✅ · **PHPUnit: ContractExpiryAlertTest 8 + AdminProtectionTest 7 + ContractApiTest 10 = 25 ผ่าน** ✅

> **หมายเหตุ dev**: alert ยิงผ่าน scheduler — บน XAMPP/Windows ต้องตั้ง Task Scheduler ให้รัน `php artisan schedule:run` ทุกนาที (หรือรัน `php artisan contracts:send-expiry-alerts` เองเพื่อทดสอบ); อีเมลส่งผ่าน queue (`php artisan queue:work`)
> test ที่ fail เป็นของ starter-kit เดิม (auth/settings/dashboard แบบ Inertia ที่ถอดออกตั้งแต่ Phase-1) — ไม่เกี่ยวกับงานนี้

---

## Phase 8 — Master Data (Settings module) (เสร็จแล้ว)

> spec: `docs/superpowers/specs/2026-05-27-master-data-design.md` · plan: `docs/superpowers/plans/2026-05-27-master-data.md`

เพิ่มแท็บ **Master Data** ใน Settings module เป็น lookup table กลางที่ใช้ร่วมกันโดย Assets, Contract และ Stock — มี 6 sub-tab: Brands, Models, Categories, Supplier/Vendor, Warehouse และ Locations (ย้ายมาจากแท็บ Locations เดิม)

### 1. เปลี่ยน Navigation
- ลบแท็บ **Locations** ออกจาก Settings nav (top-level)
- เพิ่มแท็บ **Master Data** (`Boxes` icon) แทน — Locations กลายเป็น sub-tab ที่ 6 ใน Master Data

### 2. Backend

| Entity | Table | Fields |
|--------|-------|--------|
| Brand | `brands` | name (unique), description? |
| Model | `asset_models` | name, brand_id (FK→brands nullable nullOnDelete), description? |
| Category | `categories` | name, type ENUM(asset/contract/stock), description? |
| Vendor | `vendors` | name, contact?, phone?, email?, address? |
| Warehouse | `warehouses` | name (unique), description? |

- **Migrations**: 5 ตาราง (`2026_05_27_030700..030704_create_*.php`)
- **`App\Enums\CategoryType`**: backed enum (`asset`/`contract`/`stock`) — ใช้ `Rule::enum(CategoryType::class)` ใน validation กัน hardcoded string ที่ไม่ sync
- **Models**: `Brand` · `AssetModel` (belongsTo Brand) · `Category` (cast `type` → `CategoryType`) · `Vendor` · `Warehouse` — `$fillable` ครบ, ไม่มี soft deletes
- **Controllers** (`app/Http/Controllers/Api/`): `BrandController`, `AssetModelController`, `CategoryController`, `VendorController`, `WarehouseController` — แต่ละตัวมี `index/store/update/destroy`, gate ด้วย `abort_unless($user->isSuper())`, บันทึก `AuditLog::record()` ทุก write
- **Routes** (`routes/api.php`): `apiResource('brands/asset-models/categories/vendors/warehouses')→except(['show'])` ภายใต้ `auth:sanctum`
- **API Resources**: `BrandResource` · `AssetModelResource` (eager-load brand) · `CategoryResource` · `VendorResource` · `WarehouseResource`

### 3. Frontend

- **Types** (`resources/js/types/index.ts`): เพิ่ม `Brand`, `AssetModel`, `CategoryType`, `Category`, `Vendor`, `Warehouse`
- **API service** (`resources/js/services/masterDataApi.ts`): 5 object (brandApi / assetModelApi / categoryApi / vendorApi / warehouseApi) — list/create/update/remove ผ่าน `mutate<T>` helper เดิม
- **Hooks** (`resources/js/hooks/use-master-data.ts`): 5 query hooks + 5 mutation factories ด้วย query key constants (`['brands'] as const`) + `onSuccess: invalidate`
- **i18n** (`resources/js/lib/i18n.ts`): เพิ่ม 26 keys ทั้ง EN/TH — `set_master_data`, `md_brands`…`md_warehouses`, `md_add_brand`…`md_add_warehouse`, field labels, type labels
- **`MasterDataTab`** (ใน `pages/settings/index.tsx`): horizontal pill-tab bar (6 tabs) + render รายการด้านล่าง
  - `BrandsList` — name + description (muted); inline-edit row
  - `ModelsList` — name + brand dropdown (SearchSelect); add/edit form 2 fields + clear-brand option (`—`)
  - `CategoriesList` — name + type badge สี (`asset`=น้ำเงิน / `contract`=ม่วง / `stock`=เขียว)
  - `VendorsList` — name + phone/email secondary line; form 5 fields
  - `WarehousesList` — name + description; inline-edit row
  - `LocationsList` — logic เดิมของ LocationsTab ไม่เปลี่ยน (แค่ย้าย + ลบ inner heading ซ้ำ)
- ทุก `add()` / `saveEdit()` ครอบด้วย try/catch + `Swal.fire({ icon: 'error', … })` เมื่อ mutation ล้มเหลว (เช่น FK constraint / unique violation)

### 4. Tests

- **`tests/Feature/MasterDataTest.php`**: 31 tests, 53 assertions
  - Guest 401 (5 tests, 1 ต่อ resource)
  - Non-super forbidden 403 (5 tests)
  - Brand CRUD + uniqueness (5 tests)
  - AssetModel with/without brand (4 tests)
  - Category type validation (3 tests)
  - Vendor email validation (3 tests)
  - Warehouse CRUD + uniqueness (3 tests)
  - Update/Delete ครอบ Brand + AssetModel (3 tests)

**ไฟล์เพิ่ม**: `database/migrations/2026_05_27_030700..030704_create_*.php` · `app/Enums/CategoryType.php` · `app/Models/{Brand,AssetModel,Category,Vendor,Warehouse}.php` · `app/Http/Controllers/Api/{Brand,AssetModel,Category,Vendor,Warehouse}Controller.php` · `app/Http/Resources/{Brand,AssetModel,Category,Vendor,Warehouse}Resource.php` · `resources/js/services/masterDataApi.ts` · `resources/js/hooks/use-master-data.ts` · `tests/Feature/MasterDataTest.php` · `docs/superpowers/specs/2026-05-27-master-data-design.md` · `docs/superpowers/plans/2026-05-27-master-data.md`
**ไฟล์แก้**: `routes/api.php` · `resources/js/types/index.ts` · `resources/js/lib/i18n.ts` · `resources/js/pages/settings/index.tsx`

**ตรวจสอบ**: migration ✅ · `vendor/bin/pint` ✅ · **PHPUnit `MasterDataTest` 31 ผ่าน** ✅

> หมายเหตุ: test ที่ fail 17 รายการเป็นของ starter-kit เดิม (auth/settings แบบ Inertia ที่ถอดออกตั้งแต่ Phase-1) — ไม่เกี่ยวกับงานนี้

---

## โครงสร้างโปรเจกต์ (Frontend)

```
resources/js/
├── app.tsx                       # SPA entry: providers + router
├── lib/
│   ├── i18n.ts                   # EN/TH dictionaries + useT()
│   ├── nav.ts                    # role-aware nav config
│   └── utils.ts                  # cn()
├── services/
│   ├── http.ts                   # axios instance + ensureCsrf()
│   └── authApi.ts                # login / logout / me
├── stores/
│   └── ui.ts                     # Zustand UI/tweaks store
├── hooks/
│   ├── use-auth.ts               # React Query auth hooks
│   └── use-apply-theme.ts        # apply dark/brand/radius to DOM
├── components/
│   ├── auth/protected-route.tsx
│   ├── shell/                    # app-shell, sidebar, topbar, ...
│   ├── shared/                   # data-table, status-badge, field, flags
│   └── ui/                       # shadcn/ui primitives
├── pages/
│   ├── login.tsx
│   ├── dashboard.tsx
│   └── placeholder.tsx
└── types/index.ts
```

---

## การติดตั้งและรัน (Getting Started)

```bash
# 1. ติดตั้ง dependencies
composer install
npm install

# 2. ตั้งค่า .env (ตั้งค่า DB ให้ตรงกับเครื่อง) แล้วรัน migration + seed
php artisan migrate --seed

# 3. รัน dev servers (ต้องรันทั้งคู่)
php artisan serve          # http://localhost:8000
npm run dev                # Vite (HMR)

# เปิดเบราว์เซอร์ที่ http://localhost:8000
```

### Build สำหรับ production
```bash
npm run build
```

### Demo accounts (password: `password`)

| Email | Role |
|-------|------|
| super@inaba.co.th | Super Administrator |
| it@inaba.co.th | IT Staff |
| hr@inaba.co.th | HR Officer |
| user@inaba.co.th | Employee |

> สลับ role โดยล็อกอินด้วยบัญชีคนละตัว — เมนู sidebar จะเปลี่ยนตามสิทธิ์อัตโนมัติ

---

## สถานะโมดูล

| # | Module | สถานะ |
|---|--------|-------|
| 0 | Overall Dashboard (แยกตาม role) | ⏳ รอ |
| 1 | Employee Management (พนักงาน / ตำแหน่ง / แผนก) | ✅ Phase-2 · Phase-5 (resign/cancel, CSV import, filters, avatar) |
| 2 | Ticket System (เปิด/รับ/อัปเดตเคส) | ⏳ รอ |
| 3 | Request Workflow (คำขออนุมัติ) | ✅ 2026-08-01 (Request module **11 ประเภท** + Workflow engine ตามสายบังคับบัญชา/Owner + Auto Ticket + Bell/Email ทุกขั้น + หน้า Workflows admin) · 2026-08-03 ปรับ UX ตามการใช้งานจริง + Master data "ข้อมูลคำขอ" · Export/สร้าง workflow ใหม่ Coming soon |
| 4 | Asset Management (ทรัพย์สิน / โอนย้าย / รับคืน) | ⏳ รอ |
| 5 | Contract & Rental (สัญญา + แจ้งเตือนหมดอายุ) | ✅ Phase-6 (CRUD + dashboard/timeline + expiring filter + renew) · Phase-7 (expiry alerts: bell + email + scheduled command) · attachments/linked-assets Coming soon |
| 6 | Stock Management (คลังอะไหล่) | 🟡 Phase-9 (Master Data lookups + Stock Items + Min/Max alerts + Dashboard + RBAC) · Movements/Requests/Audit/Notifications รอเฟสถัดไป |
| 7 | Permission Management | ✅ Phase-3 (Roles+matrix, Groups, Audit log) · Phase-7 (Administrator protection: กัน non-super แก้ admin/role group/escalation) |
| 8 | Notifications System (in-app) | 🟡 Bell + dropdown + tabs ตามโมดูล + ปิดทีละรายการ + event พนักงานใหม่ (Phase-5) + contract expiry (Phase-7) + **service request ทุก transition (2026-08-01, แท็บ Requests live)** · trigger ticket/asset รอ |
| 9 | Email Notifications | ✅ Phase-4 (template library + SMTP + queued send) |
| 10 | Report / Export | ⏳ รอ |
| 11 | Settings | 🟡 Display/Branding/Company/Email/Security เสร็จ · **Master Data** (Brands/Models/Categories/Vendors/Warehouses/Locations + **Units/Stock statuses/Warranty types** Phase-9) · ส่วนอื่นรอโมดูล |

---

## Phase-9 — Stock / Inventory Module (IT)

โมดูลคลังพัสดุไอที ต่อจาก Contract Module อิงดีไซน์จาก Claude Design bundle (`pages-5.jsx`)
รายงานสถานะตามหัวข้อที่ร้องขอ (12 ข้อ):

| # | หัวข้อ | สถานะ | รายละเอียด |
|---|--------|-------|-----------|
| 1 | **Master Data ส่วนกลาง** | ✅ เสร็จ | ใช้ร่วมกับ Asset/Contract: Brand, Model, Category, Vendor, Warehouse มีอยู่แล้ว · **เพิ่มใหม่** ที่ Settings → Master Data: **Unit, Stock Status, Warranty Type** (ตาราง + model + controller + routes + UI ครบ พร้อม seed ค่าเริ่มต้น) |
| 2 | **Stock Item Management** | ✅ เสร็จ | `stock_items`: SKU, Serial, Brand, Model, Category, Unit, Cost, Current/Min/Max, Warehouse, Supplier, Warranty · CRUD + filters (search/category/warehouse/status) + add/edit dialog (Save loading→✓) |
| 3 | **Stock Movement** (Receive/Issue/Return/Transfer) | ✅ Phase-10 | `stock_movements` + endpoint list/create · ปรับ `current_stock` อัตโนมัติ (receive/return +, issue/transfer −) กันสต็อกติดลบ · RBAC ต่อชนิด (receive→stock.receive, issue→fulfill, return→return, transfer→transfer) · แท็บ Movements + drawer แยกชนิด |
| 4 | **Min–Max Alert** | ✅ เสร็จ | สถานะ derive อัตโนมัติ: out (=0) / low (<Min) / over (>Max) / dead (ไม่เคลื่อนไหว >90 วัน) / ok · Dashboard มีแบนเนอร์แจ้งเตือน + KPI + endpoint `summary` แยก low/over/dead buckets · มี Min/Max bar ในตาราง |
| 5 | **Stock Request** (workflow เบิกจ่าย) | ✅ Phase-10 | `stock_requests` workflow: submit (stock.request) → approve/reject (stock.approve) → fulfill (stock.fulfill) · fulfill สร้าง movement `issue` + ตัดสต็อกอัตโนมัติ · ผู้ขอเห็นเฉพาะคำขอตัวเอง, ผู้อนุมัติ/จ่ายเห็นทั้งหมด · แท็บ Requests + drawer |
| 8 | **Transfer Stock** | ✅ Phase-10 | เป็น movement ชนิด `transfer` (RBAC stock.transfer) |
| 9 | **Dashboard / Report** | 🟡 บางส่วน | Dashboard: KPI (SKU/มูลค่า/ต่ำกว่า Min/Overstock), Stock by warehouse, Stock by category, Min/Max alerts · Export/Report ยังไม่ทำ |
| 10 | **Audit / Stock Count** | ⏳ รอเฟสถัดไป | แท็บ placeholder ในหน้า Stock |
| 11 | **RBAC Permission** | ✅ เสร็จ | module `stock` ปรับเป็น **tree 15 สิทธิ์**: master `stock.module` (คุม sidebar icon) → View ต่อแท็บ (`view_dashboard`/`view`/`view_request`/`view_count`/`view_events`) → Management children (manage_items/receive/return/transfer · request/approve/fulfill · count · events) · หน้า Permissions แสดง Stock เป็นการ์ด tree (master→view→management, cascade ปิด+ล็อกลูก) · เซฟผ่าน `Permissions::normalizeStock()` บังคับลำดับชั้นฝั่ง server · controller re-gate read endpoint ตามแท็บ (summary→view_dashboard, requests→view_request, movements→view_events, serials→events, count list→view_count / actions→count) · migration grant key ใหม่ให้ role เดิมกันสิทธิ์หาย · (เลิกใช้ manage_warehouse/audit/delete) |
| 12 | **Notification** (email + bell) | ✅ เสร็จ | `StockNotificationService` ยิง **bell (DB notification) + email (template queue)** ครบ 8 เหตุการณ์ · ผู้รับผูกตาม permission: alerts (out/low/over)→`stock.module`, New Request/Waiting→`stock.approve`, Approved/Rejected/Fulfilled→เจ้าของคำขอ, Counting draft→`stock.view_count` (bell อย่างเดียว) · ทริกเกอร์ **real-time** หลัง movement/fulfill/commit + **command รายวัน** `stock:send-notifications` (ย้ำ overwrite จนกลับ Normal/Fulfilled/Committed) · dedup ledger `stock_alert_logs` · แท็บ Stock ใน bell เปิด live แล้ว |

### Backend (Phase-9 เสร็จ)
- Migrations: `units`, `stock_statuses`, `warranty_types`, `stock_items`
- Models: `Unit`, `StockStatus`, `WarrantyType`, `StockItem` (มี `status()` + `daysSinceLastMove()` derive)
- Controllers: `UnitController`, `StockStatusController`, `WarrantyTypeController` (mirror Warehouse), `StockItemController` (index/show/store/update/destroy + `summary`)
- Routes: `units`, `stock-statuses`, `warranty-types`, `stock-items` (+ `stock-items/summary`)
- Seeders: ค่าเริ่มต้น Unit/Status/Warranty + `StockSeeder` (16 รายการ demo ครอบคลุมทุกสถานะ)
- Permissions: เพิ่ม `stock.*` ใน `app/Support/Permissions.php`
- Tests: `tests/Feature/StockItemTest.php` (6 ผ่าน — list/summary/status derive/CRUD/RBAC)

### Frontend (Phase-9 เสร็จ)
- `pages/stock/index.tsx` — หน้า Stock (KPI + Min/Max alert banner + แท็บ Dashboard/Items + placeholder Movements/Requests/Audit)
- `components/stock/stock-item-modal.tsx` — add/edit ดึง dropdown จาก Master Data
- `components/settings/lookup-section.tsx` — list+dialog ใช้ซ้ำสำหรับ Unit/Stock Status/Warranty Type
- types/api/hooks: `StockItem`, `StockSummary`, `stockApi`, `useStock*` · nav gate `stock.view`

### Backend (Phase-10 เสร็จ — Movement + Request workflow)
- Migrations: `stock_movements` (type/qty/from/to/ref/by/moved_at), `stock_requests` (workflow + timestamps)
- Models: `StockMovement` (`delta()`, INBOUND), `StockRequest` · `StockItem::movements()`
- Controllers: `StockMovementController` (index + store, ปรับสต็อกใน transaction + lockForUpdate กันติดลบ + RBAC ต่อชนิด), `StockRequestController` (index visibility + store + approve/reject/fulfill)
- Routes: `stock-movements` (GET/POST), `stock-requests` (GET/POST + `/approve` `/reject` `/fulfill`)
- Tests: `tests/Feature/StockWorkflowTest.php` (6 ผ่าน — receive/issue เพิ่ม-ลดสต็อก, กันสต็อกไม่พอ, RBAC ต่อชนิด, workflow submit→approve→fulfill สร้าง issue movement, กัน fulfill ก่อน approve, visibility)

### Frontend (Phase-10 เสร็จ)
- แท็บ Movements (ตาราง + filter ชนิด + ปุ่มสร้างต่อชนิดตามสิทธิ์) + `components/stock/movement-drawer.tsx`
- แท็บ Requests (ตาราง + ปุ่ม approve/reject/fulfill ตามสิทธิ์ + สถานะ) + `components/stock/request-drawer.tsx`
- ปุ่ม Request / Receive บน header · hooks `useStockMovements`, `useRecordMovement`, `useStockRequests`, `useStockRequestActions`
- เปิด stock.* เป็น live ในหน้า Permissions (request/approve/fulfill/receive/transfer/return)

### หมายเหตุการติดตั้ง
- สิทธิ์ `stock.*` ใหม่: **super เห็นอัตโนมัติ** · role อื่น (admin/hr/user) ต้อง grant ผ่าน Settings → Permissions หรือ sync defaults (อย่ารัน `migrate:fresh` บนข้อมูลจริง)
- ค่า Master Data ใหม่ seed ด้วย `php artisan db:seed --class=MasterDataSeeder` · stock demo: `--class=StockSeeder`

---

## Assets Management Module (Phase-11 เสร็จ)

โมดูลจัดการทรัพย์สิน IT (คอม/อุปกรณ์ ทั้งซื้อและเช่า) อิงดีไซน์จาก Claude Design bundle (`pages-3.jsx`) — ทำครบ 4 เฟสย่อยในรอบเดียว

### ภาพรวมฟีเจอร์
| หัวข้อ | รายละเอียด |
|--------|-----------|
| **Inventory** | ตารางทรัพย์สิน + ค้นหา (tag/model/owner/serial) + filter ประเภท/การได้มา/สถานะ + pagination + เลือกหลายรายการ (bulk) |
| **Dashboard** | KPI (ทั้งหมด/ใช้งาน/รอรับมอบ/รอรับคืน) + แยกตามประเภท (bar) + ทรัพย์สินมูลค่าสูงสุด |
| **Register / Edit** | drawer ลงทะเบียน/แก้ไข · สลับ ซื้อ/เช่า · auto-generate tag (INB-/RNT-XX-NNNNN) |
| **Detail view** | drawer แสดงข้อมูลครบ (ทั่วไป/การครอบครอง/การได้มา/หมายเหตุ) |
| **Workflow** | โอน (Transfer→Pending acceptance) · รับมอบ (Accept→Deployed) · รับคืน (Mark received→Ready, owner Pool — IT) · สลับซ่อมบำรุง · ตัดจำหน่าย |
| **Bulk** | เลือกหลายรายการ → ตั้งซ่อมบำรุง / ตัดจำหน่าย |
| **Transfer log** | แท็บประวัติการโอน (บันทึก from/to/เหตุผล/ผู้ทำ ทุกครั้งที่โอน/รับคืน) |
| **Contract link** | ทรัพย์สินเช่าผูกกับสัญญา (vendor contract) — แสดงรหัสสัญญาในหน้า detail |
| **Asset → Stock** | แปลงทรัพย์สินเป็นรายการคลังพัสดุ (สร้าง stock item + เปลี่ยนสถานะเป็น Pending stock) |
| **RBAC** | `assets.view/register/transfer/retire/edit` — super + IT admin (มีอยู่ใน catalog เดิมแล้ว) |

### Backend
- Migrations: `assets` (tag, type, brand, model, serial, source, status, owner, initial_owner, department, location, value, supplier, purchase/warranty/lease dates, `contract_id` FK→contracts, registered_date, notes, last_reason), `asset_transfers` (ประวัติการโอน)
- Enums: `AssetType` (laptop/desktop/mobile/printer/server/network/other), `AssetSource` (purchased/rented), `AssetStatus` (ready/pending_acceptance/deployed/pending_return/maintenance/writeoff/pending_stock)
- Models: `Asset` (auto-tag, contract relation, annualValue), `AssetTransfer`
- Service: `AssetService` (CRUD + transfer/accept/requestReturn/markReceived/toggleMaintenance/retire/bulkSetStatus/convertToStock)
- Controller: `AssetController` (index+filters, summary, CRUD, transfers log, transfer/accept/receive/maintenance/to-stock/bulk) — gating ต่อ action
- Resource/Request: `AssetResource`, `StoreAssetRequest` (assets.register/edit)
- Routes: `assets` apiResource + `summary` `transfers` `bulk` `{asset}/transfer|accept|receive|maintenance|to-stock`
- Factory + `AssetSeeder` (16 รายการ demo อิงดีไซน์ ครอบคลุมทุกสถานะ)
- Tests: `tests/Feature/AssetApiTest.php` (13 ผ่าน — CRUD/RBAC/auto-tag/value display/transfer+log/accept/receive/bulk/summary/to-stock)

### Frontend
- `pages/assets/index.tsx` — หน้า Assets (KPI + แท็บ Dashboard/Inventory/Transfer log)
- `components/assets/` — `asset-meta` (status badge + type icon), `asset-form-drawer`, `asset-detail-drawer`, `asset-transfer-drawer`, `asset-to-stock-modal`
- types/api/hooks: `Asset`, `AssetSummary`, `AssetTransferLog`, `assetApi`, `useAssets`/`useAssetSummary`/`useAssetTransfers`/`useAssetMutations`
- i18n EN/TH ครบ · route `/assets` (แทน placeholder เดิม) · nav gate `assets.view`

### หมายเหตุการติดตั้ง
- รัน `php artisan migrate` เพื่อสร้างตาราง `assets` + `asset_transfers`
- seed demo: `php artisan db:seed --class=AssetSeeder` (idempotent ตาม tag — ปลอดภัยกับข้อมูลจริง)
- สิทธิ์ `assets.*` มีใน catalog อยู่แล้ว: **super เห็นอัตโนมัติ · admin (IT) ได้ครบ** · role อื่นต้อง grant เอง

---

## Ticket Module (โมดูล 2 — แจ้งปัญหา IT)

สร้างตามดีไซน์ handoff (Inaba IT Service Desk) — ลำดับงาน Open → In progress → Completed / Canceled

### Backend
- Enums: `TicketStatus` (open/in_progress/completed/canceled), `TicketCategory` (hardware/software/network/other), `TicketPriority` (critical/high/medium/low)
- ตาราง `tickets`: `ticket_no` (TKT-#### auto), subject/subject_th/description, category, priority (nullable), status, `requester_id`→employees, `assignee_id`→users (nullable), callback_phone, `related_asset_id`→assets (nullable), take_note, resolution, resolved_at
- `TicketService` + `TicketController` ครอบคลุม flow: สร้าง (requester = พนักงานของ user ปัจจุบัน), รับเคส/take (IT รับเอง + กำหนด priority), assign (super → staff), resolve (assignee ปิด/ยกเลิก + resolution ≥10), ลบ
- RBAC ผ่าน `tickets.*`: ผู้แจ้งเห็นเฉพาะตั๋วตัวเอง · IT (`tickets.view_all`) เห็นทั้งหมด · summary + staff endpoint
- Factory + `TicketSeeder` (5 demo ตรงดีไซน์) · Tests: `tests/Feature/TicketApiTest.php` (13 ผ่าน — create/take/assign/resolve/cancel/RBAC/scoping)

### Frontend
- `pages/tickets/index.tsx` — IT เห็น dashboard (สถิติสถานะ + แท่ง by-category) + แท็บ All/Mine + filter; พนักงานทั่วไปเห็นเฉพาะตั๋วตัวเอง
- `components/tickets/` — `ticket-meta` (badges/icons), `create-ticket-drawer`, `ticket-detail-drawer`, `take-case-modal`, `assign-ticket-modal`, `resolve-ticket-modal`
- types/api/hooks: `Ticket`/`TicketSummary`, `ticketApi`, `useTickets`/`useTicketSummary`/`useTicketStaff`/`useTicketMutations`
- i18n EN/TH ครบ · route `/tickets` (แทน placeholder เดิม) · nav gate `tickets.create`

### หมายเหตุการติดตั้ง
- รัน `php artisan migrate` เพื่อสร้างตาราง `tickets`
- seed demo: `php artisan db:seed --class=TicketSeeder` (idempotent ตาม ticket_no — ต้อง seed employees/users ก่อน)
- สิทธิ์ `tickets.*` มีใน catalog อยู่แล้ว: **super เห็นอัตโนมัติ · admin (IT) ได้ครบ** · role อื่นได้ `tickets.create` ตาม default

### ไฟล์แนบ (Attachments)
- ตาราง `ticket_attachments` + `TicketAttachment` model + `TicketAttachmentController` (store/destroy) บน public disk `tickets/{id}` — รับ PNG/JPG/PDF ≤20MB สูงสุด 10 ไฟล์/ตั๋ว
- สิทธิ์: ผู้แจ้งแนบ/ลบไฟล์ตั๋วตัวเองได้ · IT (`tickets.view_all`) ได้ทุกตั๋ว
- Frontend: file picker จริงใน create drawer (อัปโหลดหลังสร้างตั๋ว) + รายการ download/ลบใน detail drawer · Tests: `TicketAttachmentTest` (5 ผ่าน)

### SLA (real metrics)
- เป้า SLA ต่อ priority ปรับได้ที่ **Settings → Tickets** (response นาที + resolve ชั่วโมง) เก็บใน `app_settings.ticket_sla` (JSON) · default: Critical 4h / High 8h / Medium 24h / Low 72h — ดู `App\Support\TicketSla`
- เพิ่ม `tickets.responded_at` (set ตอน take/assign) → คำนวณ **Avg response** (created→responded) จริง
- `tickets/summary` คืน `avg_response_minutes` + `sla_met_pct` (% ตั๋ว completed ที่ปิดทันเป้า resolve ตาม priority) — dashboard cards ใช้ค่าจริงแล้ว · Tests: `TicketSlaTest` (5 ผ่าน)

---

## Permission Module — สิทธิ์ Administration Settings แบบละเอียด (โมดูล 7)

แยกสิทธิ์ `system.edit_settings` เดิม (ตัวเดียวคุมทุก section) เป็น **9 สิทธิ์ย่อยต่อ section** ใน namespace `settings.*` พร้อม enforce จริงทั้ง backend และ UI

### Backend
- catalog `app/Support/Permissions.php`: เพิ่มกลุ่ม `settings` 9 keys — `company, branding, display, masterdata, email, sla, assets, workflows, security`; ลบ `system.edit_settings`
- middleware ใหม่ `EnsurePermission` (alias `permission`) — ใช้ `->middleware('permission:settings.x')` abort 403 ถ้าไม่มีสิทธิ์ (super bypass ผ่าน `User::hasPermission()`)
- แตก `SettingsController::update()` (monolithic) เป็น method ต่อ section: `updateCompany / updateBranding / updateDisplay / updateAssets / updateSla`; mail → `settings.email`, security (PUT) → `settings.security`, logo → `settings.branding`
- routes: `PUT /settings/{company,branding,display,assets,sla}` + mail/security/logo แต่ละตัว gate ด้วย `settings.*`; `GET /settings` และ `GET /settings/security` ยังเปิด (theme/branding + session-timeout hook โหลดทุก request)
- Master Data (brands, asset-models, categories, vendors, warehouses, units, stock-statuses, warranty-types, locations): **read เปิด** (โมดูลอื่นใช้ร่วม) · **write gate ด้วย `settings.masterdata`** — warehouse ย้ายจาก `stock.manage_warehouse` มาที่นี่ (key เดิมคงไว้ใน catalog เป็น reserved ไม่ enforce แล้ว)
- Tests: `SettingsPermissionsTest`, `EnsurePermissionMiddlewareTest`, `SettingsSectionPermissionsTest` + อัปเดต `AssetStatusColorsTest`/`TicketSlaTest`/`SecuritySettingsTest`/`MasterDataTest` — full suite **228 ผ่าน**

### Frontend
- `permission-labels.ts` + matrix (`permissions/index.tsx`): การ์ด "Setting" แสดง 9 toggle ใช้งานจริง (ไม่มีป้าย Coming soon)
- `settingsApi.ts` / `use-settings.ts`: แยก endpoint ต่อ section (`updateCompany`→/company, `updateBranding`→/branding, `updateDisplay`→/display, `updateAssetColors`→/assets, `updateTicketSla`→/sla)
- หน้า Settings (`pages/settings/index.tsx`): ซ่อน tab ที่ไม่มีสิทธิ์ (filter ด้วย `can()` + super) · ไม่มีสิทธิ์เลย → `NoAccess` · route guard (`app.tsx`) ใช้ `anyOf` 9 keys
- เมนู Settings ใน sidebar: เพิ่ม `anyOf` ใน `NavItem` → ลิงก์แสดงเมื่อมีสิทธิ์ `settings.*` ตัวใดตัวหนึ่ง

### หมายเหตุการติดตั้ง
- รัน `php artisan migrate` — migration `drop_edit_settings_permission` ลบ row `system.edit_settings` เดิมออกจาก `role_permissions` (ปลอดภัยกับข้อมูลจริง ไม่ reset)
- สิทธิ์ `settings.*` **default = super เท่านั้น** (bypass) · admin / role อื่นต้อง grant เองผ่านหน้า Permission matrix
- หลังแก้ frontend ต้อง `npm run build` (หรือ `npm run dev`) ให้เห็นผล

---

## Stock Module — คลังแยกตามคลัง (per-warehouse balances) + Transfer ใหม่ (โมดูล 6)

ทำให้ stock ติดตามยอดคงเหลือ **แยกตามคลังจริง** การย้ายคลัง (Transfer) ถูกต้องตามหลัก inventory และแก้บั๊กที่ transfer เดิมทำของหาย

### Backend
- ตารางใหม่ `stock_balances` (SKU × warehouse × qty) — ยอดคงเหลือต่อคลัง; `stock_items.current_stock` ยังเป็นยอดรวม cached (= SUM ของ balances) อัปเดตใน transaction เดียวกัน
- `StockBalanceService` (`add/remove/move/rebuildFor`) — กันยอดติดลบรายคลัง + กันย้ายคลังเดียวกัน; migration backfill สร้าง balance 1 แถวต่อ item จาก current_stock (ปลอดภัยกับข้อมูลจริง)
- 🔴 **แก้บั๊ก Transfer:** เดิม transfer ถูกคิดเป็น outbound → ลด `current_stock` + consume FIFO lot (ของหาย). ตอนนี้ transfer **stock- และ cost-neutral** — `delta()` = 0, ไม่แตะ lot, แค่ `balances->move(from→to)` + ย้าย `warehouse` ของ serial ที่เลือก
- เลขเอกสารอัตโนมัติทุก movement: `RCV/ISS/RET/TRF-yyyy-xxx` (column `doc_no` + `App\Support\DocNumber`)
- `record()` warehouse-aware: receive/return `+qty` ที่ปลายทาง (fallback คลังบ้าน item), issue/transfer หักรายคลัง; transfer ต้องมี `from_label`+`to_label` (422 ถ้าขาด)
- `fulfill` (เบิก) เลือก **คลังต้นทาง** ที่ตัดของ + `doc_no`; dashboard `by_warehouse` คิดจาก `stock_balances` จริง; `StockItemResource` เปิดเผย `balances`
- Tests: `StockTransferTest`, `StockBalanceTest`, `DocNumberTest` + อัปเดต `StockFifoCostingTest` (เปลี่ยน FIFO consumption test จาก transfer → issue/fulfill), `StockWorkflowTest`, `StockSerialReceiveTest` — full suite **243 ผ่าน**

### Frontend
- **Transfer dialog ใหม่** (`movement-drawer.tsx`): ตัด field Reference/PO ออก (โชว์ว่า TRF-… ออกอัตโนมัติ) · เลือก **From → To คลัง** · qty-only โชว์คงเหลือคลังต้นทาง + cap จำนวน · serialized เลือก serial เฉพาะที่อยู่คลังต้นทาง · กันย้ายคลังเดียวกัน/เกินคงเหลือ
- Fulfill dialog: เพิ่ม **เลือกคลังต้นทาง** + serial scope ตามคลัง + แผงคงเหลือสะท้อนยอดคลังที่เลือก (ไม่ใช่ยอดรวม)
- types/api/hooks: `StockBalance`, `doc_no`, `serial_ids` (transfer), `from_warehouse` (fulfill)

### หมายเหตุการติดตั้ง
- รัน `php artisan migrate` — สร้าง `stock_balances` + column `doc_no` + backfill (ปลอดภัยกับข้อมูลจริง ไม่ reset)
- หลังแก้ frontend ต้อง `npm run build` (หรือ `npm run dev`)
- หมายเหตุ: per-warehouse cost (มูลค่าแยกคลัง) ยังไม่ทำ — FIFO เป็นระดับ SKU; min/max reorder ยังคิดจากยอดรวม

---

## Org Approval Chain — สายอนุมัติตามผังบังคับบัญชา (manager walk to root)

> spec: `docs/superpowers/specs/2026-06-08-org-approval-chain-design.md` · plan: `docs/superpowers/plans/2026-06-08-org-approval-chain.md`
> demo org redesign plan: `docs/superpowers/plans/2026-06-10-org-demo-data-14-levels.md` · spec: `docs/superpowers/specs/2026-06-10-org-demo-data-14-levels-design.md`

วางรากฐานการคำนวณ **สายอนุมัติ** ของพนักงานโดยไต่ตามผังบังคับบัญชา (manager reporting tree) จากพนักงานขึ้นไปถึงรากต้นไม้ (VP) — เป็นฐานสำหรับ Request Workflow (โมดูล 3) ในอนาคต

### แนวทาง (manager tree เป็น source of truth เดียว)
- `employees.manager_id` (self-FK, nullable, `nullOnDelete`) เป็นต้นไม้รายงานตัวเดียว
- `ApprovalChainService::chainFor()` ไต่ `manager_id` จากผู้ยื่น **ขึ้นจนถึงรากต้นไม้** (คนที่ `manager_id = null`) เก็บทุกหัวหน้าตามลำดับ (หัวหน้าตรงก่อน) — **ไม่มีเพดาน level** ระดับกลางที่ขาดหายข้ามไปเฉยๆ มี **guard กันวน (cycle)** ด้วย seen-set
- `positions.level` (1–14) ใช้เป็น**ลำดับตำแหน่งแสดงผลเท่านั้น** ไม่มีผลต่อการหยุดสายอนุมัติ
- **ลบ `approval_ceiling_level` setting และ UI card / endpoint `GET|PUT /settings/approval` ออกแล้ว** — ไม่มีเพดานระดับอีกต่อไป; chain หยุดที่รากต้นไม้เสมอ
- **ลบฟิลด์ `departments.head` (Supervisor แบบ text) ออกแล้ว** (migration `drop_head_from_departments`) — หัวหน้าทั้งหมดมาจาก `manager_id` แหล่งเดียว

### Backend
- Migrations: `add_level_to_positions_table`, `add_manager_id_to_employees_table` (ปลอดภัยกับข้อมูลจริง — เพิ่ม column nullable, ไม่ reset)
- Models: `Position.level` (fillable, max=14) · `Employee` — `manager()`/`subordinates()` relations + `isAncestorOf()` (กันวนตอนตั้งหัวหน้า)
- Service: `ApprovalChainService::chainFor()` — walk `manager_id` to root; ไม่มี `ceilingLevel` แล้ว
- Validation: `StoreEmployeeRequest` — `manager_id` (exists) + `withValidator` ปฏิเสธ self / descendant (กัน loop) · `positions.level` max=14
- API: `GET /employees/{employee}/approval-chain` (`ApproverNodeResource`, gate `employees.view`)
- Resources: `EmployeeResource`/`PositionResource` เปิดเผย `manager_id`/`level`
- Tests: `tests/Feature/ApprovalChainTest.php` (9 ผ่าน — climb-to-root/no-manager/cycle/endpoint auth+permission/level-cap-14) · `tests/Feature/EmployeeApiTest.php` (3 ผ่าน — self/descendant/valid manager) · `tests/Feature/ApprovalChainDemoSeederTest.php` (4 ผ่าน — OrgSeeder 14 levels/VP at root/chain-to-VP/idempotent)

### Frontend
- types: `Position.level`, `Employee.manager_id`, `ApproverNode`
- Position modal: ช่อง **Level** (1–14) · Add/Edit Employee: ช่อง **หัวหน้า** (SearchableSelect, ตัดตัวเองออก — descendant กันที่ server)
- Employee view drawer: ส่วน **สายอนุมัติ** แสดงหัวหน้าตามลำดับ (ลูกศรขึ้น) + ป้าย "ลาออก" ถ้าหัวหน้าลาออก · ว่าง = "ไม่มีผู้อนุมัติเหนือกว่า"
- Settings → Master Data: **ลบ** การ์ด "ระดับสูงสุดของสายอนุมัติ" ออกแล้ว (ไม่มีเพดานอีกต่อไป)

### ข้อมูล Demo (`OrgSeeder`) — 11 แผนก / 26 หน่วยงาน / 14 ตำแหน่ง / 30 พนักงาน
- **14 ตำแหน่ง** level 1 (Subcontract) → 14 (Vice President) — ใช้เป็นลำดับแสดงผล ไม่เป็นเพดาน
- **ต้นไม้ต้นเดียว**: EMP-0001 (VP) ที่ราก → EMP-0002 (Director/PD) → … → EMP-0014 (Subcontract/PD) ครบ 14 ระดับ + สาขา Corporate Director (EMP-0015) → managers ของ 10 แผนกที่เหลือ + staff ย่อย
- `OrgSeeder` เป็น idempotent (`updateOrCreate`) — รันซ้ำได้ปลอดภัย

### หมายเหตุการติดตั้ง
- รัน `php artisan migrate` เพื่อเพิ่ม `positions.level` + `employees.manager_id` (ปลอดภัยกับข้อมูลจริง)
- `manager_id` เป็น**ข้อมูลปฏิบัติการ** — กรอกผ่านช่องหัวหน้าใน Add/Edit Employee; `OrgSeeder` wire ให้อัตโนมัติสำหรับ demo
- หลังแก้ frontend ต้อง `npm run build` (หรือ `npm run dev`)

**ตรวจสอบ**: `php artisan test --compact` 426 ผ่าน · `tsc --noEmit` ✅ · `npm run build` ✅ · `vendor/bin/pint` ✅

---

## Org Chart (ผังองค์กร) — แท็บผังองค์กรแบบโต้ตอบ

> spec: `docs/superpowers/specs/2026-06-09-org-chart-tab-design.md` · plan: `docs/superpowers/plans/2026-06-09-org-chart-tab.md`

- แท็บใหม่ในหน้า Employees แสดงผังบังคับบัญชาจาก `employees.manager_id` แบบ **forest** (คนไม่มีหัวหน้า = ต้นไม้แยก), ซ่อนคนลาออกเสมอ
- สร้างด้วย **React Flow (`@xyflow/react`) + `@dagrejs/dagre`** (layout บนลงล่าง) · node การ์ดละเอียด (รูป/ชื่อ EN+TH/ตำแหน่ง/แผนก/level/จำนวนลูกน้อง)
- โต้ตอบ: scroll = zoom · ลาก = pan · คลิกการ์ด = โฟกัส/center · ป้ายจำนวนลูกน้อง = ยุบ/ขยายกิ่ง · ค้นหา = กระโดด+ไฮไลต์ · มี MiniMap + Controls
- **Backend**: `GET /api/employees/org-chart` (gate `employees.view`, ตัด resigned, นับ `reports_count` เฉพาะลูกน้อง active) · `OrgChartNodeResource`
- **Frontend**: `lib/org-tree.ts` (helper บริสุทธิ์ — forest / prune / dagre layout + cycle guard) · `components/employees/org-chart/*` (tab, node, toolbar) · `useOrgChart`
- มุมมองโฟกัสรายคน (Design B) ถูก note ไว้สำหรับหน้า Details ในอนาคต (ดับเบิลคลิก node)
- **ตรวจสอบ**: `OrgChartTest` 5 ผ่าน · `tsc` ✅ · `npm run build` ✅

---

## Sections (หน่วยงาน) — ชั้นหน่วยงานระหว่างแผนก↔พนักงาน

> spec: `docs/superpowers/specs/2026-06-09-employee-sections-design.md` · plan: `docs/superpowers/plans/2026-06-09-employee-sections.md`

- โครงสร้าง: **แผนก → หน่วยงาน (Section) → พนักงาน** · `sections` (department_id FK, ลบแผนก = ลบ section ตาม) · `employees.section_id` (nullable, ลบ section = null)
- section ที่เลือกให้พนักงานต้องอยู่ใน**แผนกเดียวกัน** (ตรวจที่ `StoreEmployeeRequest`)
- แท็บ **"หน่วยงาน"** ในหน้า Employees: ตารางหน่วยงาน (แผนก/ชื่อ/จำนวนสมาชิก) เพิ่ม/แก้/ลบ · ฟอร์มพนักงานเลือกแผนก→หน่วยงานแบบ cascading (เปลี่ยนแผนกล้าง section)
- Backend: `sections` API (`SectionController`/`SectionResource`/`StoreSectionRequest`) · Frontend: `sections-tab`, `section-modal`, `useSections`/`useSectionMutations`
- **ผังองค์กรยังไม่แตะ** (section เป็นข้อมูล HR แยกจาก manager tree — รวมเข้าผังเป็นเฟสถัดไป)
- **ตรวจสอบ**: `SectionApiTest` + `EmployeeApiTest` ผ่าน · `tsc` ✅ · `npm run build` ✅

---

## UI Confirmations + Section Code/Filter + Dev Setup (2026-06-13)

### Confirm Dialog (มาตรฐานใหม่ แทน SweetAlert2 / window.confirm)
- `resources/js/components/ui/confirm-dialog.tsx` — `<ConfirmProvider>` (mount ที่ root) + hook `useConfirm()` คืน `Promise<boolean>`
- 3 variant: **danger** (ลบ/แดง), **edit** (บันทึก/น้ำเงิน), **warn** (เตือน/เหลือง) · ดีไซน์ minimal (icon chip 40px, `text-lg`, shadow-lg) · ปุ่ม Cancel→Confirm · danger โฟกัส Cancel กัน Enter พลาด
- ส่ง `action` ได้ → dialog โชว์ **spinner → ✓** เองแล้วปิด (จับ error ในตัว) · `hideCancel` สำหรับ notice ปุ่มเดียว · `entity` ไฮไลต์ record · description รองรับขึ้นบรรทัด (`\n`)
- **แปลง confirm/Swal ทั้งโปรเจกต์** (Settings, Employees, Permissions, Contracts, Stock, Email) → `useConfirm()` · error/success popup → toast (`useToastStore`) · `sweetalert2` ไม่ถูก import ในโค้ดแล้ว
- `DataTable` เพิ่ม slot **`filters`** (ฝั่งซ้ายติดช่องค้นหา) แยกจาก `actions` (ขวา)
- mockup: `docs/mockup/confirm-dialog.html`

### Employee — View Detail drawer (ครบขึ้น)
- โชว์ชื่ออีกภาษา (ใต้ title), `username` (ต่อท้ายบรรทัดบัญชี), ป้าย **Administrator** (super admin), การ์ด **รายละเอียดลาออก** (วันสุดท้าย + เหตุผล) เฉพาะตอน resigned

### Section (หน่วยงาน)
- **รหัส `SEC-####`**: migration เพิ่มคอลัมน์ `code` (unique) + backfill ของเดิม · auto-gen ใน `Section::booted()` ตอน create · ส่งใน `SectionResource` + type · คอลัมน์ "รหัส" ในตาราง + แก้ที่หัวข้อ modal
- **กันลบเมื่อยังมีพนักงาน**: `SectionController::destroy` ตอบ 422 ถ้า `employees()->exists()` (FK เป็น nullOnDelete) · frontend เด้ง dialog (`warn`, ปุ่มเดียว) ให้ย้าย/ลบพนักงานก่อน
- **Filter + Order by**: กรองตามแผนก + เรียงตาม (รหัส / แผนก / ชื่อ / สมาชิก) + ค้นหา · สลับคอลัมน์ให้ หน่วยงาน มาก่อน แผนก

### Dev setup / fixes
- รองรับ **MariaDB**: แก้ `config/database.php` deprecation `PDO::MYSQL_ATTR_SSL_CA` (PHP 8.5) แบบเลือกค่าตามเวอร์ชัน
- แก้ **login ผ่าน `localhost`**: เพิ่ม `SANCTUM_STATEFUL_DOMAINS` ใน `.env`
- **Auto-install script**: `docs/install-server-dev/install-dev.sh` (idempotent) + `readme.txt` (troubleshooting)

**ตรวจสอบ**: `tsc` ✅ · `eslint` (เฉพาะไฟล์ที่แก้) 0 error ✅ · `php -l` ✅ · migration + auto-gen รหัสทดสอบแล้ว ✅

---

## Position — เปลี่ยนจาก "Level" เป็น "ลำดับชั้น" (Rank ladder) — 2026-06-13

เดิม Position มีฟิลด์ `level` (เลข 1–14 เลือกเอง) ใช้แสดงผลอย่างเดียว ไม่ผูกกับ logic ใด ๆ
เปลี่ยนเป็น **บันไดเรียงลำดับเส้นเดียว `rank`** (ไม่ซ้ำ ต่อเนื่อง, **rank 1 = สูงสุด**) แล้วใช้ตรวจสายบังคับบัญชา

### หลักการ
- ตำแหน่งใหม่ต่อท้ายบันไดอัตโนมัติ (`rank = max+1`) — ไม่ต้องกรอกเลขเอง
- จัดลำดับผ่านหน้า **"ลำดับชั้นตำแหน่ง"** (เลื่อนขึ้น-ลง แล้วบันทึก) แทนปุ่ม 1–14 เดิม
- เทียบกัน: A สูงกว่า B เมื่อ `A.rank < B.rank` (`Position::outranks()`)

### กฎการเช็ค (หัวหน้าต้องสูงกว่าลูกน้องเสมอ — เช็คลูกน้องทุกชั้นใต้คนนั้น)
1. **เปลี่ยน Position พนักงาน** → บล็อก ถ้าลูกน้อง (ทุกระดับ) มี `rank ≤` ตำแหน่งใหม่ (`StoreEmployeeRequest`)
2. **เปลี่ยนหัวหน้า (manager)** → บล็อก ถ้าตำแหน่งหัวหน้าใหม่ `rank ≥` ตำแหน่งพนักงาน
3. **จัดลำดับ Position ใหม่** → เตือน: `PUT /api/positions/reorder` ตรวจหา conflict ก่อน, ตอบ 422 (`reorder_conflict` + รายชื่อ) ให้ frontend เด้ง confirm แล้วส่งซ้ำด้วย `force`
- ฝั่งใดไม่มี position → ข้ามการเช็ค

### ไฟล์หลัก
- **DB**: migration `..._rename_position_level_to_rank` (rename + backfill level สูง→rank 1 + unique) · `Position` model (`rank`, auto-append, `outranks()`) · `Employee::descendantIds()`
- **API**: `PositionController@reorder` (dry-run/`force`, two-phase write กัน unique ชน) · route `positions/reorder` (ก่อน apiResource) · `StorePositionRequest` ตัด rule `level` · `PositionResource` `level→rank` · เอา `level` ออกจาก `OrgChartNodeResource`/`ApproverNodeResource`
- **FE**: `position-modal` (ชื่ออย่างเดียว) · **`position-ladder-dialog`** (แทน `position-level-preview` เดิม) · types/`orgApi`/`use-org` (`reorder`) · เอา badge "Lv" ออกจาก org chart + approval chain · i18n + audit-format
- **Seed**: `OrgSeeder` เรียง position บน→ล่าง กำหนด rank ตามลำดับ (VP = rank 1)

### หมายเหตุ
- รัน `php artisan migrate` บน DB จริงเพื่อ rename `level→rank` (ข้อมูลถูก backfill อัตโนมัติ)
- **แถม (แก้ที่ต้นเหตุ)**: บน sqlite (เทส) migration rename `code→tag` ไม่ได้ rename ชื่อ index ทำให้ `departments_code_unique` ค้างอยู่บน `tag` แล้วชนกับ index ที่ `..._add_code_to_departments_table` สร้างใหม่ → เทสทั้งชุดรันไม่ได้ · แก้โดยให้ migration rename เพิ่ม `renameIndex('departments_code_unique','departments_tag_unique')` (ตามคอลัมน์) แล้ว `add_code` ใช้ชื่อ default ได้สะอาดทั้ง sqlite + MariaDB · ผลลัพธ์ fresh: `departments_code_unique → code`, `departments_tag_unique → tag`

**ตรวจสอบ**: `php artisan test` 436 passed ✅ (รวม `PositionRankTest` 8 เคสใหม่) · fresh sqlite migrate index สะอาด ✅ · `tsc --noEmit` 0 error ✅ · `npm run build` ✅

---

## Position — ปรับจากบันไดเส้นเดียวเป็น Tree (parent_id) — 2026-06-13

> **แทนที่หัวข้อ Rank ladder ด้านบน** — บันไดเส้นเดียว (rank ไม่ซ้ำ) บังคับให้ทุกตำแหน่งต่างระดับกันหมด แต่จริง ๆ มีตำแหน่ง**ระดับเดียวกัน (เสมอกัน)** จึงเปลี่ยนเป็นลำดับชั้นแบบต้นไม้

### หลักการ
- ทุก position มี **`parent_id`** (ชี้ตำแหน่งที่สูงกว่า, null = ระดับบนสุด) — เป็น tree
- **ระดับ = ความลึก (depth) จาก root** (root = 0) · ตำแหน่งที่ลึกเท่ากัน = **ระดับเดียวกัน (เสมอกันได้)**
- เทียบกัน: A สูงกว่า B เมื่อ `depth(A) < depth(B)` (`Position::outranks()`) · depth คำนวณสด + cache ต่อ request (`Position::depthMap()`)
- ตั้ง parent ตอนสร้างได้ในฟอร์ม · ย้ายตำแหน่งทีหลังผ่านหน้า **"ผังลำดับชั้นตำแหน่ง"**

### กฎการเช็ค (หัวหน้าต้องลึก<ลูกน้องเสมอ — เท่ากัน=บล็อก, เช็คลูกน้องทุกชั้น)
1. **เปลี่ยน Position พนักงาน** → บล็อก ถ้าลูกน้อง (ทุกระดับ) มี `depth ≤` ตำแหน่งใหม่ (`StoreEmployeeRequest`)
2. **เปลี่ยนหัวหน้า (manager)** → บล็อก ถ้าตำแหน่งหัวหน้าใหม่ `depth ≥` ตำแหน่งพนักงาน
3. **ย้าย Position (เปลี่ยน parent)** → `PUT /api/positions/{id}/parent` · cycle (ลงใต้ตัวเอง/ลูกหลาน) = บล็อกถาวร 422 · ขัดสายบังคับบัญชา = 422 `parent_conflict` + รายชื่อ → frontend เด้ง confirm → ส่งซ้ำ `force`

### ไฟล์หลัก (เปลี่ยนจากเวอร์ชัน rank)
- **DB**: migration `..._convert_positions_rank_to_parent_tree` (เพิ่ม `parent_id` self-FK nullOnDelete + backfill chain จาก rank + drop rank)
- **Model**: `Position` (`parent_id`, `parent()`/`children()`, `depthMap()` memoized+override, `depth()`, `descendantIds()`, `outranks()` by depth)
- **API**: `PositionController@setParent` (cycle + conflict by depth) แทน `@reorder` · route `positions/{position}/parent` · `update` เหลือ rename อย่างเดียว · `PositionResource` → `parent_id` + **`level`** (1-based, root = Level 1; = depthMap+1) — เปิดเผยไว้ให้ **Workflow Approve** อ้างอิง (ตำแหน่ง level เดียวกัน = เสมอกันในขั้นอนุมัติ)
- **FE (Tier lanes)**: `position-modal` (เลือก parent ตอนสร้าง) · `position-ladder-dialog` → **มุมมอง Tier lanes** (1 แถว = 1 ระดับ, ระดับ 1 บนสุด, **ไม่มีเส้นเชื่อม** แบ่งกลุ่มตาม level) · pill ลากวางบน pill อื่น = ให้ขึ้นกับตำแหน่งนั้น (level เปลี่ยนตาม) · ใช้ **`@dnd-kit/core`** (pointer/touch/keyboard) + DragOverlay · กัน cycle โดยปิด droppable ของ self+ลูกหลาน · มี rail "ตั้งเป็นระดับ 1" · types `parent_id`+`level` · `setParent` ใน orgApi/use-org
- **deps ใหม่**: `@dnd-kit/core` ^6.3.1, `@dnd-kit/utilities` ^3.2.2 (รองรับ React 19)
- **Seed**: `OrgSeeder` seed เป็น chain (VP = Level 1 → … → Subcontract = Level 14)
- **Mockup สำรวจดีไซน์**: `docs/mockup/position-hierarchy-layouts.html` (4 เลย์เอาต์: Nested / Org chart / **Tier lanes (เลือกใช้)** / Sunburst), `position-hierarchy-boxchain.html`, `position-hierarchy.html`

**ตรวจสอบ**: `php artisan test` **438 passed** ✅ (`PositionRankTest` 10 เคส: demote/manager/same-level/cycle/conflict-force/permission) · `tsc --noEmit` 0 ✅ · `npm run build` ✅ (ไม่ต้อง migrate — `level` คำนวณจาก tree ที่มีอยู่)

---

## ⛔ ยกเลิกฟีเจอร์ Position levels/hierarchy ทั้งหมด — 2026-06-13

> **ลบทิ้งทั้งหมด** (แทนที่ทุกหัวข้อ Position ด้านบน: Rank ladder, Tree/parent_id, Tier lanes) ตามที่ตัดสินใจไม่ใช้แนวคิด level/hierarchy ของตำแหน่ง · **Position = แบน เหลือแค่ `code` + `title`**

- **DB**: ลบ migration `add_level_to_positions`, `rename_position_level_to_rank`, `convert_positions_rank_to_parent_tree` · ตาราง `positions` เหลือ `id, code, title, timestamps` · รัน `migrate:fresh --seed` แล้ว
- **Backend**: `Position` model เหลือ `code/title` + auto-code + `employees()` · `PositionResource` เหลือ `id/code/title/employees_count` · `PositionController` กลับเป็น CRUD ปกติ (เอา `setParent`/conflict/cycle ออก) · ลบ route `positions/{position}/parent` · `StoreEmployeeRequest` เอาเช็ค rank/depth ออก (เหลือ section + manager loop) · `Employee::descendantIds()` ลบ · `OrgSeeder` seed positions แบบแบน
- **Frontend**: ลบ `position-ladder-dialog.tsx` · `position-modal` เหลือกรอกชื่อ · types/`orgApi`/`use-org` เอา level/parent/setParent ออก · ลบปุ่ม + dialog ในหน้า Employees · เอา i18n keys (`pos_tree*`, `pos_reorder*`, `pos_parent*`, ฯลฯ) + audit-format `rank` ออก
- **ถอด dependency**: `@dnd-kit/core`, `@dnd-kit/utilities`
- **ลบ mockup**: `docs/mockup/position-hierarchy*.html` ทั้งหมด
- **Tests**: ลบ `PositionRankTest` · ปรับ `ApprovalChainTest` + `OrgSeederTest` เป็นแบบ flat
- คงไว้: บั๊กฟิกซ์ index `departments_code_unique → departments_tag_unique` (คนละเรื่องกับ position levels)

**ตรวจสอบ**: `php artisan test` **428 passed** ✅ · `tsc --noEmit` 0 ✅ · `eslint` 0 ✅ · `npm run build` ✅ · `positions` = `id, code, title` ✅

---

## 🐞 Bugfix — Confirm "ยืนยันการย้าย" เด้งแวบหายเอง (Edit พนักงาน) — 2026-06-14

**อาการ:** แก้ไขพนักงานแล้วเปลี่ยน org (ตำแหน่ง/แผนก/หัวหน้า) → กด Save → dialog
"Confirm organizational change / ยืนยันการย้าย" **โผล่แวบ ~0.5 วิแล้วหายเอง** ตอนฟอร์มปิด ไม่เคยกดยืนยันได้จริง

**Root cause:** org-change confirm ถูก render เป็น Radix `<Dialog>` แยก **ซ้อนทับ** edit dialog
(sibling) → 2 dialog ซ้อนกันทำให้ Radix แย่ง focus-trap กัน ตัวในถูกกดทับไว้ แล้ว exit-animate
(แวบ) ตอน `open` กลายเป็น false — **บั๊กชนิดเดียวกับ manager-loop Warning ที่แก้ไปก่อนหน้า**
(ซึ่งแก้ด้วยการทำเป็น inline ตามคอมเมนต์ใน `add-employee-drawer.tsx`) แต่ตัว confirm ยังเป็น dialog ซ้อนอยู่

**แก้:** `resources/js/components/employees/add-employee-drawer.tsx` (edit branch)
- ย้าย org-change confirm มาเป็น **inline step ใน edit dialog เดียว** — สลับ body/footer
  เป็นหน้า confirm เมื่อ `orgConfirm=true` (ครอบ form ด้วย `{!orgConfirm && …}` + panel `{orgConfirm && …}`)
- **ลบ** sibling `<Dialog open={orgConfirm && open}>` ที่เป็นต้นเหตุ flash ออก
- เหลือ Radix Dialog ตัวเดียวตลอด → ไม่มี flash, กด Confirm & Save / Cancel ได้จริง
- backend/validation ไม่แตะ (`StoreEmployeeRequest` + `Employee::isAncestorOf` ทำงานถูกอยู่แล้ว)

**ตรวจสอบ:** `tsc --noEmit` 0 ✅ · `eslint` 0 ✅ — verify ใน UI: แก้หัวหน้าเป็นคนปกติ→confirm
แสดงในฟอร์มกดได้, แก้เป็นลูกน้องตัวเอง→confirm→Save→manager-loop warning เด้ง inline, เปิด Edit
แล้วปิดเฉย ๆ→ไม่มี dialog แวบ

---

## คำสั่งที่ใช้บ่อย

```bash
php artisan migrate:fresh --seed   # reset + seed ใหม่
php artisan optimize:clear         # ล้าง cache ทั้งหมด
php artisan route:list             # ดู routes ทั้งหมด
npm run build                      # build frontend
npm run lint                       # eslint --fix
```

---

## 🕗 รอทำ (Pending / TODO) — อัปเดต 2026-08-13

### Access Control — Phase 2 ✅ ทำแล้ว / ปิดเรื่องแล้ว
- **Access Requests + approval workflow** — ทำแล้วเมื่อ 2026-08-01 แต่**ไม่ได้แยกเป็นตาราง `access_requests` ตามแผนเดิม**: คำขอสิทธิ์เข้าถึง (email / fileshare / social / software) เป็น 4 ประเภทในโมดูล Request ที่วิ่งบน `workflows` ตัวเดียวกับคำขออื่น ๆ — ไม่มีระบบอนุมัติซ้อนสองชุด
- **การให้สิทธิ์จริง = งานมือของเจ้าหน้าที่ ตามที่ตัดสินใจไว้ (2026-08-13)** ไม่เรียก `AccessService::grant()` อัตโนมัติเมื่ออนุมัติครบ · วงจรปิดครบอยู่แล้วโดยไม่ต้องมีโค้ดเชื่อม: อนุมัติครบ → `auto_ticket` เปิดเคสให้ทีม IT → IT เพิ่มสมาชิกในทะเบียนด้วยมือ (ซึ่งเป็นขั้นที่ต้องตรวจของจริงบน AD/Server อยู่ดี) → ปิดเคส → `RequestService::settleFromTicket()` ปิดคำขอตามให้เอง
- KPI "คำขอค้าง" บนหน้า Access — ไม่ทำ (หน้า Requests มีตัวเลขรออนุมัติของตัวเองแล้ว) หน้า Access คงเป็น **Total grants** ต่อไป

### Access Control — เก็บรายละเอียดเล็ก
- คอลัมน์ **"Created"** ในตาราง mail groups/file shares: ยังไม่โชว์ (ต้องเพิ่ม `created_at` ใน `EmailGroupResource`/`FileShareResource` ก่อน)
- ปุ่ม **Export** บน header (ดีไซน์มี) ยังไม่ทำ

### Employee detail — แท็บจากดีไซน์เดิม ✅ ครบแล้ว
- Overview / Organization / Access / **Assets** / **Tickets** / **Requests** ทำแล้วทั้งหมด (Requests เป็นตัวสุดท้าย 2026-08-13)

---

## 🔧 ปรับปรุง UI — อัปเดต 2026-06-14 (Org Chart + Employee view detail)

ไฟล์ที่แก้: `resources/js/components/employees/org-chart/org-chart-tab.tsx`, `resources/js/components/employees/employee-view-drawer.tsx`

### Org Chart Tab
1. **Touchpad zoom ลื่นขึ้น** — pinch บน touchpad มาเป็น `wheel` event ที่ `ctrlKey=true` แต่ delta เล็กมาก เลยขยับช้า ตอนนี้แยกค่า sensitivity: `PINCH_SENSITIVITY = 0.02` (pinch/⌘+wheel — ตามนิ้ว) กับ `WHEEL_SENSITIVITY = 0.003` (mouse wheel ปกติ — คงเดิม)
2. **Auto-fit ตามการขยายของผัง** — เดิม refit เฉพาะตอนสลับแนว; เพิ่ม refit แบบ debounce (120ms, animate) เมื่อจำนวน node ที่มองเห็นเปลี่ยน (expand/collapse/collapse-all) มี `skipFit` guard กันชนกับ "jump to person" (ค่า fit = `padding 0.12`, ตอนโหลด `0.16`)

### Employee view detail (dialog)
3. **สีระบบแทนสีตาม Tag** — ส่วนหัว/chrome ของ dialog เป็น **neutral** (cover, avatar ring, แท็ก code+แผนก, การ์ด Overview ใช้สี border/muted/card ไม่มีน้ำเงิน) คงสี `var(--brand)` ไว้เฉพาะ **แท็บ active + ปุ่ม Edit** ส่วนสีตามแผนกใช้เฉพาะการ์ดในแท็บ **Organization**. รูป avatar เปลี่ยนเป็น **วงกลม** (`rounded-full`)
4. **แท็บ Organization = org explorer สไตล์ Microsoft Teams** (ตาม `docs/mockup/org-focus.png`) — การ์ดแนวนอนเต็มกว้าง: สายบังคับบัญชา (บน) → คนที่ดู (การ์ดใหญ่ มี count ใต้สังกัด/โดยตรง) → ลูกน้อง (grid 2 คอลัมน์ ใต้หัวข้อ "People reporting to …")
   - **ไม่ show ทั้งหมด** — สายบังคับบัญชาโชว์แค่ 2 ระดับใกล้สุด ที่เหลือยุบเป็นปุ่ม **"Show N more"** (มี avatar stack) ด้านบน; ลูกน้องโชว์ 6 คน เกินนั้นมีปุ่ม "Show N more"
   - **คลิกการ์ดหัวหน้า/ลูกน้องเพื่อเดินไปดูผังของคนนั้นต่อ** + ปุ่ม **Home / Back / Next** มุมซ้ายบน (navigation history)
   - **ปุ่ม "View profile"** บนการ์ดโฟกัส → สลับ dialog ไปดูพนักงานคนนั้นเต็มรูปแบบเลย (หน้า page โหลดด้วย `useEmployee(id)` แล้ว `setViewEmp`)
   - 👥 = จำนวนคนใต้สังกัดทั้งหมด (คำนวณ subtree จาก `orgNodes`), avatar ใช้ `photo_url` ถ้ามี ไม่งั้นเป็นตัวย่อ
5. **Footer** — เอา email มุมซ้ายล่างออก, ย้ายปุ่ม **Cancel** ไปไว้ซ้าย
6. **Badge สถานะบัญชี** — ย้าย "No login account / Has login account" จาก rail มาเป็น badge ข้าง badge สถานะ (active/resigned) บน cover
7. **เอา section "ACCOUNT & ACCESS" ออก** — ย้ายปุ่ม **Reset password / Resign / Cancel resignation** ไปไว้ที่ footer ข้างปุ่ม Edit (Set credentials ยังเป็นการ์ดเตือนเดิม)

✅ ผ่าน `tsc --noEmit` และ `eslint` ทั้งสองไฟล์

---

## 🧩 ฟีเจอร์ — อัปเดต 2026-06-14 (Position: Allow Special Position + ปรับ Edit dialog)

### Position "Allow Special Position" (สวิตช์ต่อตำแหน่ง)
ตำแหน่งที่เปิดสวิตช์นี้ = **ตำแหน่งพิเศษ** พนักงานในตำแหน่งนั้นบันทึกได้โดย**ไม่ต้องมีทั้ง Department และ Report to** (เช่นตำแหน่งระดับสูงสุด/ไม่สังกัด)
- **DB**: คอลัมน์ `positions.allow_special_position` (boolean, default false) — migration สร้าง `allow_no_department` แล้ว rename เป็น `allow_special_position`
- **Model/Resource/Request**: `Position` fillable+cast, `PositionResource` ส่งค่า, `StorePositionRequest` validate boolean
- **Validation พนักงาน** (`StoreEmployeeRequest`): เลือก position ปกติ → **`department_id` และ `manager_id` required**; เลือก position พิเศษ (หรือไม่เลือก position) → ทั้งคู่ optional
- **UI**: 
  - คอมโพเนนต์ใหม่ `components/ui/switch.tsx` (toggle h-5×w-9)
  - **Position modal**: สวิตช์ "Allow Special Position" + **Warning confirm** ตอน toggle (ทั้ง add/edit)
  - **ตาราง Position tab**: คอลัมน์ toggle กดสลับได้ทันที (กั้นสิทธิ์ org-manage) + **Warning confirm** + **icon (i) tooltip** อธิบายที่หัวคอลัมน์ (`Column.header` รับ ReactNode ได้แล้ว)
  - **ฟอร์ม Add/Edit พนักงาน**: ช่อง Department **และ Report to** ตัด required อัตโนมัติเมื่อ position ที่เลือกเป็นพิเศษ (Report to = required ปกติ)
  - label **Manager → "Report to"**
- **Tests**: `EmployeeApiTest` 2 เคส (ตำแหน่งปกติ require dept+report-to / ตำแหน่งพิเศษข้ามทั้งคู่) — รวมทั้งชุด **440 passed**

### Edit employee dialog — ปรับ UX
- สี chrome เป็น **neutral/system** (ไม่ตามแผนก), เอาสี+avatar ออกจาก header
- ปุ่ม Save lifecycle: **ยังไม่แก้ → จางๆ ไม่มี icon** · **กำลังบันทึก → spinner "Saving…"** · **สำเร็จ → ✓ "Saved"** (โชว์ 1.2s แล้วปิด) ผ่าน `isDirty` + `saved` state
- label **Manager → "Report to"** (`emp_manager`, `emp_org_change_manager`)
- Department dropdown ค้นหาได้ (`SearchableSelect`)

---

## 🔐 Permission — อัปเดต 2026-07-01 (Employee Control = tree แบบ Stock + full enforcement)

ปรับ card สิทธิ์ **Employee** ในหน้า Role Template จาก list ธรรมดาให้เป็น **master → view → management tree with cascade** เหมือน Stock Module พร้อม enforce จริงทั้ง frontend + backend

### โครงสร้างสิทธิ์ (catalog `employees.*` — 25 keys)
```
employees.module               ← MASTER (คุมโมดูล + ไอคอน sidebar เหมือน stock.module)
├─ view_dashboard   (tab Dashboard)          [single-switch]
├─ view             (tab Directory)  [View]  → add · import · edit · reset_password · resign · cancel_resign · set_credentials
├─ view_section     (tab Sections)  [View]   → section_add · section_edit · section_delete
├─ view_department  (tab Departments)[View]  → department_add · department_edit · department_delete
├─ view_position    (tab Positions) [View]   → position_add · position_edit · position_delete · position_special
├─ view_org         (tab Org chart)          [single-switch]
└─ edit_own         ← STANDALONE (ไม่ถูก master ปิด — self-service ทุกผู้ใช้แก้โปรไฟล์ตัวเองได้)
```

### Backend
- `Permissions.php`: catalog 25 keys, `employeeHierarchy()` + `normalizeEmployees()` (mirror `stockHierarchy`/`normalizeStock`; `edit_own` เป็น standalone ไม่ถูกตัดแม้ไม่มี master), defaults admin/hr ได้ module + view groups (org CRUD = super เท่านั้น)
- `RolePermissionController::update` เรียก `normalizeEmployees()` ตอน save (ต่อจาก normalizeStock/normalizeSettings)
- **Write enforcement** (mirror Stock): Section/Department/Position `store`/`update`/`destroy` gate ด้วยสิทธิ์ granular (`*_add`/`*_edit`/`*_delete`) ผ่าน `FormRequest::authorize()` (แยก store/update ด้วย route binding) + controller; `allow_special_position` toggle gate ด้วย `position_special` ผ่าน `guardSpecialFlag()` (403 เฉพาะเมื่อค่าจะเปลี่ยน)
- **View enforcement**: `employees/summary`→`view_dashboard`, `employees/org-chart`→`view_org`, directory browse (`?page=`)→`view`. **คง reference reads เปิดไว้** (dropdown departments/positions/sections + employee picker ที่โมดูลอื่นใช้) — ไม่ gate เพื่อไม่ให้ฟอร์ม Asset/Contract/Ticket พัง
- **Migration** `backfill_employee_module_permissions` (idempotent): grant `module`/`view_dashboard`/`view_org` ให้ทุก role ที่มี `employees.view` อยู่แล้ว เพื่อไม่ให้เมนู/แท็บหายหลัง deploy

### Frontend
- คอมโพเนนต์ใหม่ `components/permissions/employee-permission-tree.tsx` (mirror `stock-permission-tree.tsx` + แถว standalone `edit_own` ที่ master ไม่ lock)
- `pages/permissions/index.tsx` render tree แทน fallback card สำหรับ module `employees`
- `permission-labels.ts`: label en/th + LIVE flags ครบ 16 key ใหม่
- `nav.ts`: เมนู `/employees` gate ด้วย `employees.module`
- `pages/employees/index.tsx`: แทน `canManageOrg` (super-only) ด้วยสิทธิ์ granular — ซ่อน tab ตาม `view_*`, ปุ่ม add/edit/delete/special ตามสิทธิ์; fallback ไป tab แรกที่มองเห็นได้; `sections-tab.tsx` prop `canManage` → `canAdd`/`canEdit`/`canDelete`

### Tests
- `tests/Unit/EmployeePermissionHierarchyTest` (catalog 25 keys, cascade/normalize, edit_own standalone, defaults consistent)
- `tests/Feature/EmployeePermissionGatingTest` (normalize on save, write 403/200 ต่อสิทธิ์, `position_special` toggle, reference reads เปิด, dashboard/org/directory browse gating)
- ✅ ชุดที่เกี่ยวข้อง 40 passed (151 assertions); `tsc --noEmit` + `npm run build` ผ่าน; EmployeeApiTest/OrgChartTest เดิมไม่กระทบ (ใช้ super)

## 🏗️ Modular Restructure Migration (Frontend + Backend) — อัปเดต 2026-07-02

ย้ายโครงสร้างทั้งโปรเจกต์จาก **layer-based มาตรฐาน** → **Feature-First Modular (frontend)** + **Domain sub-namespace (backend)** ตามสัญญาโครงสร้างใน `CLAUDE.md` แบบ **ไม่ big-bang** — ทำทีละเฟส, ทุกการย้ายใช้ `git mv` (คง history), และแต่ละเฟส build/test เขียวก่อนไปต่อ **ไม่เปลี่ยน public behavior**

### Frontend — `resources/js/` เป็น feature-first
- **i18n รวมศูนย์** → `lang/<locale>/<module>.ts` + `lang/index.ts` (merge + `useT()`); parity-verified กับ dict เดิมทุก key/ค่า
- **ของกลาง/เชลล์** → `shared/{ui,components,hooks,lib,types}` + `app/{App.tsx,router,providers,nav,layout}`
- **12 โมดูลฟีเจอร์** → `modules/<feature>/{components,pages,hooks,api,types,index.ts}` — import ข้ามโมดูลผ่าน **barrel `@/modules/<x>`** เท่านั้น
- โครงสุดท้าย: `resources/js/{app, modules, shared, lang, stores}` — ไม่มี `pages/ components/ services/ hooks/ lib/` แบบ flat เดิม

### Backend — `app/` เป็น domain sub-namespace `App\<Layer>\<Domain>\`
- ย้ายทีละโดเมน (เล็ก→ใหญ่): **Auth → Access → Notification → Email → Permission → Settings → Ticket → Contract → Asset → Employee → Stock**
- แต่ละโดเมนจัดกลุ่มครบทุก layer: `Models/ Http/Controllers/Api/ Http/Requests/ Http/Resources/ Services/ Enums/` ใต้ `<Domain>/`
- **Master data** (Brand/Category/AssetModel/Vendor/WarrantyType/Unit/Location) → รวมใน **`Settings` domain** (ตรงกับ frontend ที่จัดการ master data ใต้ settings + gate `settings.masterdata`); Warehouse → `Stock`
- **Cross-cutting คงไว้ระดับบน** (ไม่เข้าโดเมน): `App\Models\User`, `App\Models\AuditLog`, `App\Enums\UserRole`, ทั้ง `App\Support\*`, `App\Jobs\*`, `App\Mail\*`, `App\Notifications\*`, `App\Console\*`, `App\Http\Middleware\*`, `App\Http\Controllers\Controller`
- ผลลัพธ์: `app/Models/` เหลือแค่ `User.php` + `AuditLog.php`; ทุก layer เป็น domain-namespaced

### Naming alignment — FE ↔ BE เอกพจน์ให้ตรงกัน
- Rename `modules/{assets,contracts,employees,notifications,permissions,tickets}` และ `lang/<locale>/*.ts` → **เอกพจน์** ให้ตรงกับ backend domain (`Asset/Contract/Employee/Notification/Permission/Ticket`)
- คงไว้ตามตั้งใจ: `email-templates` (FE) ↔ `Email` (BE), และ `dashboard`/`requests` (FE-only)

### Gotchas / บทเรียน (backend)
- **Model ที่มี factory + ย้าย sub-namespace** (Ticket, Asset) → auto-discovery หา factory ไม่เจอ ต้องใส่ `protected $model` ใน factory + `newFactory()` ใน model
- **โฟลเดอร์ชื่อตรงกับคลาส** (Ticket/Asset/Contract/Employee) → แทน FQCN ต้องทำ **ก่อน** แก้ namespace declaration ไม่งั้น `namespace App\Models\Ticket` โดนซ้อนเป็น `...\Ticket\Ticket`
- **bare same-namespace refs** (`User::class`, `Employee::class` ฯลฯ ในไฟล์ที่ย้าย/ที่คงไว้) มองไม่เห็นด้วย grep FQCN → ต้องเพิ่ม `use` ให้ครบ; **ชุดเทสต์คือตาข่ายจับ**

### Verification (ทุกเฟสต้องเขียว)
- **Backend**: `php artisan test --compact` = **466 passed / 0 failed** ทุกโดเมน + `vendor/bin/pint --dirty` + `composer dump-autoload`
- **Frontend**: `npx tsc --noEmit` (exit 0) + `npm run build` (green) ทุกโมดูล
- **1 เฟส = 1 commit** (git mv คง history) — rollback ต่อเฟสได้ ไม่มีการแก้ DB/migration

---

## 🔗 Master Data → FK Normalization — อัปเดต 2026-07-07 (Phase 1–6 ✅ ครบทุกเฟส)

Master data ที่เคยถูก **ก๊อปเป็น string** ลงตารางอ้างอิง (เช่น `assets.location`, `stock_items.unit`) เปลี่ยนมา **ผูกด้วย FK id** ไปตาราง master — แก้ชื่อ master ที่เดียวสะท้อนทุกที่, ลบ master ที่ยังถูกใช้ไม่ได้, ไม่มีข้อมูลค้าง/สะกดเพี้ยน แผนเต็ม 6 เฟสอยู่ที่ `docs/superpowers/plans/2026-07-06-master-data-fk-normalization.md`

### Pattern มาตรฐาน (ใช้ซ้ำทุกเฟส)
- **Migration ต่อคอลัมน์**: (1) สร้าง master ที่ขาดจากชื่อเดิม (`updateOrInsert` บนชื่อ trim) → (2) เพิ่ม `*_id` (nullable, `constrained()->restrictOnDelete()`) → (3) backfill id ด้วย **correlated subquery** บน `TRIM(name)` (SQLite-safe, ห้าม `UPDATE…JOIN`) → (4) drop คอลัมน์ string เดิม · `down()` สร้างคอลัมน์คืน + backfill ชื่อจาก relation
- **API Resource** คงคีย์ชื่อเดิมไว้ (resolve ผ่าน relation → auto-reflect rename) **บวก** `*_id` ใหม่ — display code เดิมไม่ต้องแก้; forms/filters ส่ง id
- **กันลบเมื่อถูกใช้**: guard ที่ **app layer → HTTP 409** (SQLite ไม่ enforce `restrictOnDelete` ใน test) + FK เป็น defense-in-depth
- **Eager-load** relation บน list/show เพื่อกัน N+1

### Phase 1 — Locations (`assets.location` → `location_id`)
- `Asset::location()` relation + `AssetResource` ส่ง `location`(ชื่อ)+`location_id`; transfer drawer + `AssetService::transfer()` เลือกด้วย id; `LocationController::destroy` → 409 เมื่อมี asset ใช้อยู่
- แยก migration: FK conversion + **unique index บน `locations.name`** + dedup ชื่อซ้ำก่อน backfill (self-healing บน MariaDB — กัน subquery คืนหลายแถว)
- Tests: rename propagation + delete-restrict ใน `AssetApiTest`; `LocationFkMigrationTest` พิสูจน์ dedup path (rollback → seed ชื่อซ้ำ → re-migrate)

### Phase 2 — Units + Warranty Types (`stock_items.unit`/`warranty` → `unit_id`/`warranty_type_id`)
- `StockItem::unit()` / `warrantyType()` relations; `StockItemResource` ส่ง `unit`/`warranty`(ชื่อ)+`unit_id`/`warranty_type_id`; `stock-item-modal.tsx` เลือกด้วย id
- **required-ness ต่างกันตามฟอร์ม**: `unit_id` = **nullable** (ฟอร์มไม่บังคับ) · `warranty_type_id` = **required** (คง behavior เดิม)
- `UnitController`/`WarrantyTypeController` `destroy` → 409 เมื่อมี stock item ใช้อยู่; eager-load `unit`,`warrantyType` บน index/show
- `StockSeeder` resolve ชื่อ→id ด้วย `firstOrCreate`; `LocationFkMigrationTest` เปลี่ยน rollback เป็น loop-จนกว่า `assets.location` กลับมา (robust ต่อ migration เฟสถัดไป)
- Tests: rename propagation + delete-restrict (unit/warranty) ใน `StockItemTest`

### Phase 3 — Brands + Asset Models (`assets`+`stock_items` `.brand`/`.model` → `brand_id`/`model_id`)
เฟสใหญ่สุด — แตะ **สองตาราง** และ model ผูกกับ brand (cascade). plan: `docs/superpowers/plans/2026-07-06-phase3-brands-models-fk.md`
- `Asset`/`StockItem` เพิ่ม relation `brand()` (→Brand) + `model()` (→AssetModel); resource ส่ง `brand`/`model` (ชื่อผ่าน relation) + `brand_id`/`model_id`; ฟอร์ม `asset-form-drawer`/`stock-item-modal` เลือกด้วย id พร้อม **cascade** (เลือกยี่ห้อ → กรองรุ่นตาม `brand_id`)
- **Model backfill ด้วย (name + brand_id) null-safe** เพราะชื่อรุ่นไม่ unique ทั้งตาราง (scoped ต่อ brand) — ไม่ match ชื่อเดี่ยว
- **ข้อมูลจริง model เป็น free-text ที่ไม่ align กับ master** (asset 6/21, stock 0/16 ตรง) — เจ้าของระบบเลือกทำเต็มแบบ create-missing → migration auto-สร้าง brand ที่ขาด 7 ยี่ห้อ (Canon/Belkin/Kingston/Logitech/…) + asset_models เพิ่ม ~29 แถวจากค่าเดิม
- ตัวอ่านชื่อ brand/model ทั้ง backend เปลี่ยนเป็น `?->name`: AssetResource · StockItemResource · AssetService (snapshot โอน) · AssetController (picker/search `whereHas`/AuditLog) · ContractResource (linked assets) · 2 Notifications · TicketResource; search เปลี่ยนเป็น `orWhereHas` + eager-load กัน N+1
- `BrandController`/`AssetModelController` `destroy` → 409 เมื่อมี asset **หรือ** stock item อ้างอิง; `AssetFactory`/`AssetSeeder`/`StockSeeder` resolve ชื่อ→id (model scoped ต่อ brand)

### Phase 4 — Categories (`assets.type` + `stock_items.category` → `category_id`)
plan: `docs/superpowers/plans/2026-07-06-phase4-categories-fk.md`
- `Asset`/`StockItem` เพิ่ม relation `category()`; resource ส่ง `type`/`category` (ชื่อผ่าน relation) + `category_id`; ฟอร์ม asset/stock เลือกด้วย id
- **`AssetTypeIcon` อ่าน icon จาก `categories.icon` อยู่แล้ว** (match ตามชื่อ) — resource คืนชื่อ category จึงทำงานต่อได้ทันที
- `assets.type` เดิมปนค่า enum อังกฤษ (`laptop`…) กับชื่อ category ไทย — เจ้าของเลือก **map enum→category ไทยที่มีอยู่** ใน migration (laptop→แล็ปท็อป …) → **ไม่เกิด category ซ้ำ** (คงที่ 20 ตัว); `stock_items.category` ตรง master 100% อยู่แล้ว
- filter (asset type / stock category) **ยังส่งชื่อ** → backend match ผ่าน `whereHas('category', name)` (UI filter/chip ไม่ต้องแก้); dashboard by-type/by-category group ตามชื่อ category ผ่าน relation
- `CategoryController::destroy` → 409 เมื่อมี asset **หรือ** stock อ้างอิง; ContractController eager-load `assets.{brand,model,category}` กัน N+1

### Phase 5 — Vendors (`assets.supplier` + `contracts.vendor` → `vendor_id`)
master ร่วม 2 โมดูล; plan: `docs/superpowers/plans/2026-07-06-phase5-vendors-fk.md`
- `Asset`/`Contract` เพิ่ม relation `vendor()`; resource ส่ง `supplier`/`vendor` (ชื่อผ่าน relation) + `vendor_id`; ฟอร์ม asset (supplier) + contract (multi-step vendor) เลือกด้วย id
- **match/display ด้วย `vendors.name`** (อังกฤษ) — ข้อมูลจริง supplier/vendor ตรง name เท่านั้น ไม่เคยตรง name_th
- `contracts.vendor` ส่วนใหญ่เป็น free-text (18/21 ไม่มีใน master — Fortinet/Zoom/Adobe/Oracle… เป็น vendor จริง) + `assets.supplier` มี junk 2 ตัว → **create-missing by name** (เหมือน Phase 3)
- ตัวอ่าน `$x->supplier`/`$x->vendor` เปลี่ยนเป็น `?->name` ทั้งหมด: AssetService (rented derive), Contract dashboard (topVendors/timeline/actionQueue), search→whereHas, ContractExpiryNotification + ContractExpiryAlertService
- **Contract import (CSV ยังเป็นชื่อ)** — `ContractService::importRows` validate ชื่อใน master แล้ว resolve → vendor_id; `VendorController::destroy` → 409 เมื่อมี asset **หรือ** contract อ้างอิง
- `AssetService::create` rented → คัด `vendor_id` จาก contract; seeders (ContractSeeder) resolve ชื่อ→id

### Phase 6 — Warehouses (`assets`/`serials`/`balances`.`warehouse` → `warehouse_id`) — เฟสสุดท้าย
plan: `docs/superpowers/plans/2026-07-07-phase6-warehouses-fk.md`
- **หลักการ current vs log:** FK เฉพาะตาราง current-state — `assets.warehouse`, `stock_item_serials.warehouse`, `stock_balances.warehouse` (+ เปลี่ยน unique เป็น `(stock_item_id, warehouse_id)`); **คง string** ตาราง log/snapshot — `stock_item_serial_events.warehouse`, `stock_counts.warehouse` (audit log ควรบันทึกชื่อ ณ เวลานั้น ไม่ให้ rename ย้อนหลัง). `stock_items` ไม่มีคอลัมน์ warehouse อยู่แล้ว; `stock_movements.from_label/to_label` เป็น free-text — ไม่แตะ
- **sentinel `'Unassigned'` → `warehouse_id = NULL`** ทุกที่ (ไม่สร้างคลังปลอมใน master); `Warehouse::resolveId()` เป็นตัวแปลงชื่อ→id กลาง
- **`StockBalanceService` คง API รับชื่อ** แล้ว resolve เป็น id ภายใน → call-site ใน movement/request/count flow ไม่ต้องแก้ (ลดความเสี่ยง); serial `->warehouse` (relation) readers เปลี่ยนเป็น `?->name`; filter/summary by-warehouse ใช้ join/whereHas by name
- `WarehouseController::destroy` → 409 เมื่อมี asset/serial/balance อ้างอิง; models เพิ่ม `warehouse()` relation; asset form เลือกด้วย id (stock/receive drawers คงส่งชื่อ)

### Verification
- **Backend**: `php artisan test --compact` = **509 passed / 0 failed** · **Frontend**: `tsc --noEmit` (0) + `npm run build` (green) · `pint` passed
- **รัน migration บน DB จริงแล้ว** (Phase 1–6 ครบ): backfill สมบูรณ์ — assets 7 + serials 22/22 + balances 14/14 ผูก warehouse_id; warehouses คงที่ 5 (ข้อมูลสะอาด ไม่สร้างซ้ำ)
- **🎉 Master Data FK Normalization เสร็จครบทั้ง 6 เฟส** — location · unit · warranty_type · brand · asset_model · category · vendor · warehouse ทั้งหมดผูกด้วย FK id แล้ว (rename propagate + delete-guard 409 ทุกตัว)

---

## 📄 Contract Lifecycle Rework — อัปเดต 2026-07-07

เปลี่ยนสถานะสัญญาที่เลย `end_date` จาก auto-"expired" เป็น **overdue** (ยังเปิดอยู่ ยังแก้ไข/ต่ออายุได้) และเพิ่ม action **Expired** ที่ admin สั่งเองแบบถาวร แยกจากการหมดอายุตามวันที่ plan: `docs/superpowers/plans/2026-07-07-contract-lifecycle-rework.md`

- **Derived status ใหม่ 4 ค่า** — `active` (ยังไม่ถึงกำหนด) › `overdue` (เลย end_date แต่ยังไม่ถูกปิด) › `cancelled` (`cancelled_at`, ยกเลิกได้/reactivate ได้) › `expired` (`expired_at`, admin สั่งปิดถาวร — ไม่มี un-expire) ลำดับความสำคัญ: `expired` > `cancelled` > `active`/`overdue` ตามวันที่ — ยังเป็น derived attribute บน model ไม่มีคอลัมน์ status เก็บตาย
- **Action ใหม่ "Expired"** ในหน้า detail drawer — ปิดสัญญาถาวรแยกจาก Cancel (reversible) คุมด้วย permission ใหม่ `contracts.cancel` (คุม Cancel/Reactivate) และ `contracts.expire` (คุม Expired) — role `admin` **ไม่ได้รับ** 2 สิทธิ์นี้โดยดีฟอลต์ (ต้องมอบสิทธิ์เพิ่มเอง), `super` bypass เสมอ
- **Write-off guard generalize ทุกประเภทสัญญา** — เดิมกันเฉพาะสัญญา hardware ตอนนี้สัญญาทุกประเภทที่มี asset ผูกอยู่ (status ≠ `writeoff`) จะถูกกันทั้ง Cancel และ Expired (422) จนกว่าจะ write-off asset ที่ผูกอยู่ให้ครบก่อน
- **ตัด `auto_renew`** ออกทั้งระบบ — drop คอลัมน์ + ฟอร์ม + import template + i18n hint ไม่มีการต่ออายุอัตโนมัติอีกต่อไป (ต่ออายุทำผ่าน action Renew เท่านั้น)
- **Alert เตือนหมดอายุ relabel เป็น "overdue"** — เทมเพลตอีเมล `contract.expired_alert` (คีย์เดิม, wording ใหม่) และ `ContractExpiryAlertService` เปลี่ยนไปไม่แจ้งเตือนสัญญาที่ถูก admin สั่ง expired ไปแล้ว (กันเตือนซ้ำสัญญาที่ปิดไปแล้ว)
- **Verification**: `php artisan test --compact` = **524 passed / 0 failed** · `tsc --noEmit` (0) + `npm run build` (green) · `pint` passed

---

## 🔄 Transfer Asset Redesign — อัปเดต 2026-07-08

เลิกผูกเจ้าของทรัพย์สินด้วย string อิสระ เปลี่ยนมาใช้ FK `assets.owner_employee_id` เป็น "ข้อเท็จจริงว่าใครถือครองอยู่" + หน้าโอนเป็น Dialog 2 โหมด + กันการ write-off ทรัพย์สินที่ยังมีพนักงานถือครอง
spec: `docs/superpowers/specs/2026-07-08-transfer-asset-redesign-design.md` · plan: `docs/superpowers/plans/2026-07-08-transfer-asset-redesign.md`

- **Data model** — เพิ่มคอลัมน์ `assets.owner_employee_id` (FK → `employees`, nullable, `nullOnDelete`) + **backfill** จาก `owner` ที่ตรง `employees.code` ใน migration เดียว (label ที่ไม่ตรง = ของกลาง คง FK เป็น null); คง `owner` string ไว้เป็น **display label** (โหมดพนักงาน = code, ของกลาง = ชื่อเรียก, pool = null) — หลัก current-vs-log เดิม (`initial_owner`/`asset_transfers` ยังเป็น snapshot string)
- **Model** — `Asset::ownerEmployee()` relation (ตั้งชื่อไม่ชน column `owner`), helper `heldByEmployee()`; resource เพิ่ม `owner_employee_id` + `owner_name` (ชื่อพนักงานในโหมดพนักงาน / label ของกลาง / null) โดย `owner` เดิมคงไว้ back-compat
- **Transfer 2 โหมด** — `AssetService::transfer(Asset, array, ?string)`: **พนักงาน** → เลือกจากรายการ (ไม่พิมพ์ ID), status `pending_acceptance`, ตั้ง FK, แจ้งเตือนผู้รับ (resolve email ผ่าน FK) · **ของกลาง (ของส่วนกลาง)** → Location + ชื่อเรียก, status `deployed` ทันที (ไม่มีคนกดรับ), FK = null, ไม่แจ้งเตือน; validate แบบ mutually-exclusive (`mode` + `required_if`)
- **Consumer ผูกกับ FK** — `mine`/`accept`/`requestReturn` เช็คจาก `owner_employee_id` แทน string; `markReceived` (คืนเข้า pool) เคลียร์ FK; `create()`/`update()` resolve FK จาก `owner` code ที่ตรง master ด้วย (กัน API/import สร้างของกำพร้า); คง `orWhere('owner','like')` เป็น search แบบ display เท่านั้น; eager-load `ownerEmployee` ใน index/show/mine
- **Write-off guard** — `bulkSetStatus(writeoff)` (+ `retire()` เชิงป้องกัน) reject 422 เมื่อ asset ใดถูกพนักงานถือครองอยู่ (`owner_employee_id != null`) โดยยกเลิกทั้ง batch พร้อมลิสต์ tag ที่ติด; ของกลาง/pool/คืนแล้ว (FK null) write-off ได้ — **ประกอบกับกฎ contract เดิม** (ต้อง write-off asset ที่ผูกให้ครบก่อนปิดสัญญา): asset พนักงานต้องคืนก่อน, ของกลาง write-off ได้เลย
- **UI** — เปลี่ยน `asset-transfer-drawer.tsx` (Sheet) → `asset-transfer-dialog.tsx` (Dialog กลางจอ) มี segmented toggle พนักงาน/ของกลาง, โหมดพนักงานใช้ `SearchableSelect` (ค้นด้วยชื่อ/รหัส/แผนก), reuse form-validation UX; types/api/hook/barrel/i18n (en+th) อัปเดต ไม่มี hardcode string
- **Verification**: `php artisan test --compact --filter=AssetApiTest` = **51 passed / 0 failed** (159 assertions) · `tsc --noEmit` (0) + `npm run build` (green) · `pint` passed
- **Rollout**: migration additive + backfill (`down()` สะอาด rollback ได้) — **ยังไม่ได้รันบน DB จริง** รอยืนยันจากเจ้าของ; หลังรันควรตรวจ assets ที่ `owner IS NOT NULL AND owner_employee_id IS NULL` (label ของกลาง = ปกติ; ถ้าเป็นพนักงานจริงที่ code ไม่ตรงต้องแก้)

---

## 📝 Contract Cancel Reason — อัปเดต 2026-07-08

บังคับให้ระบุ **หมายเหตุ (เหตุผล)** ตอนยกเลิกสัญญา พร้อม validate — เพื่อให้มีบันทึกว่าทำไมถึงยกเลิก
spec: `docs/superpowers/specs/2026-07-08-contract-cancel-reason-design.md` · plan: `docs/superpowers/plans/2026-07-08-contract-cancel-reason.md`

- **Data model** — เพิ่มคอลัมน์ `contracts.cancel_reason` (text, nullable, ต่อจาก `expired_at`) + `$fillable`; resource คืนค่า `cancel_reason`
- **Validation แบบ direction-aware** — endpoint `cancel` เป็น toggle: ตอน**ยกเลิก** (`cancelled_at === null`) `reason` = `required|string|max:500` (whitespace-only ถูก TrimStrings ตัดเหลือ null → required ไม่ผ่าน = 422); ตอน**เปิดใช้ใหม่** (reactivate) ไม่ต้องมี reason และ**เคลียร์** `cancel_reason` กลับเป็น null → ยกเลิกครั้งใหม่ต้องกรอกเหตุผลใหม่เสมอ
- **Service** — `ContractService::toggleCancel(Contract, ?string $reason)` คำนวณทิศทางครั้งเดียว เซ็ต `cancelled_at` + `cancel_reason` พร้อมกัน (ไม่มี state ที่ค้างครึ่ง ๆ); guard เดิม (`assertNoPendingAssets` — asset ที่ผูกต้อง write-off ครบก่อน) ยังทำงานเฉพาะทิศ active→cancelled; **Expire ไม่แตะ** (ตามที่เจ้าของเลือก เฉพาะ Cancel)
- **Audit log** — บันทึกเหตุผลไปกับ entry "Cancelled contract"
- **UI** — เปลี่ยนจาก confirm dialog เดิมเป็น `contract-cancel-dialog.tsx` (Dialog เฉพาะ มี textarea เหตุผล **บังคับ** ตามสไตล์ resign-modal); guard เช็ก asset ยังทำงานก่อนเปิด dialog; types/api/hook + i18n (en+th) อัปเดต ไม่มี hardcode string

## Contract — ปุ่มเปิดใช้สัญญาอีกครั้ง (Reactivate) ใน UI (2026-07-09)
- เดิม `contracts.cancel` ครอบทั้ง "ยกเลิก/เปิดใช้อีกครั้ง" แต่ **มีแค่ปุ่มยกเลิก** — พอสัญญาถูก cancel แล้ว footer ของ detail drawer ถูกซ่อน เลยไม่มีทางกดเปิดใช้ใหม่ (backend `toggleCancel` + endpoint + mutation รองรับอยู่แล้ว)
- เพิ่ม **footer เฉพาะสัญญา cancelled** ในdrawer: ปุ่ม **"เปิดใช้อีกครั้ง"** (`RotateCcw`, gate `canCancel`) → confirm → `cancel.mutateAsync({ id })` (ไม่ส่ง reason = reactivate, เคลียร์ `cancelled_at`+เหตุผล); expired = ปิดถาวร ไม่มีปุ่ม (ตามดีไซน์)
- **สัญญา cancelled = อ่านอย่างเดียว (แก้ไขไม่ได้)** — ไม่มีปุ่ม Edit ในสถานะนี้ ต้อง **Reactivate ก่อน** สัญญาจึงกลับมาแก้ไขได้ (ปุ่ม Edit อยู่เฉพาะ footer ของสัญญา active/overdue)
- **Cancel เฉพาะตอน active, Expired เฉพาะตอน overdue** — แยกหน้าที่ชัดเจนตามช่วงชีวิตสัญญา:
  - `active` (ยังไม่ครบ period) → กดได้แค่ **Cancel** (ยุติก่อนกำหนด) + Edit
  - `overdue` (ครบ period แล้ว) → กดได้แค่ **Expired** (ปิดเมื่อจบเทอม) + Edit
  - บังคับ 2 ชั้น: ปุ่มโชว์ตามสถานะ + backend `toggleCancel` โยน 422 ถ้า cancel สัญญาที่ `daysRemaining() <= 0`, และ `expire()` โยน 422 ถ้า expire สัญญาที่ `daysRemaining() > 0` (ยังไม่ครบ period)
- i18n `contract_reactivate` (en "Reactivate" / th "เปิดใช้อีกครั้ง"); backend reactivate test เดิมยังเขียว
- **Verification**: `php artisan test --compact --filter=ContractApiTest` = **26 passed / 0 failed** (101 assertions) · `tsc --noEmit` (0) + `npm run build` (green) · `pint` passed
- **Rollout**: migration additive (`down()` drop คอลัมน์ rollback ได้) — รันบน DB จริงได้เลย ไม่มี backfill; สัญญาที่ยกเลิกไปก่อนหน้านี้ `cancel_reason` เป็น null (ปกติ)

## Contract — rename `title`→`details` + จัด View Details เป็นกลุ่มสัดส่วน (2026-07-09)

**เหตุผล:** คอลัมน์ `contracts.title` จริง ๆ ถือ "รายละเอียด" (คำอธิบายยาว) ส่วน `name` คือ "ชื่อสัญญา" — แต่ทั้งชื่อคอลัมน์และ label เดิมสลับ/ชวนสับสน

**Phase 1 — rename end-to-end (แก้ DB ก่อน):**
- **Migration** `renameColumn('title','details')` (rename ตรง ๆ ไม่มี backfill, `down()` rollback ได้; รันบน DB จริงแล้ว ข้อมูลอยู่ครบ)
- **Backend** — model fillable, ค้นหาใน `ContractController::index`, `StoreContractRequest` rule, `ContractResource`, `ContractSeeder`
- **Frontend** — `Contract` type, `ContractPayload` (เพิ่ม `details` ที่เดิมตกหล่น), form/drawer/list + `asset-form-drawer` (cross-module)
- **แก้ label ที่สลับ** — `name`="ชื่อสัญญา"/Contract name, `details`="รายละเอียด"/Details (en+th); dialog header โชว์ `name` เป็นหัวข้อ

**Phase 2 — จัด Contract View Details (drawer) เป็นกลุ่มเรียงเต็มกว้าง + แยกแท็บการแจ้งเตือน:**
- **Overview** เรียงกลุ่มลงมาเต็มความกว้าง (ไม่มีเส้นขอบการ์ด, field จัดแถวละ 3 ช่อง): **ข้อมูลสัญญา** (ประเภท / เลขที่·ผู้ขาย·ชื่อสัญญา / รายละเอียด / หมายเหตุ) → **ระยะเวลา & มูลค่า** (เริ่ม·สิ้นสุด·ระยะเวลา[เดือน] / รอบเรียกเก็บ·มูลค่าต่อรอบ·มูลค่าทั้งหมด) — เอา "วันคงเหลือ" ออก (มี badge บน header แล้ว) แทนด้วยระยะเวลาสัญญา `duration_months` + `duration_days` (calendar diff จริง **นับแบบ inclusive** = วันสิ้นสุดคือวันสุดท้ายที่สัญญายังมีผล → คำนวณถึง end+1 วัน: `durationMonths()` = ปี×12+เดือน, `durationDays()` = วันที่เหลือ) แสดงแบบ "24 เดือน" / "18 เดือน 15 วัน" / "1 วัน" — เช่น 1 ม.ค.–31 ธ.ค. = 12 เดือน, สัญญาวันเดียว (เริ่ม=จบ) = 1 วัน → **ยกเลิก & สิ้นสุดสัญญา** (เฉพาะ cancelled/expired)
- **การแจ้งเตือน** ย้ายไปเป็น **แท็บใหม่** (แท็บ: ภาพรวม / การแจ้งเตือน / ทรัพย์สิน / เอกสารแนบ) — Overview ไม่ยาวเกิน
- **มูลค่าทั้งหมด = ช่องกรอกเอง (manual)** ไม่ใช่คำนวณ — ยอดรวมจริงของแต่ละสัญญาไม่ตายตัว (ขึ้นกับดีลผู้ให้บริการ) จึงให้ผู้ใช้กรอกเอง. คอลัมน์ `contracts.total_value` (decimal nullable) → `total_value` + `total_value_display` (null = แสดง "—"); คู่กับ `value_display` = มูลค่าต่อรอบ
- **Validate** — `total_value` **required ตอนเพิ่มใหม่ (POST)**, optional ตอนแก้ไข (PUT) เพื่อไม่บล็อกสัญญาเดิมที่ยังไม่มียอดรวม; numeric ≥ 0. ฟอร์ม required เฉพาะตอน add (`required={!editing}`)
- **ประมาณการช่วยกรอก (ตอนเพิ่ม)** — หลังกรอกมูลค่า/รอบ + วันที่ ฟอร์มโชว์ **ประมาณการ Total คร่าว ๆ** (value × จำนวนรอบจาก start→end) ใต้ช่อง กดใช้ค่านี้เพื่อเติมได้ ให้ admin เช็ค/ปรับก่อนบันทึก — ช่อง Total value ยังเป็นค่าที่กรอกเองเสมอ
- **ฟอร์ม Add/Edit** — ช่องมูลค่าเดิม label "มูลค่า/รอบ" + ช่อง "มูลค่าทั้งหมด" (กรอกเอง) ในสเต็ป Term & Value และแสดงในสเต็ป Review
- **รองรับทศนิยม** — ช่องมูลค่าทั้งสอง (value/รอบ + total) พิมพ์ทศนิยมได้สูงสุด 2 ตำแหน่ง (`sanitizeMoney`/`displayMoney` — คั่นหลักพัน + คงจุดทศนิยมระหว่างพิมพ์, `inputMode=decimal`); ฝั่งแสดงผล `value_display`/`total_value_display` เป็น `number_format(x, 2)` (2 ตำแหน่งเสมอ)
- **created/updated** ย้ายไปมุมขวาบนใต้ StatusBadge; หัวข้อกลุ่ม + field ใหม่ใช้ i18n (`contract_section_*`, `contract_total_value`, `contract_value_per_cycle`, `contract_notes`) en+th ไม่มี hardcode
- **Sidebar badge fix** — ตัวเลข "ต้องจัดการ" ข้าง sidebar Contracts เปลี่ยนจากนับ `expired` → `overdue` (สัญญาที่ปิดถาวรแล้วไม่นับ) ให้ตรงกับ dashboard banner

**Verification**: full suite **541 passed / 0 failed** · `tsc --noEmit` (0) · `npm run build` (green) · `pint` passed

## Access Directory — เพิ่มแท็บ "ภาพรวม" (Overview/Dashboard) (2026-07-21)

**เหตุผล:** หน้าทะเบียนการเข้าถึงเดิมมีแค่การ์ด KPI 5 ใบด้านบน + 4 แท็บทะเบียน ยังไม่มีภาพรวมเชิงกำกับดูแล (ใครเข้าถึงกระจุกที่ไหน / มีอะไรต้องตรวจ) — เพิ่มแท็บภาพรวมเป็นแท็บแรก (ค่าเริ่มต้น) และย้ายสรุปทั้งหมดเข้าไป

**Backend:**
- `AccessService::dashboard()` — รวมสถิติต่อช่องทาง (resources / active grants / เพิ่มในรอบ 30 วัน), ยอดสิทธิ์รวม, สุขอนามัยการกำกับดูแล (file share ที่ไม่มีสมาชิก + ชื่อตัวอย่าง, resource ที่ไม่มีเจ้าของ, พนักงานลาออกที่ยังถือสิทธิ์, เพิ่มใน 30 วัน), และ `top_resources` (จัดอันดับตาม active grant ข้ามทั้ง 4 ตาราง พร้อม `kind` สำหรับลิงก์ไปแท็บ)
- `AccessController::dashboard()` + route `GET /api/access/dashboard` (gate `access.view` เดิม)

**Frontend (`modules/access`):**
- `accessApi.summary()` + `useAccessSummary()` (barrel export) + type `AccessSummary`/`AccessChannelStat`/`AccessTopResource` ใน `shared/types`
- `components/access-dashboard.tsx` — KPI 4 ใบ (นับต่อช่องทาง + delta **net change 30 วัน** = ให้ใหม่−ถอน: บวก↑เขียว / ลบ↓แดง / 0 เทา), การ์ด **"อัตราส่วนการเข้าถึง"** (แถบแยกช่องทาง + % ของยอดรวม), การ์ด **"สถานะการเข้าถึง"** (checklist ⚠/ⓘ/✓ + ป้าย "ล่าสุด"), ตาราง **"Resource ที่เข้าถึงมากที่สุด"** — ทั้งหมดใช้ `Card`/ตารางสไตล์เดียวกับหน้า Dashboard เดิม (หัวการ์ด `text-sm font-semibold` ตามแท็บ dashboard ของ Stock/Employee), คลิกการ์ด/แถวเพื่อกระโดดไปแท็บทะเบียน, มี pulse skeleton ตอนโหลด
- `pages/index.tsx` — เพิ่มแท็บ `dashboard` เป็นแท็บแรก/ค่าเริ่มต้น, ย้าย overview เข้าไป, เอาแถว KPI StatCard เดิมด้านบนออก (ซ้ำกับแท็บใหม่); count บนแท็บเป็น optional
- i18n `access_tab_overview` + `access_dash_*` (en+th) ไม่มี hardcode string; ชื่อประเภททรัพยากรใช้คีย์เดิมที่เป็นอังกฤษตาม product decision
- สีช่องทางใช้ hex เดิมจาก NameCell (email #7c3aed · file #0d9488 · social #6366f1 · software #f59e0b)

**Verification**: `php artisan test --compact tests/Feature/AccessControlTest.php` = **20 passed** (118 assertions, มีเทสต์ใหม่ครอบ gating + channels + governance + top) · `tsc --noEmit` (0) · `npm run build` (green) · `pint` passed

## Access — Social platform รองรับอัปโหลดโลโก้ (2026-07-21)

ให้ Social/Internet platform อัปโหลดโลโก้ได้เหมือน Software (โชว์ในตาราง + ฟอร์ม add/edit)
- **Backend**: migration เพิ่ม `social_platforms.logo_path` (additive, `down()` rollback ได้); `SocialPlatform` model (`logo_path` fillable + `getLogoUrlAttribute`); `StoreSocialPlatformRequest` เพิ่ม rule `logo` (image, png/jpg/webp, ≤2MB) + `remove_logo`; `SocialPlatformResource` คืน `logo_url`; `SocialPlatformController::handleLogo()` เก็บที่ `social-logos` (ลบไฟล์เก่าเมื่อแทน/ลบ) ใช้ใน store/update — pattern เดียวกับ SoftwareController
- **Frontend**: type `SocialPlatform.logo_url/logo_path`; แยก `LogoField` เป็นคอมโพเนนต์ย่อยใน `resource-modal.tsx` (ลดโค้ดซ้ำ) ใช้ทั้ง software + social (fallback icon: Package / Globe); ตาราง social โชว์โลโก้ผ่าน `NameCell logoUrl`; อัปโหลดผ่าน crop dialog เดิม, ส่ง multipart อัตโนมัติเมื่อมีไฟล์ (`accessApi.hasFile`)
- ใช้คีย์ i18n `access_logo*` เดิมร่วมกัน ไม่มีคีย์ใหม่
- **Verification**: `AccessControlTest` = **21 passed** (122 assertions, +เทสต์ `test_social_platform_logo_upload_is_stored`) · tsc 0 · build green · pint passed

## Employee Dashboard — เพิ่ม 3 การ์ดสรุป (2026-07-22)

เพิ่มการ์ดสรุปในแท็บ Dashboard ของ Employee: แนวโน้มการรับเข้า · สถานะพนักงาน · ลาออกล่าสุด (ดีไซน์ผ่าน mockup `docs/mockup/employee-dashboard-cards.html`)

**Backend** (`EmployeeController::summary()`):
- เพิ่ม `active` / `resigned` (นับตาม `status`) + `resigned_this_year` (`whereYear('last_day', ปีปัจจุบัน)`)
- `hires_by_month` — นับพนักงานเริ่มงานต่อเดือน **12 เดือนล่าสุด** (fixed rolling window, zero-filled, จบที่เดือนปัจจุบัน) — **จัดกลุ่มใน PHP** (พอร์ตได้ทั้ง MariaDB + SQLite เทสต์ ไม่ใช้ `DATE_FORMAT`)
- `recent_resignations` — พนักงานลาออก 5 คนล่าสุด (เรียงตาม `last_day`) ผ่าน `EmployeeResource`

**Frontend** (`modules/employee`):
- `components/hires-trend-card.tsx` — กราฟแท่ง **12 เดือนล่าสุด (คงที่ ไม่มี scroll)** เต็มความกว้าง; **ไฮไลต์เดือนปัจจุบัน** (แท่งทึบ brand + label สี brand ตัดกับอดีตที่ `bg-brand/35`), legend "ปัจจุบัน" (แท่งทุกคอลัมน์สูงเท่ากัน)
- การ์ด **สถานะพนักงาน** — เลขใหญ่ active + แถบแยกสัดส่วน active/ลาออก (ไม่มี %) + legend + ท้ายการ์ดชู "ลาออกในปี YYYY" (สี destructive)
- การ์ด **ลาออกล่าสุด** — รายการ avatar + ชื่อ + ตำแหน่ง·แผนก + วันสุดท้าย (คู่กับ "เข้าใหม่")
- type `EmployeeSummary` + `EmployeeHiresMonth`; i18n `emp_*` (en+th)
- ทุกการ์ดใช้ header เส้นคั่น + ไอคอนเทา `text-sm font-semibold` ตามชุด Access/Stock/Contract/Asset

**Verification**: `EmployeePermissionGatingTest` = **10 passed** (31 assertions, +เทสต์ status/hires/resignations) · tsc 0 · pint passed · build green

> อัปเดต (2026-07-22): เปลี่ยน `hires_by_month` จาก "เดือนแรกใน DB → ปัจจุบัน (เลื่อนได้)" เป็น **12 เดือนล่าสุดคงที่** เพราะข้อมูลจริงเก่า (2016–2020) ทำให้กราฟเปิดมาที่ช่วงว่างแล้วต้องเลื่อนไกล — 12 เดือนล่าสุดอ่านง่ายกว่าและเป็น trend มาตรฐาน

## Deep-link + UX consistency ทั้งระบบ (2026-07-22)

ยกมาตรฐานจาก Access Directory ไปใช้ทุกโมดูล (Contract · Asset · Ticket · Stock · Employee)

**Deep-link (URL เป็น single source of truth):**
- **`?view=<id>`** เปิด record/detail drawer แบบค้างถาวร — reload ยังเปิดอยู่ + แชร์ลิงก์ได้ + คลิกแถวเขียน URL + ปิดล้าง param (เดิมเป็น consume-once ที่ล้าง URL ทิ้ง). โมดูลที่ drawer รับ object (Asset/Ticket/Employee) → seed React Query cache ตอนคลิกเพื่อเปิดทันทีไม่รอ fetch; ที่รับ id (Contract/Stock) → derive ตรง. Employee: `?highlight=` เดิม redirect เป็น `?view=` อัตโนมัติ
- **`?add=1`** เปิดฟอร์มสร้างแบบ URL — reload/แชร์ได้ (add-only: Ticket/Employee; ใช้ร่วม add+edit: Contract/Asset/Stock โดย add=URL / edit=local)
- Access: rename `?open=` → `?view=` ให้ param มาตรฐานเดียวกันทั้งระบบ; ค่า `?tab=` ติดไปด้วยเสมอ (merge params) → `?tab=<x>&view=<id>`
- **Edit ซ้อน detail + bounce-back**: กด Edit จาก detail → ฟอร์ม/dialog ซ้อนทับ (detail ค้างข้างหลัง เพราะ drawer ทุกตัวเป็น Dialog กลางจอ) → ปิดแล้วกลับมา detail เดิม (เอา closeAsset/closeEmp ที่ปิด view ออก)

**Skeleton loading ครบทุก Dashboard** (Access/Asset/Employee/Stock/Contract) — mirror layout จริง (header เส้นคั่น + rows) แทนกล่องเทาเปล่า/empty วูบ

**ความสม่ำเสมอของ UI:**
- หัวการ์ด dashboard ทุกโมดูลใช้ header เส้นคั่น + ไอคอนเทา + `text-sm font-semibold`
- แถวข้อมูลในการ์ด (Stock: คลัง/คิวงาน/ความเคลื่อนไหว · Contract: ต้องดำเนินการ) ใช้ `divide-y divide-border/60 p-2` + row `px-3 py-2.5` แบบการ์ด "สถานะการเข้าถึง" ของ Access (เลิกกล่อง border รายแถว)
- avatar/โลโก้เป็นวงกลม (โปรไฟล์สไตล์), หัว dialog รองรับ `image`/`round`/`tileSize`
- crop รูปโปรไฟล์/โลโก้ export เป็น WebP (เล็กลงมากกว่า PNG เดิม)
- Stock: fold recent movements เข้า `/stock/summary` (การ์ดโหลดพร้อมกัน ไม่มีอันช้า) · แท็บ Requests ไม่ reload/ลืมหน้าเมื่อสลับแท็บ (loading=isLoading + lift page state + staleTime)
- Asset: ชื่อประเภท (Master Data) สลับ TH/EN ทั้ง dashboard/ตาราง/ตัวกรอง/ฟอร์ม
- เอา staggered fade-in (cf-row/sc-row) ออกจาก Contract/Stock; EmployeeViewDrawer retain content ให้มี fade-out ตอนปิด

**Verification**: `php artisan test --compact` = **632 passed / 2400 assertions / 0 failed** · tsc 0 · eslint clean · build green · pint passed

## 🔑 Credentials Management + Employee module cleanup (2026-07-31)

Spec: `docs/superpowers/specs/2026-07-30-credentials-management-design.md` · Plan: `docs/superpowers/plans/2026-07-30-credentials-management.md`

**ปัญหาเดิม**: สร้างบัญชีแล้วแก้ `username` ไม่ได้เลย · "Reset Password" ตั้งรหัสเป็น**รหัสพนักงาน**แล้วจบ (ไม่บังคับเปลี่ยนครั้งถัดไป ทั้งที่รหัสพนักงานเป็นข้อมูลสาธารณะ เดาได้)

### 1. Credentials Management

**Backend**
- migration `users.must_change_password` (boolean, default false) — **แยกอิสระจาก policy `password_expiry_days`**
- `UserResource.password_expired` = `must_change_password || isPasswordExpired()` → หน้าบังคับเปลี่ยนรหัสเดิม (`ChangePasswordDialog` ที่ `app-shell`) ทำงานทันที **โดยไม่ต้องแก้ frontend ฝั่ง auth เลย**; `AuthController@changePassword` เคลียร์ flag เมื่อสำเร็จ; `CheckPasswordExpiry` เช็ค flag ด้วย
- **`PUT /employees/{employee}/credentials`** (`updateCredentials`) — แก้ username และ/หรือ reset password ใน request เดียว **gate แยกรายฟิลด์**: username → `employees.set_credentials`, password → `employees.reset_password`; 422 `no_account` เมื่อไม่มีบัญชี; **ลบ `POST reset-password` + `ResetPasswordModal` เดิมทิ้ง**
- **นโยบายรหัสผ่าน** `Password::min(8)->mixedCase()->numbers()->symbols()` (ชุด complexity แบบ AD) ใช้ทั้งตอนสร้างและตอน reset — ตรงกับ `min:8` ที่ `changePassword` บังคับอยู่แล้ว
- **กฎ username** `^[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]$` max 30 — อังกฤษเท่านั้น ขึ้นต้นด้วยตัวอักษร ลงท้ายด้วยตัวอักษร/ตัวเลข ใช้ `. _ -` ตรงกลาง (ชุดที่ AD/POSIX รับ); ขั้นต่ำ 2 ตัวเพื่อไม่ตัดบัญชีร่วมที่ใช้จริง (`hr`, `it`)
- **normalize username เป็นตัวพิมพ์เล็กก่อน validate** — ความ unique แบบไม่สนตัวพิมพ์เดิมพึ่ง collation `utf8mb4_unicode_ci` ของ MariaDB ทำให้ SQLite (เทสต์) ปล่อย `John_Do` ผ่าน `john_do` ได้ ตอนนี้การันตีจากโค้ด
- reset ที่ไม่ส่งรหัสมา → `generatePassword()` สุ่มรหัสที่ผ่าน policy เสมอ (หยิบตัวแทนครบทุกคลาสก่อนแล้วสับ) — **เลิกใช้รหัสพนักงานเป็นค่าเริ่มต้น**

**Frontend** (`modules/employee`)
- **`manage-credentials-modal.tsx`** — dialog "จัดการบัญชี" แทนปุ่ม Reset Password เดิม (footer drawer + เมนู ⋮ ในตาราง): แก้ username + reset password แสดงตามสิทธิ์รายส่วน, **สวิตช์บังคับเปลี่ยนรหัสครั้งถัดไป** (default เปิด), เผยรหัสใหม่พร้อมปุ่มคัดลอกหลัง reset
- **ยืนยันก่อนลงมือทั้งสองการกระทำ** ผ่าน `useConfirm()` — rename เปลี่ยนวิธีล็อกอินของคนอื่น · reset ย้อนกลับไม่ได้
- `set-credentials-modal.tsx` — สวิตช์เดียวกัน + **Auto Gen สุ่มรหัส 14 ตัว** (เดิมใช้รหัสพนักงาน) + เผยคู่ user/pass **หลังบันทึกสำเร็จ** แทน popup ซ้ำตอนกด Gen
- `lib/credentials.ts` — กฎ username + policy + ตัวสุ่ม mirror จาก controller ที่เดียว; `password-checklist.tsx` — checklist 5 ข้อติ๊กเขียวสด **แสดงตลอดเวลาเพื่อไม่ให้ฟอร์มขยับตอนพิมพ์**
- ปุ่ม Reset ต้องมีรหัสที่ผ่านเกณฑ์ก่อนจึงกดได้ · ปุ่ม Save ปิดจนกว่า username จะเปลี่ยนจริง

### 2. Employee detail drawer — แท็บใช้งานได้จริง

- **Tickets tab** (ใหม่): `GET /employees/{employee}/tickets` gate ด้วย `employees.view` — ตาราง Request at · Subject/เลขที่ · Category · Status ใช้ badge จากโมดูล ticket ผ่าน barrel; `useTicketMutations` invalidate `['employee-tickets']` ให้รีเฟรชสด
- **Access tab**: ย้าย `GET /employees/{employee}/access` จาก `AccessController` (gate `access.module`) มาไว้ที่ `EmployeeController` gate ด้วย `employees.view` — คนที่ดูแลพนักงานแต่ไม่มีสิทธิ์ Access Directory จึงเปิดดูได้ (own-module peek pattern เดียวกับ Assets tab) + แสดงโลโก้ Social/Software (`resource_logo`)
- แถบซ้ายเพิ่มกลุ่ม **Credentials** (Username อย่างเดียว) แยกจากข้อมูลติดต่อ
- **i18n**: ย้ายสตริง hardcode 49 จุดใน `employee-view-drawer` + `edit-employee-dialog` เข้า `lang/{en,th}/employee.ts` (`emp_v_*`) — ลบ helper `L(th, en)` ที่เลี่ยงระบบ i18n ทิ้ง

### 3. Module restructure + Edit dialog

- `hooks/use-org.ts` (196 บรรทัด) → `use-employees` · `use-departments` · `use-positions` · `use-sections` · `use-locations` + `query-keys.ts`; `api/orgApi.ts` (174 บรรทัด) → `employeeApi` · `departmentApi` · `positionApi` · `sectionApi` · `locationApi` + `http-helpers.ts` — ชื่อไฟล์ตรงกับเนื้อใน (เดิมชื่อ "org" แต่เป็น hook/api กลางของทั้งโมดูล ใช้ข้าม 6 โมดูล) · barrel รับภาระ re-export ให้ผู้เรียกภายนอกไม่ต้องแก้
- **`edit-employee-dialog` เป็น focus drawer 2 คอลัมน์** แบบ Open Ticket: `FocusDialogHeader` + `SectionLabel` กลาง · ซ้าย = ตัวตน (รูป/รหัส/ชื่อ/ติดต่อ) ขวา = การจ้างงาน · กว้าง 1100px · validate ทุกช่องรวดเดียว (เดิม `!validateStep(1) || !validateStep(2)` ตัดวงจร ทำให้เห็น error ทีละคอลัมน์)
- phone: validate แบบเดียวกับ `callback_phone` ของ Ticket (`regex:/(\D*\d){3,}/`) — พิมพ์ "ext. 1305" ได้ แต่ต้องมีตัวเลข ≥3 ตัว

### 4. Bug fixes

- **My Assets**: กดรับหลายรายการต่อเนื่อง spinner ของรายการแรกดับ — `accept.variables` จำได้แค่คำสั่งล่าสุด เปลี่ยนเป็น `Set<number>` ต่อแถว (บั๊กชนิดเดียวกันเกิดซ้ำที่ปุ่ม Save/Reset ใน dialog จัดการบัญชี → แยก state `busy`)
- **Enter ในช่องค้นหา `SearchableSelect` สั่งบันทึกทั้งฟอร์ม** — dialog ดัก Enter โดยข้ามเฉพาะ `TEXTAREA/BUTTON/SELECT/OPTION` ไม่มี `INPUT`; แก้ที่ต้นเหตุด้วย `stopPropagation` ในช่องค้นหา (มีผลทุกฟอร์มที่ใช้ component นี้)
- **Dialog เนื้อหาหายก่อน fade-out** — retain `shown` copy ใน credential dialogs ทั้ง 3 ตัว (ตามมาตรฐานเดิมของ view drawer)
- **`Switch` สถานะปิดจมพื้นหลัง** ทั้ง light/dark — `bg-muted` เป็น token เดียวกับพื้นกล่อง เปลี่ยนเป็น `bg-muted-foreground/35` (มีผลทุก switch ในระบบ)
- `Field` รองรับ `action` slot (ปุ่มบนบรรทัด label) — ใช้กับปุ่ม Auto Gen ที่เดิมลอยไม่มีที่ยึด

**Verification**: `php artisan test --compact` = **732 passed / 2791 assertions / 0 failed** · tsc 0 · build green · pint passed (`--dirty`)

> บทเรียน: `git add` แบบระบุชื่อไฟล์ทีละตัวทำให้ไฟล์ใหม่ 11 ไฟล์ (hooks/api ที่แยกออกมา + เทสต์) ตกหล่นไม่เข้า git ทั้งที่ commit อื่นอ้างถึงอยู่ — `tsc`/Vite อ่านจากดิสก์จึงไม่ฟ้อง ตรวจเจอตอนจะ push ด้วยการ clone repo จาก git ล้วนแล้วไล่ตรวจว่าทุก import ชี้ไปยังไฟล์ที่มีจริง

---

## Sidebar badges — รวมเป็น endpoint เดียว + badge "ยังไม่มีบัญชี" (2026-07-31)

### 1. Employee list — ลำดับการเรียงใหม่

`EmployeeController@index` เพิ่ม `orderByDesc('code')` เป็นคีย์ที่ 3 — ลำดับเต็มคือ
active ก่อน resigned → คนที่ยังไม่มีบัญชีก่อน → **รหัสพนักงานใหม่ก่อน (68xxxx ก่อน 52xxxx)** → ชื่อ → นามสกุล
(หมายเหตุ: `code` เป็น string การเรียงจึงถูกต้องเมื่อรหัสยาวเท่ากัน)

### 2. Badge "พนักงานที่ยังไม่มี Account"

- `employees/summary` เพิ่มฟิลด์ `no_account` = active + `whereDoesntHave('user')` (กติกาเดียวกับ filter `?status=no_account`)
- แท็บ **Directory** เปลี่ยนตัวเลขจาก "จำนวนพนักงานทั้งหมด" เป็นจำนวนคนที่ยังไม่มีบัญชี — pill สีอำพัน + tooltip, ซ่อนเมื่อเป็น 0
- เมนู **Employees** บน sidebar แสดงตัวเลขเดียวกัน

### 3. `GET /api/sidebar-badges` — badge ทุกตัวใน request เดียว

**ปัญหาเดิม**: badge แต่ละเมนูยิง endpoint ของตัวเอง (9 requests ตอน mount) ตัวเลขจึงโผล่ทีละอัน และเห็นชัดมากบน `php artisan serve` ที่มี worker เดียว (คิวเรียงกัน)

**Backend**
- `app/Services/Sidebar/SidebarBadgeService.php` — นับทุก badge (`employees · access · tickets · assets · my_assets · contracts · stock`) พร้อม gate รายตัวในตัวเอง: สิทธิ์ไม่ถึง = คืน 0 (ไม่ใช่ 403) เท่ากับ effective permission เดิมของแต่ละ endpoint
- `app/Http/Controllers/Api/Sidebar/SidebarBadgeController.php` + route `GET sidebar-badges` (ใต้ `auth:sanctum`)
- ปรับให้เบาพอจะ poll ได้: stock alerts ใช้ `StockItem::withDerivedStatus('alerts')->count()` (SQL) แทนโหลดทุก SKU; access anomalies นับตรงแทนเรียก `AccessService::dashboard()` ที่สร้าง drill-down list ทั้งชุด
- `Permissions::ticketLevelsFor()` (ย้ายจาก private `TicketController::levelsFor`) และ `TicketController@badge` เรียก service ตัวเดียวกัน — ticket badge เหลือกติกาเดียว

**Frontend**
- `shared/hooks/use-sidebar-badges.ts` — hook เดียว (poll 15s เท่า notification, background ด้วย) + export `SIDEBAR_BADGES_KEY`
- ลบ `use*SidebarBadge` ทั้ง 7 ตัวออกจากโมดูล (stock/contract/asset×2/access/ticket/employee) และ barrel — เหลือแหล่งเดียว
- mutation ของทุกโมดูลที่กระทบตัวเลข invalidate `SIDEBAR_BADGES_KEY` → badge อัปเดตทันทีหลังทำรายการ ไม่ต้องรอ poll

**Test**: `tests/Feature/SidebarBadgeTest.php` — parity ทุกตัวเลขกับ endpoint เดิม (`employees/summary`, `contracts/summary`, `assets/summary`, `tickets/badge`, `access/dashboard`, `stock-items/summary`, `stock-requests`, `stock-counts`, `assets/mine`) + เคสสิทธิ์ไม่ถึงต้องได้ 0 · `EmployeeAccountLinkTest` เพิ่มเคสลำดับตาม code · `EmployeePermissionGatingTest` เพิ่มเคส `no_account`

**Verification**: `php artisan test --compact` = **740 passed / 2855 assertions** · `tsc --noEmit` 0 · eslint 0 (ไฟล์ที่แก้) · pint passed

---

## Request + Workflow Modules (#3) — คำขอบริการ IT + สายการอนุมัติ (2026-08-01)

สร้างสองโมดูลที่ทำงานร่วมกันตาม design mockup (Claude Design `IT Service Desk.html`) และ diagram `Request&Workflow.drawio`: **Workflow** เป็น engine กำหนดสายอนุมัติต่อประเภทคำขอ → **Request** วิ่งตามสายนั้นทีละขั้นจนถึงมือทีม IT

### แนวคิดหลัก

- **คำขอ 10 ประเภท** (computer, mobile, email, social, fileshare, mailgroup, software, recovery, telephone, other) แต่ละประเภทมี dynamic fields ของตัวเอง — schema กลางอยู่ที่ `app/Support/RequestSchemas.php` ใช้ทั้ง validation และ UI (ไม่มีวัน drift)
- **Resolve ผู้อนุมัติตอน submit แล้ว freeze เป็น snapshot** (`request_approvals`): ขั้น chain = ผู้บังคับบัญชาลำดับ 1/2/3 ตาม `manager_id` (ผ่าน `ApprovalChainService` เดิม, กรองเฉพาะ active + มีบัญชี login) · สายสั้น → คนสุดท้ายควบหลายขั้น (merge label + SLA สูงสุด) · ไม่มีหัวหน้า → ข้ามพร้อม note · ขั้น Owner = `owner_employee_id` ของ EmailGroup/FileShare ที่เลือก (เจ้าของเป็นผู้ขอเอง/ไม่มีเจ้าของ → ข้าม) · ขั้น it_staff = คิวของผู้ถือ `requests.fulfill` — **แก้ workflow ภายหลังไม่กระทบคำขอที่วิ่งอยู่** (มี test พิสูจน์)
- **สิทธิ์ตัดสินเป็นราย "คน" ไม่ใช่ permission**: เฉพาะ approver ของแถว current เท่านั้นที่ approve/reject ได้ (super admin ก็ 403 — ทุกการตัดสินระบุตัวคนได้เสมอ) · Remark บังคับเฉพาะ Reject (ส่งกลับผู้ขอ) · ผู้ขอ cancel คำขอตัวเองได้ระหว่าง pending
- **Auto Ticket**: อนุมัติครบ + workflow เปิด auto_ticket (snapshot ตอน submit) → เปิด Ticket จริงผ่าน `TicketService::create()` ใน transaction เดียวกับ approve (พังก็ rollback ทั้งคู่, กดใหม่ได้) · map ประเภท→TicketCategory · เก็บ `ticket_id` ผูกกลับ + ลิงก์ในหน้า detail
- **Bell + Email ทุก hop ตาม diagram**: submit→approver แรก · อนุมัติ→ขั้นถัดไป · ครบ→ผู้ขอ + คิว IT · reject→ผู้ขอพร้อม remark · fulfill→ผู้ขอ (`RequestNotificationService` โครงเดียวกับ Stock; reuse template `request.approval_needed/approved/rejected` เดิม + เพิ่ม `request.submitted/ready_to_fulfill/fulfilled`)

### Backend

- Migrations: `workflows`, `workflow_steps`, `service_requests` (reference `RQ-YYYY-NNNN` — เลี่ยง REQ- ที่ Stock ใช้), `request_approvals` (unique ต่อ position + index `(approver_employee_id,status)` ขับ badge), `restructure_request_permission_keys` (backfill role เดิม)
- โดเมนใหม่ `App\{Models,Services,Http}\Request\*` + `App\Models\Workflow\*` + Enums 6 ตัว · `DefaultWorkflows` + `WorkflowSeeder` (firstOrCreate — ไม่ทับของที่แอดมินแก้)
- Routes: `service-requests` (index/store/show + approve/reject/fulfill/cancel + options) · `workflows` (index/update/preview/employee-options ใต้ `permission:workflows.manage`)
- Permissions: `requests => [submit, view_all, fulfill]` + `workflows => [manage]` (ตัด approve_manager/approve_it/reject ที่ไม่เคยถูกใช้จริง) · sidebar badge `requests` = ขั้นที่รอฉัน + คิว fulfill · AuditLog ทุก mutation + FK labels ใหม่
- `fields` json เก็บทั้งค่า raw และ `_display` (label 2 ภาษา + ค่า resolve แล้ว ณ ตอนยื่น — point-in-time เหมือน requester_name)

### Frontend (Focus Dialog เป็นหลัก ตามแพทเทิร์น Contract)

- โมดูลใหม่ `modules/request/`: หน้า Requests (KPI 4 ใบ + แท็บ Dashboard/ทั้งหมด/รออนุมัติจากฉัน ผ่าน `?tab=` + localStorage) · Dashboard = คิวรอตัดสิน (อนุมัติ/ไม่อนุมัติ inline) + Service catalog (คลิกการ์ด → เปิด wizard พร้อมเลือกประเภทให้) + ความเคลื่อนไหวล่าสุด · ตาราง server-paginated (DataTable server mode + FilterPopover สถานะ/ประเภท + shimmer)
- **New Request = Focus Dialog wizard 3 ขั้น** (reuse โครง `contract-form-drawer`: FocusDialogHeader + stepper + footer): ①เลือกบริการ+เห็นสายอนุมัติ ②กรอกรายละเอียด+ฟิลด์เฉพาะประเภท (SearchableSelect สำหรับ resource) ③รีวิว+ส่ง · validate แบบ STEP_FIELDS + map error 422 กลับ field
- **Detail = Focus Dialog** (แทน right-sheet ของ mockup): badges + ข้อมูล + ฟิลด์ (แสดงจาก `_display`) + **RequestTrail** timeline (done/current/rejected/skipped + remark + SLA + overdue) + การ์ด Ticket ที่ผูก → `/tickets?view=` · ปุ่มตามสิทธิ์จริงจาก API (`can_approve/can_fulfill/can_cancel`) · deep-link `?view=<id>` จาก bell
- โมดูลใหม่ `modules/workflow/`: หน้า Workflows (stat 4 ใบ + การ์ดพร้อม **WorkflowStrip**) · View dialog (read-only) · **Editor dialog**: toggle Active/Auto-ticket, แก้/เรียง/เพิ่ม/ลบ step, strip สด, **"ทดสอบกับพนักงาน"** — เลือกพนักงานจริงแล้วเห็นสายที่ resolve แล้ว (merge/ข้าม เหมือนตอน submit จริง)
- i18n เต็มชุด `lang/{en,th}/requests.ts` (~150 คีย์) + `workflow.ts` ใหม่ + `notif_request_*` · badge/notification wiring ครบ (แท็บ Requests ใน bell = live)

### Coming Soon (v1)

ปุ่ม Export หน้า Requests · ปุ่มสร้าง workflow ใหม่ (แก้ 10 ตัว seed ได้เต็มรูปแบบ) · ปิด Ticket แล้ว auto-fulfill คำขอ · daily SLA reminder sweep · แนบไฟล์ในคำขอ

### Tests / Verification

`RequestResolutionTest` (7) · `RequestWorkflowTest` (11) · `RequestAutoTicketTest` (3) · `WorkflowAdminTest` (3) · `RequestNotificationTest` (6) — รวม 30 tests ใหม่
**ทั้ง suite: `php artisan test --compact` = 770 passed / 3023 assertions** · `tsc --noEmit` = 0 · `npm run build` ผ่าน · pint ผ่าน · `php artisan migrate` + `WorkflowSeeder` (10 workflows / 31 steps) รันบนฐานจริงแล้ว

---

## Request + Workflow — ปรับตามการใช้งานจริง + Master data "ข้อมูลคำขอ" (2026-08-03)

รอบปรับปรุงหลังส่งมอบ (รวบยอดหลายรอบย่อยไว้ที่เดียว) — ทุกข้อมาจากการลองใช้จริงแล้วสั่งแก้

### 1. จัดให้เข้าธีมเดิมของระบบ

ตอนสร้างครั้งแรกยกค่าจาก mockup มาตรง ๆ (px ดิบ, การ์ดที่ hand-roll เอง) ทำให้ดู "ตัวเล็กกว่าโมดูลอื่น" และ "ไม่สะอาด" — แก้ที่ต้นเหตุทั้งหมด: ใช้ type scale ของแอป (`text-2xl` h1 · `text-3xl` ค่า KPI · `text-sm` เนื้อหา · `text-xs` meta), เปลี่ยนการ์ดทุกใบมาใช้ `<Card>` ร่วม, ใช้ `SectionLabel` ตัวกลางแทนของที่เขียนเอง, tab bar ใช้คลาสชุดเดียวกับ Access, ไอคอน KPI เป็นสีธีมวางขวา, และเลิกซ้อน border/รัศมีลูกเกินพ่อ

### 2. ตัดของซ้ำและของที่ไม่ได้ใช้

- **SLA เลิกเป็นตัวชี้วัดที่มองเห็น** — เดิมโผล่ 7 จุด (strip/trail/การ์ด/ตาราง) เหลือแค่การ์ด KPI "เวลาตัดสินเฉลี่ย" ใบเดียว เพราะจริง ๆ การอนุมัติมีที่มาหลายทาง วัดเป็นตัวเลขเดียวไม่ได้
- ลบ Service catalog ที่ซ้ำกับตอนกดขอ, ลบชื่อบริการที่ซ้ำในแถวตาราง, ตัดฟิลด์ **หัวข้อ** ออก (สร้างเองเป็น `Request + ชื่อบริการ`) พร้อมตัด **ความสำคัญ / มูลค่าโดยประมาณ** ออกทุกประเภท
- Sidebar: "สายการอนุมัติ" → **Workflow** · เก็บ dead i18n key ที่ค้างจากการตัดออกให้หมดทุกรอบ

### 3. New Request wizard

ขนาด dialog คงที่ (`h-[min(760px,100vh-72px)]` × `max-w-[1100px]`) เลิกกระโดดตามเนื้อหา · ขั้น ① จัดการ์ดบริการกลางจอ ไอคอน 40px บนหัว คลิกแล้วไปขั้นถัดไปเลย (ไม่มีปุ่ม Next) · ขั้น ② จำนวนคอลัมน์**ต่อบริการ** ไม่ใช่เดาจากจำนวนฟิลด์ (`RequestSchemas::layouts()`) · ขั้น ③ รีวิวสั้นลงเหลือของที่ต้องตรวจจริง

**ฟิลด์ที่เหลือต่อบริการ** (ตัดตามที่ใช้จริง): คอมพิวเตอร์ 1 คอลัมน์ (ประเภทเครื่อง) · Hardware 1 (อุปกรณ์) · อีเมล 1 · Social 2 · Files Share 2 (สิทธิ์เหลือ read/write ตาม Access Directory) · Mail Group 1 · Software 2 (**ดึงรายชื่อจาก Access Directory: Brand + ชื่อ Software** ไม่มีในรายการก็ติ๊ก "อื่น ๆ" แล้วพิมพ์เอง — `required_without` สองทาง) · กู้ข้อมูล 1 (เหลือเหตุผลเท่านั้น) · โทรศัพท์ 2 · อื่น ๆ 1

### 4. แยก Hardware ออกจาก Computer (10 → 11 ประเภท)

`RequestType::Hardware` + workflow ตัวที่ 11 (ใช้ step ชุดเดียวกับ Mobile) — คำขอจอภาพ/เครื่องพิมพ์/อุปกรณ์เสริมไม่ต้องไปปนกับคำขอเครื่องคอมอีก

### 5. Settings → **ข้อมูลคำขอ** (หมวดของตัวเอง)

รายการตัวเลือกในฟอร์มคำขอที่แอดมินแก้เองได้ 2 ภาษา ไม่ต้องแก้โค้ด

- **เป็นหมวด Settings ของตัวเอง ต่อจาก Ticket & SLA** (`#request-data`) — ตอนแรกวางเป็นแท็บย่อยที่ 9 ของ Master data แต่ที่นั่นเป็นตารางอ้างอิงที่ใช้ร่วมกันของ ทรัพย์สิน/สัญญา/คลัง ส่วนนี่เป็นของโมดูล Request โมดูลเดียว อยู่ปนกันแล้วสับสน
- **permission ของตัวเอง `settings.requestdata`** (migration grant ให้ทุก role ที่เคยถือ `settings.masterdata` — ไม่มีใครเสียสิทธิ์เพราะหน้าย้ายที่) · API endpoints ทั้งหมดย้ายมาใช้ gate นี้ · ยังถูกปิดตาม master key `settings.access` เหมือนคีย์ settings อื่น
- **โครงหน้า**: sub-tab แบบ pill ของรายการ (ทรง/สีเดียวกับแท็บย่อยที่โมดูลอื่นใช้) → แถบ toolbar (คำใบ้ลากซ้าย + ปุ่มเพิ่มขวา แบบเดียวกับ DataTable) → กรอบ `rounded-xl` เดียวที่ถือแถวทั้งหมด — ก่อนหน้านี้เคยทำเป็น master-detail ที่มี side nav 220px ของตัวเองในการ์ดซ้อนการ์ด ซึ่งไปวางข้าง side nav ของหน้า Settings เองแล้วดูเป็นพาเนลลอยในพาเนล
- แถวแสดงชื่อภาษาเดียวตามภาษา UI (ปุ่มธงที่ topbar สลับให้ เหมือน master data ตัวอื่น) · ถ้าตัวไหนยังไม่มีชื่อไทยจะแสดงชื่ออังกฤษพร้อมป้าย "ยังไม่ได้แปล"
- ตาราง `request_options` + `App\Models\Settings\RequestOption` · ฟิลด์ใน `RequestSchemas` ที่ประกาศ `managed` จะถูก overlay ด้วยค่าจากตารางนี้ (query เดียวต่อ page load, ตัวที่ปิดไว้หลุดจากทั้ง UI และ validation พร้อมกัน) — ปัจจุบัน 3 รายการ: `hardware.device`, `mobile.device`, `telephone.device_type`
- **คำขออ้างถึงตัวเลือกด้วย FK จริงในฐานข้อมูล** — เดิมเก็บ slug (`monitor`) ลง `fields` json ซึ่งเป็น soft link 2 ชั้น: (1) เป็น identity ที่สองของแถวที่มี id อยู่แล้ว (2) อยู่ใน json ซึ่ง MariaDB ผูก FOREIGN KEY ไม่ได้เลย ลบตัวเลือกทิ้งแล้วคำขอชี้ไป id ที่ไม่มีอยู่โดยฐานไม่ร้อง แก้ 2 ขั้น: เปลี่ยน key เป็น `*_id` แล้ว**ย้าย reference ทุกตัวออกจาก json ไปเป็นคอลัมน์จริงพร้อม FK**
  - `service_requests` ได้ 6 คอลัมน์ใหม่ `request_option_id` · `file_share_id` · `email_group_id` · `social_platform_id` · `software_id` · `location_id` → FK `ON DELETE SET NULL` ทั้งหมด (รวมกับของเดิมเป็น **10 FK** บนตารางนี้) · json เหลือแต่ของที่ไม่มีตารางรองรับ (`access_level`, `address`, `sim`) + `_display`
  - ได้ relation จริง: `$request->requestOption->label_th` · ถามย้อนกลับได้ `ServiceRequest::where('request_option_id', $id)` แทนการไล่ scan json
  - `RequestSchemas::referenceColumns()` เป็นตัวบอกว่า field ไหนลงคอลัมน์ไหน (managed ทุกตัว → `request_option_id` เพราะเป็นแถวของตารางเดียวกัน) · `ServiceRequestResource` รวมคอลัมน์กลับเข้า `fields` map ตอนส่งออก API จึงไม่กระทบ frontend
  - **กันลบตัวเลือกที่ถูกอ้างถึง 2 ชั้น**: controller คืน `409 {message:'in_use', count:N}` เหมือน master data ทั้ง 7 ตัว (ฝั่งหน้าเว็บใช้ `toastDeleteError` ตัวเดิม โชว์ "ยังถูกใช้งานอยู่ N รายการ") · และ FK `request_option_id` เป็น **`ON DELETE RESTRICT`** ฐานปฏิเสธเองด้วย — เดิมเป็น `SET NULL` ซึ่งลบผ่านแล้วตัดคำขอออกจากสิ่งที่มันขอแบบเงียบ ๆ (label ยังอยู่ใน `_display` แต่ link ที่ตอบว่า "คำขอไหนขอตัวนี้" หายถาวรโดยไม่มีใครเตือน)
  - เลิกใช้ตัวเลือกให้ปิดเป็น **"ซ่อน"** (`active=false`) — หลุดจากฟอร์มและ validation ทันที ส่วนคำขอที่เลือกไว้แล้วยังถือ reference ครบ · ตัวเลือกที่ยังไม่มีคำขอไหนใช้ลบได้ปกติ
  - ทดสอบพิสูจน์ระดับฐาน: ยิงผ่าน service ตรง ๆ (เลี่ยง validation) ด้วย id ที่ไม่มี → `FOREIGN KEY constraint failed` · ลบตัวเลือกที่ถูกอ้าง → คอลัมน์เป็น null แต่ `_display` ยังอ่านชื่อเดิมได้
  - `hardware.device` → `device_id` · `mobile.device` → `device_id` · `telephone.device_type` → `device_type_id` (migration ย้าย field_key ของ option โดยคง id เดิม + ย้าย key ใน `fields` json ของคำขอรวมถึงแถว `_display`) · `device_id`/`device_type_id` ใช้คอลัมน์ `request_option_id` ร่วมกัน เพราะ 1 ประเภทมี managed list ได้ 1 อัน
  - validate ด้วย `Rule::exists('request_options','id')` ที่ **scope ตาม (request_type, field_key, active)** → id ที่ยืมจากรายการอื่นถูกปฏิเสธ (มี test ยืนยัน) ซึ่ง `in:` บน slug ทำไม่ได้
  - ทิ้งคอลัมน์ `value` · unique ย้ายไป `(request_type, field_key, label_en)` — ชื่อซ้ำในรายการเดียวกันถูกปฏิเสธตรง ๆ แทนที่จะเงียบ ๆ ต่อท้าย `_2`
  - `castReferences()` แปลงค่าจากฟอร์มเป็น int ก่อนบันทึก ทั้ง managed และ source (FK ที่เก็บเป็น `"7"` เทียบกับ id ที่เป็นตัวเลขไม่ติด)
  - ลบตัวเลือกได้อย่างปลอดภัยเพราะคำขอเก่าอ่านจาก `_display` snapshot ของตัวเอง · เปลี่ยนชื่อได้เสรีเพราะ link เป็น id
- **ลำดับใช้การลากสลับ** ไม่ใช่กรอกเลข: ลากแล้วแถวเลื่อนตามเมาส์ทันที ปล่อยแล้ว `POST request-options/reorder` เขียนลำดับใหม่ทั้งรายการใน transaction (ส่งไม่ครบ = 422 ไม่ยอมทำครึ่ง ๆ) · react-query เขียน cache แบบ optimistic แถวจึงไม่เด้งกลับ · มีปุ่มลูกศรขึ้น/ลงคู่กันไว้ให้คีย์บอร์ด · ตัวเลือกใหม่ไปต่อท้ายรายการเอง (native HTML5 drag — ไม่เพิ่ม dependency)

### 6. เลิกประกอบคีย์ i18n ตอน runtime (soft link → คีย์จริง)

เดิมโค้ดใหม่เรียก `t(\`req_${type}\`)` / `t(\`req_status_${status}\`)` 16 จุด ซึ่ง `grep req_hardware` หาที่ใช้ไม่เจอ, เพิ่มประเภทใหม่แล้ว compile ผ่านแต่หน้าจอโชว์ชื่อคีย์ดิบ (เพราะ `translate()` คืนคีย์เมื่อหาไม่เจอ)

- ย้ายเป็น registry ที่เขียนคีย์ไว้ตรง ๆ แบบเดียวกับ `labelKey` ของฟอร์ม Contract: `shared/lib/request-meta.ts` → `REQUEST_TYPE_META` (icon + สี + labelKey) · `REQUEST_STATUS_META` (tone + labelKey) · `REQUEST_TYPES` / `REQUEST_STATUSES`
- เป็น `Record<ServiceRequestType, …>` → **เพิ่มประเภทที่ 12 แล้ว build ไม่ผ่านจนใส่คีย์ให้** (ทดสอบด้วยการเพิ่ม type ปลอมแล้วได้ TS2741 จริง)
- state ของ filter เปลี่ยนจาก `useState('')` เป็น `ServiceRequestStatus | ''` / `ServiceRequestType | ''` เพื่อ index registry ได้ตรง ๆ · แจ้งเตือน `notif_request_*` ใช้ map คีย์จริงพร้อม fallback (subtype แปลก ๆ จะไม่พิมพ์ชื่อคีย์ออกจอ)
- registry วางที่ `shared/` เพราะ 3 โมดูลอ่าน (request/workflow/settings) และเป็นคำศัพท์ของ type ที่อยู่ใน `shared/types` อยู่แล้ว — ถ้าวางไว้ในโมดูล request จะเกิด **circular import** กับ workflow (request ดึง `WorkflowStrip`, workflow ดึง registry)

### Tests / Verification

`RequestOptionTest` (16) รวมลำดับ/ลาก/สิทธิ์/FK ข้ามรายการ/FK ระดับฐานข้อมูล/กันลบตัวที่ถูกใช้ · `SettingsPermissionsTest` อัปเดตเป็น 9 คีย์ · **ทั้ง suite = 788 passed / 3,090 assertions** · `tsc --noEmit` = 0 · eslint = 0 · pint ผ่าน · `npm run build` ผ่าน · migrate + `RequestOptionSeeder` รันบนฐานจริงแล้ว

---

## Employee Import v2 — ตามผังองค์กรจริง + ตรวจก่อนนำเข้า (2026-08-05)

ตัว import เดิมเขียนไว้ก่อนที่ระบบจะมี **section** และ **สายบังคับบัญชา** จึงนำเข้าได้แค่ 10 คอลัมน์และสร้างพนักงานที่ไม่มีหน่วยงาน/ไม่มีผู้บังคับบัญชา — คนที่ import เข้ามาไม่ขึ้นบนผังองค์กรและผิดกฎที่ฟอร์มปกติบังคับอยู่ (`StoreEmployeeRequest`) รอบนี้ยกเครื่องทั้งเส้น

### 1. Template ใหม่ 12 คอลัมน์ (จับคู่ master data ด้วย "ข้อความ")

`employee_code, first_name, last_name, first_name_th, last_name_th, email, phone, department, section, position, joined_at, report_to_employee_code`

- เดิมบังคับกรอก **รหัส** (`department` = tag, `position` = `PST-0002`) ซึ่งคนกรอกไฟล์ไม่มีทางรู้ — ตอนนี้ทั้งสามช่องรับ **ข้อความที่คนใช้จริง**: department = tag / `DEP-####` / ชื่อ EN / ชื่อไทย · section = ชื่อ หรือ `SEC-####` · position = ชื่อตำแหน่ง (`Manager`) หรือ `PST-####` — ตัดช่องว่างและไม่สนตัวพิมพ์ใหญ่เล็ก
- **section หาเฉพาะในแผนกของแถวนั้น** ไม่ใช่ทั้งระบบ (กฎเดียวกับฟอร์ม) — `department=It, section=Quality Control` ถูกปฏิเสธ เพราะ Quality Control เป็นหน่วยงานของแผนก QC
- **ข้อความที่ตรงกับ 2 รายการ = error ไม่ใช่เดา** (index เก็บทุก id ที่คำนั้นชี้ไป) — ผังจริงตอนนี้ไม่มีคำกำกวมเลย และมีเทสต์ seed master data จริงคุมไว้ ถ้าวันหนึ่งมีชื่อชนกัน เทสต์จะแตกก่อนที่คนจะถูกใส่ผิดหน่วยงาน
- `employee_code` เว้นว่าง = ระบบออก `EMP-####` ให้ · header เดิมชื่อ `code` ยังใช้ได้ (ไฟล์ที่โหลดไปก่อนหน้านี้ไม่พัง)
- ตัวอย่างในไฟล์ template **ดึงจาก master data ที่มีจริง** (tag แผนกแรก, หน่วยงานของแผนกนั้น, ตำแหน่งปกติตัวแรก, รหัสคนบนสุดของผัง) ไฟล์จึงบอกตัวสะกดที่ระบบต้องการด้วยตัวเอง

### 2. สายบังคับบัญชามาพร้อมไฟล์

- `report_to_employee_code` ชี้ด้วยรหัสพนักงาน — **หัวหน้าอยู่แถวล่างกว่าลูกน้องได้** เพราะเขียนสองรอบใน transaction เดียว (สร้างทุกคนก่อน แล้วผูก `manager_id`)
- ปฏิเสธก่อนเขียน: รหัสที่ไม่มีทั้งในฐานและในไฟล์ · ชี้ตัวเอง · **วนเป็นลูป** (A→B, B→A) ตามกฎกันลูปของฟอร์ม
- กฎ **special position** เหมือนฟอร์มเป๊ะ: ตำแหน่งปกติต้องมี department + section + report_to ครบ · Vice President (`allow_special_position`) เว้นได้ทั้งสามช่องเพราะเป็นยอดของผัง

### 3. ตรวจก่อนนำเข้า (dry-run) แทนการเดา

- `POST employees/import/preview` — กฎเดียวกับของจริง ไม่เขียนอะไรเลย คืนทุกแถวพร้อม **หน่วยงาน/ตำแหน่ง/หัวหน้าที่ resolve ได้แล้ว** + เหตุผลที่แถวนั้นผ่านไม่ได้ · ไฟล์ที่ผิดยังตอบ 200 (เป็นรายงาน ไม่ใช่คำสั่งที่ล้มเหลว)
- Dialog เลือกไฟล์แล้ว preview ขึ้นเอง: ชิปนับ ทั้งหมด / พร้อมนำเข้า / มีข้อผิดพลาด → ตาราง `ImportPreviewTable` (แถวผิดแดงพร้อมข้อความใต้แถว) → ปุ่มนำเข้าปลดล็อกเมื่อไฟล์สะอาดทั้งไฟล์ (ฝั่งเซิร์ฟเวอร์ยัง all-or-nothing เหมือนเดิม)
- **คอลัมน์แปลกในไฟล์ HR ไม่ทำให้ทั้งไฟล์ตก** — ระบบข้ามให้แล้วบอกชื่อคอลัมน์ที่ข้าม (`meta.ignored_columns`) ไม่ให้ใครเข้าใจผิดว่าเงินเดือนถูกบันทึกไปด้วย
- เลิก hardcode ข้อความในคอมโพเนนต์ (เดิม `lang === 'th' ? … : …`) → คีย์ `import_*` ครบทั้ง en/th

### 4. โครงโค้ด

`importRows` ย้ายออกจาก `EmployeeService` (ที่ทำ 6 หน้าที่อยู่แล้ว) ไปเป็น **`App\Services\Employee\EmployeeImportService`** — index ของ master data, กฎต่อแถว, ตรวจลูป, เขียนสองรอบ อยู่ที่เดียว · `EmployeeImportService::COLUMNS` เป็นต้นทางเดียวของหัวตาราง (template, การเช็คคอลัมน์แปลก, และเทสต์ อ่านจากค่านี้)

### Tests / Verification

`EmployeeImportTest` (17 tests / 72 assertions) — text matching ทั้งสามช่อง · section ผิดแผนก · ข้อความกำกวม · กฎ special position · หัวหน้าอยู่ท้ายไฟล์ · ลูป · header เดิม `code` · dry-run ไม่เขียน · endpoint preview/import/template · และ **เทสต์ที่ seed ผังองค์กรจริง** (`DepartmentSeeder`/`SectionSeeder`/`PositionSeeder`) แล้วยืนยันว่าคำที่ HR พิมพ์ resolve ได้ตัวเดียว
**ทั้ง suite = 839 passed / 3,265 assertions** · `tsc --noEmit` = 0 · eslint = 0 · pint ผ่าน · `npm run build` ผ่าน

---

## Add Employee → Focus Dialog wizard (2026-08-06)

**Edit** พนักงานเป็น Focus Dialog อยู่แล้ว (`edit-employee-dialog.tsx`) แต่ **Add** ยังเป็น Sheet ด้านขวา 600px — เพิ่มกับแก้คนเดียวกันเลยคนละหน้าตา รอบนี้ย้าย Add มาอยู่กรอบเดียวกัน โดยยังเป็น wizard 3 ขั้นตามที่ใช้จริง

- **กรอบ**: `Sheet side="right"` → `Dialog` + `focusDialogContentClass` (`h-[min(860px,100vh-72px)]` × `max-w-[1100px]`) + `FocusDialogHeader` (ไอคอน `UserPlus` · eyebrow "เพิ่มพนักงาน" · title = ชื่อที่กำลังพิมพ์ ถ้ายังว่างใช้ "พนักงานใหม่" — หัวข้อเปลี่ยนตามที่กรอก)
- **Stepper แนวนอน** ①②③ พร้อมเส้นเชื่อมที่เปลี่ยนเป็นสีแบรนด์เมื่อผ่าน + ติ๊กถูก (คลาสชุดเดียวกับ `contract-form-drawer`) แทนการ์ดสเต็ป 3 ใบแบบเดิม · คลิกย้อนได้เสมอ กระโดดข้ามไปข้างหน้าต้อง validate ทุกขั้นที่ข้าม (`goToStep`)
- **ใช้ความกว้าง 1100px เป็น 2 คอลัมน์** (เดิม 600px บังคับเรียงลงล่างทีเดียว): ขั้น ① รูป+อัปโหลดอยู่ในกรอบพาดเต็มกว้าง แล้วชื่อ EN / ชื่อไทย / ติดต่อ เรียงเป็นคู่ · ขั้น ② ซ้าย แผนก-หน่วยงาน-ตำแหน่ง ขวา Report to-วันเริ่มงาน-รหัสพนักงาน · ขั้น ③ กล่องแจ้งสิทธิ์เริ่มต้น + บัญชีรอตั้ง วางคู่กัน แล้วการ์ดบริการ onboarding เรียง 3 คอลัมน์
- **หัวขั้น `StepHead`** (ขั้นที่ N → หัวข้อตัวหนา → คำอธิบาย) ใช้ `t()` ทั้งหมด ไม่ใช่ `lang === 'th' ? … : …` แบบที่ contract ทำ · เพิ่มคีย์ en+th 5 ตัว: `emp_step_n` · `emp_new_person` · `emp_personal_sub` · `emp_work_sub` · `emp_access_sub`
- **Footer** `border-t bg-muted/30`: ยกเลิก/ย้อนกลับ · step dots · ถัดไป/บันทึก (spinner ตอนบันทึก)
- **Enter-to-advance เข้มขึ้น**: เดิมกันแค่ `TEXTAREA` — ในกรอบใหม่ที่ stepper และการ์ดบริการเป็น `<button>` อยู่ในกรอบเดียวกัน การกด Enter จะทั้งกดปุ่มนั้นและข้ามขั้นพร้อมกัน จึงกัน `BUTTON`/`SELECT`/`OPTION` เพิ่ม (ชุดเดียวกับ Edit dialog)
- **กดบันทึกแล้วเจอ error ของขั้นก่อน จะเด้งกลับไปขั้นนั้น** ไม่ใช่แค่โชว์ error ที่มองไม่เห็น (เดิม `submit()` validate ทั้งสองขั้นแต่ค้างอยู่หน้าเดิม)
- ไม่แตะ form state / กฎ special position / map error 422 → field / `PhotoCropDialog` / payload — และตัวเลือกบริการ onboarding **ยังไม่ได้ส่งไป API เหมือนเดิม** (`emp_onboarding_deferred`)

### Tests / Verification

`tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · `npm run build` ผ่าน (ฝั่ง frontend โปรเจกต์นี้ไม่มี test runner) · ไม่มีไฟล์ PHP เปลี่ยน suite เดิมจึงยังเป็น 839 passed

---

## Onboarding requests → ต่อเข้า Workflow อนุมัติจริง (2026-08-06)

ขั้น ③ ของหน้าเพิ่มพนักงานเคยเป็น UI เปล่า — ติ๊กบริการแล้วค่าหายไปกับ state (คำว่า `onboarding` ไม่เคยปรากฏในไฟล์ PHP ไฟล์ใดเลย) ตอนนี้ติ๊กแล้ว **ยื่นคำขอเข้าโมดูล Request จริง 1 ใบต่อ 1 บริการ** โดยคำขอเป็นของพนักงานใหม่ ไม่ใช่ของ HR ที่กด

### 1. แยก "เจ้าของคำขอ" ออกจาก "คนกดยื่น"

เดิม `user_id` เป็นทั้งสองอย่างในคอลัมน์เดียว ซึ่งพังทันทีเมื่อ HR ยื่นแทน: คนที่เป็นเจ้าของยังไม่มีบัญชี (`user_id` = null) migration `add_origin_to_service_requests` เพิ่ม 3 คอลัมน์

- `origin` (`direct` / `onboarding` — enum `RequestOrigin`; ใช้ค่า `direct` เพราะ PHP ห้ามตั้งชื่อ enum case ว่า `self`) · `submitted_by_user_id` (FK users, null on delete) · `submitted_by_name` (snapshot เหมือน `requester_name`)
- `user_id`/`employee_id` ยังหมายถึงเจ้าของคำขอ → **สายอนุมัติไต่ manager ของพนักงานใหม่** ที่กรอกไว้ในขั้น ② ไม่ใช่สายของ HR
- `RequestService::submit()` (ยื่นเอง) กับ **`submitFor(Employee $subject, User $actor, …)`** (ยื่นแทน) เรียก private `create()` ตัวเดียวกัน — ตรรกะ snapshot/resolver/activate ไม่ได้ถูกคัดลอก
- **`EmployeeOnboardingService`** วนบริการที่ติ๊ก (computer / mobile / email) ยิงทีละใบ · **workflow ที่ปิดอยู่ไม่ทำให้เสียพนักงาน**: สร้าง Employee ให้เสร็จก่อน แล้วจับ error ต่อรายการ ตอบกลับ `onboarding: {created, failed}` ให้ dialog ขึ้น toast บอกว่าใบไหนยื่นไม่ได้ (แทนที่จะ rollback การจ้างคนเพราะ workflow ปิด)
- คำขอ onboarding ไม่มีฟิลด์เฉพาะประเภท (หน้าเพิ่มพนักงานไม่ได้ถามรุ่นเครื่อง) — `title` = "Computer for <ชื่อ>" · `reason` = หมายเหตุที่ HR กรอก หรือข้อความบอกว่าให้ยืนยันรายละเอียดกับหัวหน้า
- **สิทธิ์**: ใช้ `employees.add` ที่คนกดถืออยู่แล้ว ไม่บังคับสิทธิ์โมดูล Request (แต่ถ้าจะ *เปิดดู* คำขอในหน้า Requests ยังต้องมีสิทธิ์อ่านของโมดูลนั้นตามปกติ)

### 2. สองบั๊กที่โผล่เพราะมี "คำขอที่เจ้าของไม่มีบัญชี"

- `can_cancel` + `RequestService::cancel()` เช็คแค่ `user_id === actor` → คำขอที่ HR ยื่นแทน **ไม่มีใครยกเลิกได้เลย** เพราะเจ้าของยังไม่มี login ตอนนี้คนที่ยื่นแทนยกเลิกได้
- visibility ของ `RequestController@index`, `scope=mine` และ `show()` ก็เช็คแค่ `user_id` → HR ยื่นแล้วหาคำขอของตัวเองไม่เจอและเปิดไม่ได้ ตอนนี้รวม `submitted_by_user_id`
- แจ้งเตือนทุกชนิดของ Request เคยส่งไปที่ `$request->user` เท่านั้น → คำขอ onboarding จะไม่มีใครได้รับเลย เพิ่ม `follower()` = เจ้าของ หรือ (ถ้าเป็นการยื่นแทน) คนที่ยื่น

### 3. ป้าย "พนักงานใหม่" สี violet — 4 ที่ที่ผู้อนุมัติเจอคำขอ

violet เป็นโทนเดียวใน `StatusBadge` ที่ไม่มีสถานะไหนใช้ จึงไม่ชนกับ pending/approved/rejected

1. **ตารางคำขอ** — badge ใต้ชื่อผู้ขอ + **แถบ violet ซ้ายแถว** (เพิ่ม prop `rowClassName?: (row) => string` ให้ `DataTable` — optional ไม่กระทบตารางอื่น)
2. **การ์ดรออนุมัติ / กิจกรรมล่าสุด** — badge ข้างหัวเรื่อง + แถบซ้ายการ์ด
3. **หน้า detail** — แบนเนอร์ violet ใต้ header (`คำขอสำหรับพนักงานใหม่ · ยื่นแทนโดย <ชื่อ> · <วันที่>`) + แถว KV "ยื่นแทนโดย"
4. **กระดิ่ง + อีเมล** — bell payload มี `origin` แล้วข้อความนำหน้าด้วย "พนักงานใหม่ ·" · อีเมลใส่ `[New employee]` หน้าหัวเรื่อง (เทมเพลตไม่มีฟิลด์ origin ให้ผูก)

`isOnBehalfRequest()` / `REQUEST_ONBOARDING_BADGE` / `REQUEST_ONBOARDING_ROW` อยู่ที่ `shared/lib/request-meta.ts` ที่เดียว — อ่าน `origin` ไม่ใช่เดาจาก "user_id เป็น null"

### 4. "ยังไม่มีบัญชี" ไม่ใช่เหตุผลที่จะข้ามการอนุมัติ (เปลี่ยน policy)

ลองใช้จริงแล้วเจอว่าคำขอ onboarding ทั้ง 3 ใบขึ้นเป็น **approved ทันทีโดยไม่มีใครอนุมัติ** พร้อมแถว `Skipped — requester has no manager configured.` ทั้งที่พนักงานใหม่มี `manager_id` ครบ

สาเหตุ: `WorkflowResolverService::isEligible()` เดิมนับคนเป็นผู้อนุมัติได้เมื่อ **active + มีบัญชี login** — ฐานจริงยังไม่มีพนักงานคนไหนมีบัญชีเลย (บัญชีถูกตั้งทีหลังผ่าน set-credentials) → chain ว่าง → chain step ทุกขั้นถูกรวบเป็นแถว skipped → ไม่มีแถวที่กดได้ → `activateNextApproval()` ข้ามไป fulfillment แล้ว `finalize()` ทันที

แก้เป็น: **มีหัวหน้าคือรอหัวหน้าคนนั้น** ไม่ว่าบัญชีจะสร้างแล้วหรือยัง

- แยกความหมายออกเป็น 2 อย่าง: `canHoldAStep()` = ถือขั้นนั้นได้ (active เท่านั้น — **ไม่ต้องมีบัญชี**) · `canActNow()` = กดได้ตอนนี้ (มีบัญชี) ใช้แค่ตอนใส่หมายเหตุ
- แถวที่ผู้อนุมัติยังไม่มีบัญชี = สถานะ `waiting`/`current` ตามปกติ → คำขอค้างเป็น **pending** จนกว่าจะตั้งบัญชีให้เขา แล้วเขาล็อกอินมากดเอง (แถวผูกด้วย `approver_employee_id` อยู่แล้ว จึงเด้งขึ้น "รออนุมัติของฉัน" ทันทีที่บัญชีถูกผูก)
- **เหตุผลที่ข้ามขั้นเก็บเป็นรหัส ไม่ใช่ประโยค** — เพิ่มคอลัมน์ `request_approvals.skip_reason` + enum `ApprovalSkipReason` 3 ค่า: `no_manager` (ผู้ขอไม่มีหัวหน้าเลย) · `no_resource_owner` (resource ไม่มีเจ้าของ หรือเจ้าของลาออก) · `requester_is_owner` (ผู้ขอเป็นเจ้าของเอง — ต่างจากข้อก่อนหน้าเพราะ "ตั้งแล้วแต่ชนตัวเอง") · เป็น snapshot ถูกต้องเพราะเป็นข้อเท็จจริงตอนยื่น แต่ **ถ้อยคำเป็นเรื่องการแสดงผล** จึงย้ายไปที่ `req_skip_*` ใน `lang/` (`REQUEST_SKIP_REASON_LABEL` map รหัส→คีย์แบบเขียนตรง ไม่ประกอบคีย์ตอน runtime) · migration backfill รหัสจากประโยคเดิมแล้วล้างประโยคออก · หลังจากนี้ **`note` มีความหมายเดียวคือ "สิ่งที่คนเขียน"**
- **ตัดประโยค `Also covers "…" — the same person resolved for both steps.` ออกจาก note ด้วย** — เมื่อหลายขั้นได้หัวหน้าคนเดียวกัน แถวจะยุบเป็นใบเดียวและ **label ก็เรียงชื่อทุกขั้นที่มันคลุมไว้แล้ว** (`Supervisor / Head · Manager / Asst. Manager · Vice President`) การเขียนประโยคอังกฤษซ้ำสิ่งที่ label พูดอยู่จึงเป็นส่วนเกิน · note เหลือไว้ให้เหตุผล skip กับ remark ที่คนเขียนเท่านั้น · migration `clear_merged_step_notes` ล้างของเก่าที่ค้างในฐาน (คง remark/skip reason บนแถวเดียวกันไว้ครบ)
- **ข้อความ "ยังไม่มีบัญชี" ไม่ถูก snapshot ลง `request_approvals.note`** — ตอนแรกทำเป็น note แล้วเห็นว่าผิด เพราะแถวอนุมัติเป็นภาพนิ่ง แต่ "ยังไม่มีบัญชี" ไม่ใช่: พอ HR สร้างบัญชีให้ note จะโกหกทันที · เปลี่ยนเป็น `RequestApprovalResource` คำนวณสด ๆ เป็น `awaiting_account` (เฉพาะแถว approval ที่ยังไม่ตัดสิน + มีตัวบุคคล + ยังไม่มี user) → หน้า trail แสดงบรรทัด **"รอ - ผู้อนุมัติรายนี้ยังไม่มีบัญชีผู้ใช้งาน" / "Waiting - this approver has no login account yet"** เป็นแถบสีเหลืองพร้อมไอคอนกุญแจ แยกจากกรอบ remark ของคน (ได้ภาษาตาม UI ด้วย ซึ่ง note ที่เก็บเป็น string ในฐานทำไม่ได้) · endpoint ทุกตัว eager-load `approvals.approver.user` กัน N+1
- **คนที่ลาออกยังถูกข้าม** (ไต่ขึ้นหัวหน้าคนถัดไป) เพราะเขาไม่กลับมากดแล้วจริง ๆ — ต่างจากบัญชีที่ยังไม่ได้สร้าง
- ไม่มีหัวหน้าเลย (`manager_id` ว่าง เช่นตำแหน่งพิเศษบนยอดผัง) ยังรวบเป็นแถว skipped เหมือนเดิม เพราะไม่มีใครให้รอ
- owner step ของ Access resource ใช้กฎเดียวกัน (เจ้าของที่ยังไม่มีบัญชี = รอ ไม่ใช่ข้าม)

**ปิดช่องว่างแล้ว (2026-08-07):** เดิมถ้าผู้อนุมัติยังไม่มีบัญชี **ไม่มีแจ้งเตือนออกไปหาใครเลย** (`notifyApprover()` ออกทันทีเมื่อหา user ไม่เจอ) คำขอค้างเงียบ ๆ — ตอนนี้ยิง bell subtype `blocked_no_account` ไปหาผู้ถือ `employees.set_credentials` พร้อมชื่อคนที่ต้องตั้งบัญชี และกดแล้วเปิด**หน้าพนักงานคนนั้น** (`/employees?highlight=`) ไม่ใช่หน้าคำขอที่ยังกดอะไรไม่ได้ · แถว `it_staff` (คิว IT) ไม่ยิง เพราะไม่ได้ระบุตัวบุคคล

---

## แจ้งเตือน 2 จุดที่หายไปทั้งที่ควรมี (2026-08-07)

เจอจากการใช้จริง: ทดสอบ Manager ถูกเพิ่มเข้าระบบแต่ยังไม่ถูกตั้งบัญชี · HR เพิ่มพนักงานใหม่ที่ report to เขา · คำขอ 3 ใบถูกสร้างจริง · แต่พอตั้งบัญชีให้ Manager แล้วล็อกอินเข้าไป **ไม่มี bell และ sidebar ไม่มีตัวเลขรออนุมัติ**

### 1. Sidebar badge ของโมดูล Request ไม่เคยขึ้นเลย (บั๊ก)

`SidebarBadgeService` ส่ง `requests` มาถูกต้อง (ยิงจริงกับบัญชีที่มีปัญหาได้ 2) แต่ `sidebar.tsx` แผนที่ที่แปลง count → badge **ไม่มีคีย์ `requests`** → `badges[item.id] ?? 0` ตกเป็น 0 ตลอด ไม่เกี่ยวกับสิทธิ์หรือ cache · `SidebarBadgeTest` assert badge อื่นครบทุกตัวยกเว้นตัวนี้ เลยไม่มีใครจับได้ — เพิ่มเทสต์แล้ว (ฝั่ง map เองไม่มี test runner ให้ครอบ)

### 2. คำขอค้างเพราะผู้อนุมัติไม่มีบัญชี = ไม่มีใครรู้ (ช่องว่าง)

แจ้งเตือนเป็น push ครั้งเดียวตอนเกิดเหตุการณ์ — ตอนยื่น `notifyApprover()` หา user ไม่เจอก็ `return` และไม่มีอะไรย้อนมาส่งใหม่ตอนสร้างบัญชีทีหลัง เพิ่ม 2 อย่าง:

- **`blocked_no_account`** — bell ใหม่ไปหาผู้ถือ `employees.set_credentials` เมื่อขั้นที่เป็น `current` ชี้ไปที่คนที่ยังไม่มี login (เกิดทั้งตอนยื่นและตอนขั้นก่อนหน้าอนุมัติผ่าน) · payload พา `employee_id` ไปด้วยเพื่อให้กดแล้วเปิดหน้าพนักงานคนนั้น ไม่ใช่คำขอที่ยังกดอะไรไม่ได้ · ไอคอนกุญแจสีเหลือง แยกจาก bell อนุมัติ · แถวคิว IT ไม่ยิง (ไม่มีตัวบุคคล)
- **bell "ต้องตั้งบัญชี" เลิกตัดคนที่กดเพิ่มพนักงานออก** — เดิม `recipientsWithPermission(..., $actor)` ตัด actor ทิ้ง ในฐานจริงที่ `super` เป็นคนเดียวที่ถือสิทธิ์นี้ → รายชื่อว่าง → ไม่ส่งอะไรเลย (ตาราง notifications ไม่มี `new_employee` แม้แถวเดียว) · bell นี้เป็น **to-do ไม่ใช่ข่าวประกาศ** — เพิ่มพนักงานกับตั้งบัญชีเป็น 2 งานแยกกัน คนเพิ่มมักเป็นคนทำต่อ · การแจ้งลาออกยังตัด actor ตามเดิมเพราะเป็นข่าวสารจริง

### 3. พอสร้างบัญชีแล้ว ส่งของที่ค้างให้ทันที

ใช้จริงแล้วเจอต่อ: คำขอเกิด 09:49 (ยังไม่มีบัญชี → bell ไปหา `super` ว่าค้าง) · สร้างบัญชี 09:59 · ผู้อนุมัติล็อกอินเข้ามา **sidebar ขึ้น 3 แต่กระดิ่งว่างเปล่า** เพราะแจ้งเตือนเป็น push ครั้งเดียวและไม่มีอะไร replay

`RequestNotificationService::deliverPendingApprovals(Employee)` ส่ง bell "รอการตัดสินของคุณ" ของทุกขั้นที่เป็น `current` ของคนนั้น เรียกจาก `EmployeeService::createUserWithCredentials()` — **วินาทีแรกที่มีกล่องข้อความให้ส่งถึง** · ถ้าไม่มีอะไรค้างก็ไม่ส่งอะไร

### 4. พนักงานใหม่อ่านคำขอของตัวเองได้

คำขอ onboarding มี `employee_id` = พนักงานใหม่ แต่ `user_id` เป็น null (ตอนยื่นเขายังไม่มีบัญชี) และเงื่อนไขการมองเห็นทั้งหมดดูที่ `user_id` / `submitted_by_user_id` / การเป็นผู้อนุมัติ — **เจ้าตัวจึงมองไม่เห็นคำขอที่ HR ขอให้เขาเลย** ลิสต์ว่างและเปิดดูได้ 403

เพิ่มเงื่อนไข `employee_id = ตัวเอง` ที่ 3 จุด: visibility ของ `index`, `scope=mine`, และการเช็คผู้เกี่ยวข้องใน `show()` — นิยามของ "คำขอของฉัน" คือ **เกี่ยวกับฉัน หรือ ฉันเป็นคนยื่น** · `can_cancel` **ไม่เปลี่ยน**: onboarding เป็นของคนที่รันมันคือ HR พนักงานใหม่ติดตามได้แต่ไม่ถอนคำขอคอมที่ HR ขอให้ในวันแรก (มีเทสต์คุมทั้งสองข้อ)

### 5. อัปเดตคำขอไปถึงทั้งเจ้าตัวและคนที่ยื่นให้

`follower()` เดิมเลือกผู้รับ**คนเดียว** — เจ้าของบัญชี ถ้าไม่มีจึงตกไปที่คนยื่นแทน ผลคือคำขอ onboarding ทุกใบรายงานผลให้ HR ตลอดชีวิต แม้พนักงานจะมีบัญชีแล้ว

เปลี่ยนเป็น `followers()` คืน **หลายคน**: คนที่คำขอเป็นของเขา + คนที่ยื่นแทน (ถ้าเป็นการยื่นแทน)

- หา account ของเจ้าตัวผ่าน **`employee->user` ไม่ใช่แค่ `user_id`** — คำขอ onboarding ยื่นก่อนบัญชีจะมี ดังนั้นดูสด ๆ ทุกครั้ง **วันที่ตั้งบัญชีเสร็จเขาก็เริ่มได้รับข่าวคำขอตัวเองทันที ไม่ต้องเขียน `user_id` ย้อนหลัง**
- ยื่นเอง (เจ้าของ = คนยื่น) รายชื่อยุบเหลือคนเดียว **ไม่มีใครได้ 2 ใบ** (มีเทสต์คุม)
- คิว fulfill ตัดคนที่เป็น follower ออก (เพิ่งได้ bell "อนุมัติครบ" ไปแล้ว) เดิมตัดแค่ `user_id`

ครอบทั้ง 5 เหตุการณ์: ยื่น · ผ่านขั้น · อนุมัติครบ · ไม่อนุมัติ · ปิดงาน — ทั้ง bell และอีเมล

### ที่ยังไม่ทำ

**Toast ไม่เด้งตอนล็อกอินครั้งแรก** — `notification-toaster.tsx` ตั้งใจ seed "เห็นแล้ว" จากการดึงครั้งแรกของหน้า (กัน reload แล้วเด้งรวด 13 ใบ) ผลคือแจ้งเตือนที่เกิดก่อนล็อกอินจะไม่เด้งเลย เห็นได้แต่ในกระดิ่ง · ทางแก้ที่คิดไว้คือ toast สรุปใบเดียว ("มีแจ้งเตือนที่ยังไม่ได้อ่าน N รายการ") แต่ยังติดว่ากดแล้วควรไปไหน — กระดิ่งเป็น dropdown ใน topbar ไม่ใช่ route

### Tests / Verification

`RequestNotificationTest` +2 (คำขอค้าง → คนตั้งบัญชีได้ bell พร้อม employee_id · แถวคิว IT ไม่ยิง) · `EmployeeApiTest` +1 (คนที่กดเพิ่มพนักงานได้ bell ด้วย) · `SidebarBadgeTest` +1 · `EmployeeOnboardingRequestTest` +2 (สร้างบัญชีแล้วได้ bell ที่ค้างครบทุกใบ · ไม่มีอะไรค้างก็ไม่ส่ง) · **ทุกตัวยืนยันด้วยการปิดโค้ดใหม่ชั่วคราวแล้วเห็น fail ก่อนคืนกลับ**
`EmployeeOnboardingRequestTest` +4 (พนักงานใหม่อ่านคำขอของตัวเองได้ทั้งลิสต์/mine/detail · แต่ยกเลิกไม่ได้ · ผลลัพธ์ไปถึงทั้งเจ้าตัวและ HR · ยื่นเองได้ใบเดียว)
**ทั้ง suite = 872 passed / 3,384 assertions** · `tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน

---

## Workflow Engine — เลือกผู้อนุมัติจาก "ตำแหน่งจริง" ไม่ใช่หัวหน้าคนที่ N (2026-08-06)

อาการที่รายงาน: พนักงาน Staff ขอคอม แล้วสายอนุมัติออกมาเป็น **Leader → Supervisor** ทั้งที่ workflow เขียนว่า Supervisor/Head → Manager/Asst. Manager

สาเหตุคือดีไซน์เดิม: `StepActorType::Chain` เขียนไว้ตรง ๆ ว่า *"positional along the requester's manager line (label is display only)"* — engine หยิบ **หัวหน้าคนที่ N** ไม่เคยดูตำแหน่ง ทั้งที่ชื่อขั้นทุกขั้นเป็นชื่อตำแหน่ง

### กฎใหม่: ขั้น = "ระดับตำแหน่ง" แล้วไต่ report-to หาคนที่ถือตำแหน่งนั้น

- ตาราง pivot **`workflow_step_positions`** (FK ทั้งสองข้าง · `positions` เป็น `restrictOnDelete` — ตำแหน่งที่ workflow อ้างอยู่ลบไม่ได้) · **1 ขั้นรับได้หลายตำแหน่ง** ตามที่ `/` ในชื่อขั้นสื่อไว้แต่แรก
- Default 3 ระดับใน `DefaultWorkflows::RUNGS`: **Supervisor** {Asst. Supervisor · Supervisor · Senior Supervisor} → **Manager** {Asst. Manager · Manager · Senior Manager} → **Executive** {Vice President · Director} · **Leader ลงมาไม่อยู่ในระดับใดเลย** (ไม่ใช่ผู้อนุมัติ ตามที่ตกลง)
- resolver ไต่สายขึ้นไป **ต่อจากคนที่ขั้นก่อนหน้าจับได้** (คนเดียวเป็น 2 ระดับไม่ได้) · เจอคนแรกที่ตำแหน่งอยู่ในชุดของขั้นนั้น
- **ไม่มีใครในสายถือตำแหน่งนั้น = ข้ามขั้นนั้น** (`skip_reason` ใหม่ `no_matching_position` + คำแปล en/th) — เช่น Supervisor ยื่นเอง ก็ไม่ต้องมี Supervisor อนุมัติตัวเอง ขึ้น Manager เลย
- **กันชนห้าม bypass**: ถ้าทุกขั้นหาคนไม่เจอเลย แต่ในสายมีคนอยู่ → **หัวหน้าคนบนสุดของสายเซ็น 1 ขั้น** ไม่ปล่อยให้คำขออนุมัติตัวเองผ่าน
- คนลาออกยังถูกข้ามเหมือนเดิม · คนที่ยังไม่มีบัญชี login ยังถือขั้นไว้และรอ (จากรอบก่อน)

### ตัวแก้ไข + seeder

- **หน้าแก้ Workflow ออกแบบใหม่เป็น "บันได"** — ขั้นเรียงบนรางแนวตั้ง หมายเลขอยู่บนราง ขั้นสุดท้ายเป็นธง (ไม่ใช่เลข เพราะไม่ใช่ระดับอนุมัติ) · แต่ละขั้นบอก "เซ็นโดย" เป็นชิปตำแหน่งที่เลือกไว้จริง แล้วกด "แก้" เปิดรายการทั้งหมด **ทีละขั้น** พร้อม **ชุดสำเร็จ 3 ระดับ** (ระดับ Supervisor / ระดับ Manager / ผู้บริหาร) ที่ดึงจาก `DefaultWorkflows::RUNGS` ตัวเดียวกับ seeder — เดิมวาดปุ่มตำแหน่งทั้ง 14 ตัวซ้ำทุกขั้น (3 ขั้น = 42 ปุ่มในจอเดียว)
- **ตัด dropdown "ชนิดขั้นตอน" ออก** เพราะคำนวณได้จากผู้ดำเนินการอยู่แล้ว (ทีม IT = ขั้นดำเนินการ อย่างอื่น = ขั้นอนุมัติ) และ validation ก็บังคับอยู่ — เก็บไว้เท่ากับเปิดทางเลือกค่าที่บันทึกไม่ผ่าน · **ตัด strip พรีวิวในตัวแก้ไขออก** (บันไดคือลำดับอยู่แล้ว และ strip ยังอยู่ที่หน้า list/view) · ปุ่มบันทึกปิดตัวเองเมื่อมีขั้นที่ยังไม่เลือกตำแหน่ง แทนที่จะให้ยิงไปโดน 422
- endpoint ใหม่ `workflows/position-options` (peek ใต้ gate `workflows.manage` ไม่ต้องมีสิทธิ์จัดการตำแหน่ง) ส่งทั้งรายการตำแหน่งและ preset 3 ระดับ · **validation: chain ต้องมี ≥1 ตำแหน่ง** ทั้ง `UpdateWorkflowRequest` และ preview · หน้า view โชว์ตำแหน่งของแต่ละขั้นเป็น chip
- แก้ป้ายผิดที่เจอตอนรีวิว: ช่องชื่อ workflow ใช้คีย์ `wf_step_label` ("ป้ายที่แสดง" ของขั้นตอน) → เปลี่ยนเป็น `wf_name` · ข้อความ `wf_resolve_hint` ยังอธิบายกฎเก่า ("สายสั้นคนเดียวอนุมัติแทนหลายขั้น") → เขียนใหม่ตามกฎจริง
- `WorkflowSeeder` ผูกตำแหน่งให้ตอน seed (fresh install ใช้งานได้ทันที) และ **เติมย้อนหลังให้ขั้นที่ยังไม่มีตำแหน่งเลย** เมื่อรันซ้ำ — ขั้นที่แอดมินตั้งค่าไว้แล้วไม่ถูกแตะ
- migration `create_workflow_step_positions` backfill จากชื่อขั้นเดิมให้ install ที่มีทั้ง workflow และ positions อยู่แล้ว

### Tests / Verification

`RequestResolutionTest` เขียนใหม่รอบใหญ่ (12 tests) — ผังจริง `Staff → Leader → Supervisor → Manager → VP` ได้ **Sup → Mgr → VP และ Leader ไม่ถูกเรียกเลย** · ขั้นที่ไม่มีคนถือตำแหน่งถูกข้าม · ทุกขั้นหาไม่เจอ → คนบนสุดเซ็น · ขั้นถัดไปไม่ย้อนไปหยิบคนเดิม · คนลาออกถูกข้ามไปหาคนถัดไปที่ถือระดับเดียวกัน · merge ยังทำงานเมื่อ owner step ตรงกับหัวหน้าคนเดียวกัน
`WorkflowAdminTest` — preview จับคู่ตามตำแหน่ง · chain ที่ไม่ระบุตำแหน่งถูกปฏิเสธ 422 · update บันทึก pivot · re-seed เติมขั้นที่ว่างแต่ไม่ทับที่แอดมินตั้ง
fixture ของ `RequestWorkflowTest` / `RequestNotificationTest` / `RequestAutoTicketTest` / `EmployeeOnboardingRequestTest` เปลี่ยนมา seed `PositionSeeder` แล้วให้พนักงานถือตำแหน่งจริง
**ทั้ง suite = 862 passed / 3,343 assertions** · `tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน · migrate รันบนฐานจริงแล้ว

---

## Workflow — เลิกตั้ง SLA ในฐาน · วัดเวลาจริงแทน · ไม่มีการสร้าง workflow ใหม่ (2026-08-06)

### 1. SLA ที่ตั้งค่าไว้ถูกลบออกจากฐานข้อมูล

`workflow_steps.sla_days` · `request_approvals.sla_days` · `request_approvals.due_at` ถูก drop (migration `drop_sla_from_workflow_and_approvals`) — ตัวเลขพวกนี้ไม่เคยมีใครตั้งจากประสบการณ์จริง เป็นค่าที่ seed มาแบบเดาไว้ แล้วถูกใช้เป็นเส้นตายจนเกิดป้าย "เกินกำหนด" ที่อ้างอิงจากการเดา

- ตามไปลบทุกจุด: model/resource/validation (`UpdateWorkflowRequest`, `WorkflowController@preview`) · `WorkflowResolverService` (ไม่มี SLA บนแถว ไม่ต้องเอา max ตอน merge) · `RequestService` (เลิกคำนวณ `due_at`) · `RequestOptionsController` · `DefaultWorkflows` + `WorkflowSeeder` · ฝั่งหน้าเว็บ: ช่องกรอก SLA ในตัวแก้ไข · SLA รวม/ต่อขั้นในหน้า view · `WorkflowStrip` (+ prop `showSla`) · ฟังก์ชัน `fmtSla` และคีย์ i18n ที่ตายแล้ว
- `overdue` / `overdue_me` / `progress.current_overdue` หายไปจากโมดูล Request ทั้งหมด เพราะไม่มีเส้นตายให้เทียบ · `became_current_at` / `acted_at` / `approved_at` ยังอยู่ครบ ซึ่งพอสำหรับวัดของจริงย้อนหลัง

### 2. การ์ดใบที่ 3 ทำใหม่ — "เวลาตัดสินเฉลี่ย" ที่วัดจริง 30 วันย้อนหลัง

- `WorkflowController@index` คำนวณ **เวลาตั้งแต่ยื่นจนตัดสิน (submit → approved/rejected) เฉลี่ยต่อ workflow** จากคำขอที่ปิดในช่วง `MEASURE_DAYS = 30` แล้วส่งมาที่ `data[].measured = {avg_days, requests}` + `meta.measure_days`
- **หน้าต่างเวลาเป็นตัวคุมความเร็ว** — query เดียวมีขอบเขต ไม่ scan คำขอทั้งระบบตามที่กังวลไว้ · เฉลี่ยใน PHP เหมือน KPI ของหน้า Requests เพื่อไม่ผูกกับฟังก์ชันวันที่ของฐานข้อมูล
- การ์ดบอกช่วงและจำนวนตัวอย่างไว้ใต้ค่า (`ช่วง 30 วันย้อนหลัง · N คำขอ`) เพื่อไม่ให้เลขที่ขยับทุกสัปดาห์ถูกอ่านเป็นเป้าที่ใครตั้ง · ถ้าช่วงนั้นไม่มีคำขอปิดเลยจะขึ้น `—` ไม่ใช่ 0 (0 วันแปลว่า "ตัดสินทันที" ซึ่งไม่จริง)
- แถวในลิสต์และหน้า view แสดงค่าที่วัดได้ของ workflow นั้นเอง แทนที่ SLA รวมที่เคยเอามาบวกกัน

### 3. ไม่มีปุ่มสร้าง Workflow

Backend ไม่มี endpoint สร้าง/ลบมาตั้งแต่ต้น (มีแค่ index/update/preview/employee-options) — ปุ่มบนหน้าเป็นปุ่มหลอกที่ toast "เร็ว ๆ นี้" ถูกลบออก พร้อมแก้คำบรรยายหน้าให้ตรงว่าโมดูลนี้ **ปรับ**เส้นทางอนุมัติของประเภทคำขอที่มีอยู่ ไม่ได้สร้างใหม่

### Tests / Verification

`WorkflowAdminTest` — เพิ่ม 2 เทสต์: ค่าเฉลี่ยที่วัดได้ถูกต้องและ **ไม่นับคำขอที่ปิดก่อนหน้าต่าง 30 วัน** · workflow ที่ยังไม่มีคำขอวิ่งผ่านคืน `measured = null` (ไม่ใช่ 0) · payload ของเทสต์เดิมถอด `sla_days` ออกหมด
**ทั้ง suite = 854 passed / 3,324 assertions** · `tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน · migrate รันบนฐานจริงแล้ว

---

## Onboarding requests → ต่อเข้า Workflow อนุมัติจริง — Tests / Verification

`EmployeeOnboardingRequestTest` (12 tests) — 1 บริการ = 1 คำขอ · เจ้าของ/ผู้ยื่นถูกบันทึกแยกกัน · **สายอนุมัติเป็นของพนักงานใหม่ไม่ใช่ของ HR** · **คำขอรอหัวหน้าที่ยังไม่มีบัญชี (pending) ไม่ผ่านเอง** · **หัวหน้ากดอนุมัติได้ทันทีที่บัญชีถูกสร้าง** · workflow ปิดแล้วพนักงานยังถูกสร้าง + รายงานใบที่ยื่นไม่ได้ · หมายเหตุกลายเป็น reason · คนยื่นแทนเปิด/ยกเลิก/เห็นใน `scope=mine` ได้ · API บอก origin + ชื่อคนยื่น · คนยื่นได้รับ receipt ที่เจ้าของรับไม่ได้
`RequestResolutionTest` — เทสต์เดิมที่พินกฎ "ไม่มีบัญชี = ข้าม" ถูกเขียนใหม่เป็นกฎใหม่ + เพิ่มเทสต์ว่าคนลาออกยังถูกข้าม
**ทั้ง suite = 852 passed / 3,316 assertions** · `tsc --noEmit` = 0 · eslint = 0 · pint ผ่าน · `npm run build` ผ่าน · `php artisan migrate` รันบนฐานจริงแล้ว · ยิง resolver กับข้อมูลจริง (read-only) ยืนยันว่าคำขอใบใหม่รอหัวหน้าคนจริงแทนที่จะ skip · มีเทสต์คุมว่า `awaiting_account` เป็น true แล้วกลายเป็น false เองเมื่อบัญชีถูกสร้าง (ไม่มีอะไรไปเขียนแถวที่แช่ไว้)

---

## Settings → Request data: "การขอคอมพิวเตอร์" แก้ตัวเลือกได้แล้ว (2026-08-07)

ฟิลด์ "อุปกรณ์ที่ต้องการ" ของคำขอคอมพิวเตอร์เคยเป็น slug ตายตัวใน `RequestSchemas` (`device` = laptop / desktop) — จะเพิ่ม All-in-One หรือ Workstation ต้องแก้โค้ดแล้ว deploy ตอนนี้เปลี่ยนเป็น **managed list** เหมือน Hardware / Mobile / Telephone:

- คีย์เปลี่ยนเป็น `device_id` + `'managed' => true` → ค่าที่เก็บคือ **id ของ `request_options`** (ลงคอลัมน์ `request_option_id` ที่มี FK จริง) ไม่ใช่สตริง
- `RequestOptionSeeder` หยิบตัวเลือกตั้งต้น (Laptop / Desktop PC) ให้เอง · migration `seed_computer_device_options` เติม 2 แถวนี้ให้ฐานที่ seed ไปแล้ว (idempotent — เช็คก่อนแทรก)
- **ไม่ต้องแก้ frontend เลย** — หน้า Settings อ่าน `RequestSchemas::managedLists()` แล้วสร้างแท็บย่อยเองตามข้อมูล (จาก 3 เป็น 4 รายการ) · validation ยังคุมว่า id ต้องอยู่ในลิสต์ของฟิลด์นั้นและยัง `active`
- คำขอเก่ายังอ่านได้ปกติ: `fields._display` เป็น snapshot ตอนยื่น หน้ารายละเอียดอ่านจากตรงนั้น ไม่ได้ resolve id ใหม่ — migration จึงไม่ไปเขียนทับข้อมูลเดิม

### Tests / Verification

`RequestOptionTest` — เทสต์ที่พินว่ามี 3 ลิสต์กลายเป็น 4 (+ นับ options 8→10) · เพิ่มเทสต์ "เพิ่มตัวเลือกคอมพิวเตอร์แล้วฟอร์มเสนอให้เลือกจริง" · เทสต์ "ลิสต์ที่ไม่ได้ประกาศเขียนไม่ได้" เปลี่ยนตัวอย่างไปใช้ `email.address` (ช่องพิมพ์ ไม่มีลิสต์) + `computer.ram_size` (field key ที่ไม่มีใครประกาศ)
เทสต์ที่ยิงคำขอคอมพิวเตอร์ 4 ไฟล์ (`RequestWorkflowTest`, `RequestAutoTicketTest`, `RequestNotificationTest`, `EmployeeOnboardingRequestTest`) seed `RequestOptionSeeder` แล้วส่ง `device_id` เป็น id จริง
**ทั้ง suite = 873 passed / 3,391 assertions** · pint ผ่าน · `php artisan migrate` รันบนฐานจริงแล้ว (ได้ `computer.device_id` = Laptop / Desktop PC) · ไม่มีไฟล์ frontend เปลี่ยน จึงไม่ต้อง build ใหม่

---

## Toast: คิวเดียวทั้งแอป · error รอให้กดปิด · ประกาศให้ screen reader (2026-08-07)

เดิมมี toaster **2 ตัวแยกกัน** วาง `right-5 bottom-5` เหมือนกันแต่คนละ portal (`transient-toaster` z-120 กับ `notification-toaster` z-60) เด้งพร้อมกันจะทับกันสนิท และรวมกันได้ถึง 6 ใบ ปรับใหม่ตามมาตรฐาน (Material 3 snackbar · W3C ARIA APG alert/status · WCAG 2.2.1) โดย**ไม่เพิ่ม library ใด ๆ**

### 1. region เดียว คิวเดียว
`stores/toast.ts` เป็นคิวเดียวของทั้งแอป — ทั้งข้อความจากการกดบันทึก/ลบ, คำเตือน 429 จาก axios interceptor และ**การแจ้งเตือนจากเซิร์ฟเวอร์**
- `notification-toaster.tsx` (component) → `use-notification-toasts.ts` (**hook ไม่ render อะไร**) แปลงแจ้งเตือนใหม่เป็น toast แล้ว push เข้าคิวเดียวกัน · เรียกใน `AppShell` เพราะกดแล้วต้อง navigate
- `transient-toaster.tsx` → `toaster.tsx` = การ์ดเดียวใช้ทุกกรณี (badge สี + title + ข้อความ + ปุ่มปิด + แถบเวลา) · จำกัดรวม **3 ใบ** ที่เหลือรอคิว
- `visibleToasts()` เป็น pure function: **error ที่ยังไม่ถูกอ่านจะไม่ถูกดันตกจอ** ด้วย toast ใหม่ · ช่องที่เหลือให้ใบล่าสุด
- toast ที่กดได้ (แจ้งเตือน) ยังทำงานเหมือนเดิม — mark read + ไปหน้าเป้าหมาย + ปิดใบพี่น้องที่ไปที่เดียวกัน (`group` + `dismissGroup`)

### 2. อายุตามความสำคัญ (เดิม 6 วิเท่ากันหมด)
`TOAST_DURATION`: success 4 วิ · info 5 วิ · warning 6 วิ · **error = ไม่หายเอง** รอให้กดปิด (สิ่งที่ต้องแก้ต้องอ่านได้จบ) · แจ้งเตือนจากเซิร์ฟเวอร์ = 6 วิ (ไม่ค้าง เพราะกระดิ่งเก็บไว้อยู่แล้ว)
การ์ดที่ยืม tone แดงเพื่อสื่อ "ลบแล้ว" (Access → member/resource removed) ส่ง `duration: 4000` เอง เพราะมันคือความสำเร็จ ไม่ใช่ความล้มเหลว
แถบเวลาซิงก์กับตัวจับเวลาจริงผ่าน class `[animation-duration:…]` (ไม่ใช่ 6 วิตายตัวใน CSS อีก)

### 3. Accessibility
`role="alert"` สำหรับ error · `role="status" aria-live="polite"` สำหรับที่เหลือ · `aria-atomic` · region คงอยู่ใน DOM แม้ไม่มี toast (live region ที่เพิ่งโผล่มาพร้อมข้อความ screen reader มักไม่ประกาศ) · การ์ดที่กดได้ **โฟกัสด้วยคีย์บอร์ดและกด Enter/Space ได้** + focus ring · ปุ่มปิดใช้ `notif_dismiss` ผ่าน `useT()` (เดิม hardcode "Dismiss")

### 4. เก็บกวาด
หยุดนับเวลาเมื่อ **focus** ไม่ใช่แค่ hover (`:focus-within` + `onFocus/onBlur`) · ข้อความแจ้งเตือนแสดง **2 บรรทัด** แล้วค่อยตัด (เดิม `truncate` บรรทัดเดียว ตัดกลางประโยค) · ลบ `.toast-ring-fg` / `@keyframes toast-ring-deplete` ที่ไม่มีใครใช้แล้ว (วงแหวนนับถอยหลังของ toaster ตัวเก่า)
หมายเหตุ: `prefers-reduced-motion` มีอยู่แล้วทั้งคู่ก่อนแก้ — ครอบ enter/leave/bar อยู่แล้ว ไม่ใช่ช่องว่างอย่างที่ประเมินไว้ตอนแรก

### Tests / Verification

ไม่มี test runner ฝั่ง frontend ในโปรเจกต์ (มีแต่ PHPUnit) จึงพิสูจน์กฎของคิวด้วยสคริปต์ assert รันบน Node type-stripping (`node toast-queue.test.ts` ใน scratchpad — ไม่เพิ่ม dependency): อายุต่อ tone · override ต่อใบ · burst guard ยุบเฉพาะ **key เดียวกัน** (แจ้งเตือน 2 ใบข้อความเหมือนกันไม่ถูกกลืน) · `dismissGroup` เก็บใบที่กดและกลุ่มอื่นไว้ · `visibleToasts` 4 เคส (ใบล่าสุดได้ที่ · error ไม่ถูกดันตก · error มากกว่าช่อง · คิวว่าง) — **ผ่านทั้งหมด** และพิสูจน์ว่าจับของจริงได้โดยแก้ `error: null` → `6000` ชั่วคราวแล้วเห็นเทสต์ล้ม
`tsc --noEmit` = 0 · eslint ไฟล์ที่แก้ = 0 · prettier ผ่าน · `npm run build` ผ่าน + ยืนยันว่า CSS ที่ build ออกมามี `animation-duration` ครบทั้ง 4 ค่า (4s/5s/6s/8s)
**ยังไม่ได้ทดสอบบนเบราว์เซอร์จริง** — พฤติกรรมบนหน้าจอ (การซ้อน 3 ใบ, การกดแจ้งเตือนแล้วเด้งไปหน้าเป้าหมาย) ต้องกดดูเองอีกครั้ง

### แก้ต่อ: `tone` เป็นพารามิเตอร์บังคับ (ข่าวดีเคยเด้งเป็นการ์ดแดง)

`push()` เคยตั้ง default `tone = 'error'` → จุดที่เรียกโดยไม่ระบุ tone จะได้การ์ดแดงทั้งที่เป็นข่าวดี ที่เห็นชัดคือ **"ยื่นคำขอ Onboarding แล้ว 3 รายการ"** หลังเพิ่มพนักงาน (และยิ่งชัดเมื่อ error เลิกหายเอง → ค้างจนกดปิด)
- `tone` เป็น **required** แล้ว TypeScript จับให้ตอน compile ไม่ต้องพึ่งการสังเกตบนหน้าจอ
- 4 จุดที่ปล่อยให้ตกไปที่ default: `emp_onboarding_filed` → **success** · `emp_onboarding_failed` → error (ต้องไปยื่นเองจึงค้างไว้ให้อ่าน) · 422 field error ของ add/edit employee → error (เจตนาเดิม แต่ระบุให้ชัด)
- `tsc --noEmit` ผ่าน = ยืนยันว่าไม่มีจุดอื่นในโปรเจกต์ที่ละเว้น tone อีก

---

## Request: ไฮไลต์ม่วง = "คำขอพนักงานใหม่ที่รอคุณตัดสิน" (2026-08-07)

เดิมแถวม่วงติดทุกคำขอที่ `origin = onboarding` ไม่สนสถานะ — ผู้อนุมัติคนที่ 1 กดอนุมัติไปแล้ว คำขอไปรอคนที่ 2 แต่แถวในรายการของคนที่ 1 ยังม่วงอยู่ พอมีคำขอ onboarding สะสมหลายใบ ไฮไลต์ก็เลิกชี้อะไร

- เพิ่ม `onboardingRowClass(request)` ใน `shared/lib/request-meta.ts` — คืนสีม่วงเมื่อ `origin = onboarding` **และ** `can_approve` (ขั้นปัจจุบันเป็นของผู้ที่กำลังดู) ใช้ทั้งตารางและการ์ดคิวบนแดชบอร์ด แทนที่จะเขียนเงื่อนไขซ้ำ 2 ที่
- `can_approve` มาจาก `ServiceRequestResource` อยู่แล้ว = ตำแหน่งจริงในสายอนุมัติ ไม่ใช่การเดาจากสถานะ → **ไม่ต้องแก้ backend เลย**
- **ป้ายม่วง "พนักงานใหม่" ยังอยู่ทุกแถวเสมอ** (ผูกกับ origin) สีที่หายไปคือพื้นหลัง ไม่ใช่ข้อมูล
- ผลข้างเคียงที่ตั้งใจ: พอถึงคิวคนที่ 2 แถวจะม่วงในรายการของ**คนที่ 2** แทน · HR ที่ยื่นให้ (ไม่ได้เป็นผู้อนุมัติ) เห็นเฉพาะป้าย

### Tests / Verification

สคริปต์ assert ใน scratchpad (`node request-row-tint.test.ts`): รอฉัน → ม่วง · อนุมัติแล้วรอคนถัดไป → ไม่ม่วง · คำขอของตัวเอง → ไม่ม่วงแม้รอฉัน · ป้ายยังติดอยู่หลังสีหาย — ผ่านทั้งหมด และพิสูจน์ว่าจับของจริงได้โดยถอด `&& can_approve` ออกชั่วคราวแล้วเห็นเทสต์ล้ม
`tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · `npm run build` ผ่าน

### ขีดความคืบหน้าในตาราง: รางกว้างเท่ากันทุกแถว

`WorkflowMini` เคยให้ขีดละ 20px คงที่ → workflow 3 ขั้นยาว 66px แต่ 5 ขั้นยาว 112px แถวในคอลัมน์เดียวกันจึงยาวไม่เท่ากัน และอ่านผิดเป็น "ใบนี้คืบหน้ามากกว่า" ทั้งที่หมายถึง "flow นี้มีขั้นมากกว่า"
ตอนนี้ราง **กว้างคงที่ 96px** แล้วให้ขีดแบ่งกันเองด้วย `flex-1` (ขั้นเยอะ = ขีดบางลง ไม่ใช่รางยาวขึ้น) มี `min-w-[2px]` กันขีดหายเมื่อ flow ยาว · ตัวเลข `x/y` กว้างคงที่ + `tabular-nums` ชิดขวา ตัวเลขจึงตรงเป็นแนวลงมาทั้งคอลัมน์
เทียบความกว้างต่อขีด: 3 ขั้น = 30px · 4 ขั้น ≈ 21.8px · 5 ขั้น ≈ 16.8px — ความกว้างรวมเท่ากันหมด

---

## View Drawer: สลับ record แล้วข้อมูลไม่ปนกันอีก (2026-08-07)

**อาการ:** เปิดดูรายละเอียด record หนึ่งแล้วสลับไปดูอีก record ทันที เห็นข้อมูลของ record ก่อนหน้าแสดงใต้ชื่อ/เลขที่ของ record ใหม่ หรือเห็นแท็บย่อยขึ้นว่า "ไม่มีข้อมูล" ทั้งที่มี

**สาเหตุราก:** ทุก drawer เก็บสำเนา record ล่าสุด (`shown`) ไว้กันหน้าว่างระหว่าง Radix เล่น exit animation แต่สำเนานั้น**ไม่ได้ผูกว่าเป็นของ record ไหน** เมื่อ id เปลี่ยนขณะ dialog ยังเปิดและข้อมูลของ id ใหม่ยังไม่มา โค้ดหยิบสำเนาเก่ามาแสดง — และแท็บย่อยที่ใช้ค่า default ว่าง (`= []`) ก็แยกไม่ออกว่า "ยังไม่มา" หรือ "ไม่มีจริง"

### สำรวจครบทั้ง 6 drawer

| Drawer | แหล่งข้อมูล | ก่อนแก้ |
|---|---|---|
| request | query ตาม id **ไม่มี** loading guard | 🔴 แสดงใบก่อนหน้าทั้งใบ |
| stock item | query ตาม id + `isLoading` | 🟠 ปลอดภัยตอนสลับ แต่ถ้า query error จะ fallback ของเก่า |
| employee | prop (ถูก) + sub-query 4 ตัว | 🟠 count = 0 และ empty state หลอกชั่วขณะ |
| asset | prop + guard `full.id === a.id` (ถูกอยู่แล้ว) | 🟠 แท็บประวัติ/งานแจ้งซ่อมโชว์ "ไม่มี" ชั่วขณะ |
| ticket · contract | prop ทั้งก้อน ไม่มี per-id query | 🟢 ไม่ต้องแก้ |

### สิ่งที่แก้

- **`shared/hooks/use-record-view.ts` (ใหม่)** — `useRecordView(id, live)` คืน `{ record, switching }` : สำเนาเก่าถูกใช้ได้**เฉพาะตอนกำลังปิด** (id = null) เท่านั้น · ระหว่างเปิดอยู่ record ต้องมี `id` ตรงกับที่ดูอยู่ ไม่ตรง = คืน `null` + `switching = true` ให้ผู้เรียกวาด skeleton · เช็ค `live.id === id` กัน query ที่คืนข้อมูลของ key ก่อนหน้า (`placeholderData`) ด้วย · แยก `pickRecordView()` เป็น pure function ให้เทสต์ได้
- **request-detail-dialog** — ใช้ hook + แยกเนื้อหาเป็น `RequestDetailBody` (รับ record ที่ non-null) และ `RequestDetailLoading` (skeleton รูปทรงเดียวกับเนื้อหาจริง) วางใน `DialogContent` เดิม → dialog ไม่ปิด ไม่กระพริบ ไม่แสดงใบผิด · การตัดสินใจ (approve/reject) ที่ค้างถูกล้างเมื่อสลับใบ
- **stock-item-detail-modal** — เปลี่ยนไปใช้ hook (ปิดช่อง query error ที่เคย fallback ของเก่า) เงื่อนไข skeleton เหลือ `!item`
- **employee-view-drawer** — `emp = liveEmp && liveEmp.id === shown.id ? liveEmp : shown` (defense in depth) · count ของแท็บ Assets/Tickets/Access เป็น `undefined` ระหว่างโหลด (ไม่ใช่ 0) · `AssetsPane`/`TicketsPane` รับ `loading` → DataTable แสดง shimmer rows แทน empty state · แท็บ Access มี placeholder rows
- **asset drawer** — `AssetHistoryTab`/`AssetTicketsTab` รับ `loading={!enriched}` → ตารางแสดง loading rows แทนข้อความ "ไม่มีประวัติ/ไม่มีงานแจ้งซ่อม"

### Tests / Verification

สคริปต์ assert ใน scratchpad (`node record-view.test.ts`) — 6 เคส: record ของ id ที่เปิด → แสดง · สลับแล้วข้อมูลยังไม่มา → `null` + switching (ไม่หยิบของเก่า) · query คืนข้อมูล key ก่อนหน้า → กันไว้ · ปิด (id = null) → คืนสำเนาให้ animation · ปิดโดยไม่เคยแสดง → null · สำเนาเก่าไม่เคยชนะ record สด ของ id เดียวกัน — **ผ่านทั้งหมด** และพิสูจน์ว่าจับของจริงได้โดยเปลี่ยน `record: null` → `record: retained` ชั่วคราวแล้วเห็นเทสต์ล้ม
`tsc --noEmit` = 0 · eslint ไฟล์ที่แก้ = 0 (เหลือ 2 warnings เดิมของ stock counting/requests tab ที่ไม่ได้แตะ) · prettier ผ่าน · `npm run build` ผ่าน
**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — ต้องลองสลับ record จริงเพื่อดู skeleton/จังหวะ

---

## เส้นทางการอนุมัติ: เหตุผลที่ข้ามขั้นมีข้อความจริง ๆ + เส้นไม่ทะลุจุด (2026-08-07)

จาก `docs/debug/Screenshot 2026-08-07 164539.png` — แถบเหลืองของขั้นที่ถูกข้าม**ว่างเปล่า** มีแต่ไอคอน

**สาเหตุ:** `ApprovalSkipReason::NoMatchingPosition` ถูกเพิ่มฝั่ง PHP ตอนทำ Workflow Engine แต่ไม่ได้เพิ่มใน `ApprovalSkipReason` ของ `shared/types` และ `REQUEST_SKIP_REASON_LABEL` → `t(undefined)` คืนค่าว่าง แถบจึงไม่มีข้อความ (ข้อมูลจริงมี 7 แถวที่ใช้เหตุผลนี้ รวมใบในภาพ)

- เพิ่ม `no_matching_position` ทั้งใน TS union + ตาราง label + ข้อความ EN/TH
- **ย้ายคำว่า "ข้ามขั้นนี้" เข้าไปในแถบ** — บรรทัดสถานะด้านบนไม่พูดซ้ำเมื่อมีเหตุผลแล้ว (แถวเก่าที่ยังไม่มี `skip_reason` ยังแสดงคำเดิมตามปกติ) และปรับข้อความทั้ง 4 เหตุผลให้พูดครบในตัวเอง: `ข้ามขั้นนี้ เนื่องจาก…` / `Step skipped - …`
  - ใหม่: `ข้ามขั้นนี้ เนื่องจากตำแหน่งเท่ากัน หรือน้อยกว่า` (ใช้ซ้ำได้ทุกขั้นที่ไม่มีใครในสายถือตำแหน่งของขั้นนั้น)
- **เส้น timeline ไม่ทะลุจุดอีก** — จุดของขั้น "กำลังรอ" กับ "ข้าม" เป็นสีโปร่งแสง (`bg-brand/10`, `bg-amber-500/10`) เส้นจึงมองเห็นผ่านกลางวง แก้ด้วยการห่อจุดด้วยแผ่นทึบ `bg-background` (แนวเดียวกับที่แก้ในตัวแก้ไข Workflow)
- **เส้นไม่ห้อยเลยจุดสุดท้ายแล้ว** — เดิมวาดเป็น pseudo-element เดียวยาวตลอดกล่อง (`before:top-2 before:bottom-2`) ความยาวจึงมาจากขอบกล่อง ไม่ใช่ตำแหน่งจุด → มีหางห้อยใต้จุดสุดท้าย ~26px (เท่าความสูงข้อความ 2 บรรทัดของขั้นนั้น) และโผล่เหนือจุดแรก เปลี่ยนเป็น **1 เส้นต่อ 1 ช่วง** วาดจากใต้จุดไปเกือบถึงจุดถัดไป และไม่วาดหลังขั้นสุดท้าย
- **ขั้นที่กำลังรอมีวงกระเพื่อม** (`.trail-live` ใน `app.css`) — วงสีแบรนด์ผุดจากหลังจุดแล้วจางหายทุก 2 วินาที ชี้ว่าคำขออยู่ที่ขั้นไหนในตอนนี้ (ring นิ่งอย่างเดียวไม่พอ เพราะขั้น "ข้าม" ก็มีจุดสีอ่อนเหมือนกัน) เลือกเป็นการกระเพื่อมช้า ๆ ไม่ใช่กระพริบติด-ดับ เพราะแถบนี้มีไว้อ่าน · `prefers-reduced-motion` = ค้างวงไว้นิ่ง ๆ (ไม่ลบทิ้ง เพราะเป็นตัวบอกขั้นปัจจุบัน)

### Tests / Verification

`tests/Unit/SkipReasonWordingTest.php` (ใหม่) — เดินทุก case ของ `ApprovalSkipReason` แล้วยืนยันว่ามีอยู่ใน TS union · ในตาราง label · มีข้อความทั้ง EN และ TH (16 assertions) เป็น guard ข้ามภาษาที่จับบั๊กแบบนี้ตั้งแต่ตอนรันเทสต์ ไม่ใช่ตอนเห็นภาพหน้าจอ · พิสูจน์แล้วว่าจับจริงโดยลบบรรทัด label ออกชั่วคราวแล้วเทสต์ล้ม
**ทั้ง suite = 874 passed / 3,407 assertions** · `tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน

---

## พนักงานใหม่: ขอสิทธิ์-อุปกรณ์ให้ครบ และปิดงานที่เดียวจบ (2026-08-08)

รอบนี้ไล่ตั้งแต่ตอนเพิ่มพนักงาน จนถึงตอนช่างปิดเคส — พบว่าหลายจุดที่หน้าจอตรวจไว้ แต่ API ปล่อยผ่าน และหลายจุดที่หลังบ้านตั้งใจอธิบาย แต่หน้าบ้านทิ้งข้อความนั้นทิ้ง

### 1. Step 3 เก็บรายละเอียดที่คำขอต้องใช้จริง

เดิมติ๊ก "คอมพิวเตอร์" แล้วส่ง `fields => []` เปล่า ๆ IT เปิดใบขึ้นมาไม่รู้ว่าโน้ตบุ๊กหรือตั้งโต๊ะ

- **`GET /employees/onboarding-services`** (ใหม่, gate `employees.add`) อ่าน `RequestSchemas::for()` ตัวเดิม → IT เพิ่มประเภทอุปกรณ์ที่ Settings → Request data แล้วโผล่ที่ Step 3 เองโดยไม่ต้อง deploy
  - ไม่ใช้ `service-requests/options` เพราะ gate ด้วย `requests.submit` (สิทธิ์คนละโมดูลที่แอดมินถอดออกได้ แล้วฟอร์มพนักงานจะพังโดยไม่มีใครเดาถูก) — ตาม peek pattern เดิมของ asset→contract
- **UI เปลี่ยนจากการ์ด 3 ใบเรียงแถว เป็นรายการเรียงลง** เพราะ grid บังคับให้ทุกใบสูงเท่ากัน ติ๊กใบเดียวแล้วยืดทั้งแถว · ฟิลด์ห้อยอยู่ใต้บริการของตัวเองด้วยเส้นตั้ง จึงเห็นชัดว่าเป็นของใคร
- **อุดช่องโหว่ validation** — `RequestService::submitFor()` ถูกเรียกตรง ไม่เคยผ่าน `StoreServiceRequestRequest` ซึ่งเป็นที่เดียวที่มีกฎ `required` onboarding จึงยื่นคำขอที่ฟอร์ม Request เองยังปฏิเสธได้ · ตอนนี้ `StoreEmployeeRequest` ยืม `RequestSchemas::rules()` มาใช้ โดยเปลี่ยน prefix `fields.` → `services.<service>.` ทั้งใน key และในสตริงกฎ
- `sim` (ต้องการซิม/แพ็กเกจดาต้า) เปลี่ยนเป็น **required** — เว้นว่างแล้ว IT ต้องกลับไปถามอยู่ดี ซึ่งเป็นสิ่งเดียวที่ฟิลด์นี้มีไว้ป้องกัน · กระทบหน้า Request ด้วยโดยตั้งใจ เพราะถ้าจำเป็นตอน onboarding ก็จำเป็นตอนใครขอมือถือเหมือนกัน
- payload เปลี่ยนเป็น `services: { computer: { device_id: 3 } }` และ `toFormData` เขียนใหม่เป็น recursive `appendField()` — จำเป็นเพราะกรณีแนบรูป + ติ๊กบริการ ต้องส่ง `services[computer][device_id]`

### 2. เช็คสายอนุมัติก่อน แทนที่จะรู้ตอนสายเกินไป

- **`GET /employees/onboarding-precheck`** — สร้าง `new Employee([...])` แบบไม่ save แล้วส่งเข้า `blockReason()` ตัวเดิม **ไม่แตะ `WorkflowResolverService` เลยสักบรรทัด** ตรรกะที่ตอบ preview จึงเป็นโค้ดชิ้นเดียวกับที่ตัดสินตอน Save
- สายเสีย → แบนเนอร์บอกเหตุ + ชื่อคนที่ลาออก + **ปุ่ม Save ปิด** (รวมทางลัด Enter)
- **ตอบไม่ได้ ก็ยังปิด** พร้อมปุ่มลองใหม่ — "ไม่รู้" ไม่ใช่ "ผ่าน" และการ fail-open จะทำให้กฎหลุดโดยไม่มีใครรู้ · ยกเว้นเน็ตล่มทั้งตัว ซึ่ง POST ก็ยิงไม่ออกอยู่ดี

### 3. role ของพนักงานใหม่มาจาก Role Group เท่านั้น

เดิม `resolveGroupRole()` ใช้ `firstOrCreate(['key' => 'user'])` — บน install ที่ตั้ง Role Template เอง จะ **สร้าง role ชื่อ "Staff" ที่ไม่มีสิทธิ์สักข้อ** ให้เงียบ ๆ ได้บัญชีที่ล็อกอินได้แต่เปิดอะไรไม่ได้ ถือ role ที่แอดมินไม่เคยสร้าง · แถมการโหลดหน้า Settings ก็ trigger การเขียนนี้ได้ (write ใน GET)

- ตัด fallback ทิ้งทั้งหมด: `role = กลุ่มของพนักงาน ?? กลุ่มเริ่มต้น ?? ปฏิเสธ`
- สร้าง login ไม่ได้ → **422 พร้อม code `no_role_configured`** และ drawer ขึ้นแถบเตือนตั้งแต่เปิด
- `DatabaseSeeder` เขียนกำกับว่า **ไม่ seed Role Group ให้โดยตั้งใจ** — แอดมินต้องสร้างเองก่อน (บัญชี super ยกเว้น เพราะถือ role ตรงผ่านคอลัมน์ `role`)
- ตัดช่องอีเมลออกจาก Step 1 — พนักงานใหม่ยังไม่มีอีเมลบริษัท ต้องขอผ่าน Step 3 ก่อน
- `joined_at` เปลี่ยนเป็น **required ตอนเพิ่ม** (ยังปล่อยตอนแก้ไข เพราะคนที่มาจาก bulk import อาจไม่มีวันที่ และต้องแก้ไขข้อมูลได้)

### 4. ปิด Ticket แล้วคำขอปิดตาม

เดิมต้องทำ 2 ที่: ช่างปิดเคส แล้วต้องมีคนจำได้ว่าต้องมากด Fulfil อีกที

- **`RequestService::settleFromTicket()`** — ปิดสำเร็จ → `Fulfilled` · ยกเลิก → **`Cancelled` ไม่ใช่ `Rejected`** เพราะผ่านผู้อนุมัติครบทุกขั้นแล้ว นับเป็น rejected จะทำให้สถิติสายอนุมัติเพี้ยน
- เหตุผลของช่างประทับลงแถว Fulfillment → **ข้อความชุดเดียวกันทั้งสองฝั่ง** สำหรับตรวจสอบย้อนหลัง (ไม่ต้อง migrate เพราะแถวนั้นคือขั้น "IT ลงมือทำ" ที่ `fulfill()` เขียนอยู่แล้ว)
- ไม่ gate ด้วย `requests.fulfill` — ด่านที่สำคัญยิงไปแล้วคือ "เฉพาะผู้รับผิดชอบเคสเท่านั้นที่ปิดได้" ถ้ามาปฏิเสธซ้ำจะได้ ticket ปิดแต่ request ค้าง ซึ่งคือปัญหาที่กำลังแก้
- **`notDelivered()`** (ใหม่) — เดิมเรียก `cancelled()` ซึ่งคุยกับผู้อนุมัติที่ถือใบรออยู่ แต่แถว Fulfillment เป็นขั้น `it_staff` ที่ไม่มีตัวบุคคล → **ไม่มีใครได้รับแจ้งเลย** ตอนนี้ยิงหาผู้ขอ + ผู้ยื่นแทน พร้อมเทมเพลตเมล `request.not_delivered` ของตัวเอง (ใช้ `request.rejected` ไม่ได้ เพราะจะบอกผู้ขอว่าถูกผู้อนุมัติปฏิเสธ ซึ่งตรงข้ามกับความจริง)
- **เส้นทางการอนุมัติอ่านสถานะจาก ticket** — เดิมแถว Fulfillment ใช้คำศัพท์ของขั้นอนุมัติ จึงขึ้น "รออนุมัติ" บนคำขอที่อนุมัติไปแล้วหลายวัน และ "ไม่อนุมัติ" บนงานที่แค่ส่งมอบไม่ได้ · ตอนนี้: รอรับเคส / อยู่ระหว่างดำเนินการ โดย xxx / เสร็จสิ้น โดย xxx / ยกเลิก โดย xxx พร้อม tone สีเทาสำหรับ cancelled ให้ตรงกับ badge สถานะ

### 5. ลบ Role Template บอกเหตุผลได้

`confirm-dialog` ใช้ `catch {}` แบบไม่รับ error object → ทุกการปฏิเสธจากหลังบ้านขึ้น "กรุณาลองใหม่อีกครั้ง" ทั้งที่ `RoleController::destroy` เขียนเหตุผลไว้ 3 แบบ

- เช็คฝั่ง client ก่อนเปิด dialog ตามแบบแผนของแผนก/ตำแหน่งที่มีอยู่แล้ว → บอกเหตุผลจริงพร้อมตัวเลข ("ยังมี Role Group ใช้ Template นี้อยู่ 1 กลุ่ม")
- เพิ่ม `groups` count ใน `/api/permissions` (query เดียว แบบเดียวกับ `memberCounts`)
- ลบ `PUT /api/permissions/default-role` — validate แล้วเขียน AuditLog ว่าตั้งค่าแล้ว **แต่ไม่ persist อะไรเลย** และไม่มีใครเรียก

### Tests / Verification

**ทั้ง suite = 913 passed / 3,554 assertions** (เดิม 892) · `tsc --noEmit` = 0 · eslint = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน

เทสต์ที่เพิ่มเน้นจับ **ความเงียบ** เป็นหลัก เพราะบั๊กรอบนี้ส่วนใหญ่คือระบบทำงานผ่านแต่ไม่มีใครรู้:
- ปิด/ยกเลิก ticket แล้ว **ผู้ขอต้องได้ bell จริง** — รอบแรกผมเช็คแค่สถานะกับ note บั๊ก "ยกเลิกแล้วเงียบสนิท" เลยรอดผ่าน 911 tests มาได้
- ยืม option ของ mobile มาตอบ computer → 422 (ทั้งคู่ชื่อ `device_id`)
- โหลด settings ต้อง **ไม่เพิ่มจำนวน Role** (จับ write ใน GET)
- มี role `user` อยู่ แต่ไม่มีกลุ่มเริ่มต้น → ต้องคืน null (จับการแอบ fallback)
- precheck กับ Save ต้องตอบตรงกันบนสายที่พัง

**5 tests เดิมพัง แล้วแก้ fixture ไม่ใช่แก้ให้ผ่าน** — ทั้งหมดสร้างบัญชี/พนักงานโดยไม่เคยมี Role Group หรือไม่ส่ง `joined_at` **การที่มันพังคือหลักฐานว่าของเดิมปลอมข้อมูลและ API ปล่อยผ่านจริง**

**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — Step 3 แบบรายการ, แบนเนอร์บล็อก, และเส้นทางการอนุมัติที่อ่านจาก ticket ควรลองด้วยตาอีกรอบ

---

## ปิดคำขอได้ทางเดียว: ปิดที่เคส (2026-08-11)

รอบที่แล้ว (`f37b734`) ทำให้ "ปิด ticket แล้วคำขอปิดตาม" แต่ปุ่ม **Fulfil เดิมยังอยู่และยังกดได้** ทั้งที่เคสยังไม่ปิด → คนถือ `requests.fulfill` กดปิดคำขอไปก่อนได้ ได้สภาพ request `Fulfilled` แต่ ticket ยัง `in_progress` ซึ่งคือความไม่ตรงกันแบบเดียวกับที่รอบก่อนตั้งใจกำจัด แค่กลับด้าน

### บล็อกที่ไหน

- **`RequestService::fulfill()`** — `abort_if` เมื่อเคสที่ผูกอยู่ยัง `Open`/`InProgress` (422 พร้อมเลขเคส) วางในทรานแซกชันหลัง `assertStatus()` ใต้ row lock เดิม
- **`ServiceRequestResource::can_fulfill`** — เงื่อนไขเดียวกัน ปุ่มจึงหายก่อนถูกกด · อ่านจาก relation ที่โหลดแล้วเท่านั้น (resource ไม่ query) และถือว่า "มีเคสค้าง" เมื่อ relation ไม่ได้โหลด เพราะเดาผิดทางนี้แค่ทำให้ต้องไปกดที่เคส ส่วนอีกทางคือปุ่มที่กดแล้วเด้ง 422

**เงื่อนไขอ่านจากสถานะเคส ไม่ใช่ "มี ticket"** — คำขอที่ปิดเคสไปก่อนมี `settleFromTicket` ยังค้างเป็น `Approved` + ticket `Completed` อยู่จริงในฐานข้อมูล ถ้าบล็อกด้วย "มี ticket" แถวพวกนี้จะปิดไม่ได้ตลอดกาล

### ไม่มีทางตัน เพราะ `forward` มีอยู่แล้ว

บล็อกแบบนี้ปลอดภัยเพราะเคสที่ค้างส่งต่อได้อยู่แล้ว — `POST tickets/{ticket}/forward` (gate `tickets.forward`) ยอมให้ทั้ง assignee เองและคนถือ `tickets.assign` ย้ายเคส `InProgress` ไปให้ช่างคนอื่น ช่างลาออก/ติดงานก็ยังมีคนปิดเคสได้ **จึงไม่ต้องแตะโมดูล Ticket เลย**

### `requests.fulfill` ยังเหลือใช้ 3 กรณี

ทั้งสามคือ "คำขอที่ไม่มีเคสให้ปิด" — ปุ่มนี้กลายเป็นทางสำรอง ไม่ใช่ทางหลัก

1. workflow ที่ `auto_ticket = false` (ค่า default มีตัวเดียว: General Request · แต่ IT ปิดของสายไหนก็ได้เองที่หน้า Workflow)
2. `auto_ticket = true` แต่เปิดเคสไม่ได้ — `finalize()` เขียน AuditLog `'Auto-ticket skipped'` เมื่อประวัติพนักงานหายกลางทาง แล้วอนุมัติผ่านต่อโดยไม่เปิดเคส
3. แถวเก่าก่อน `f37b734` ตามที่ว่าข้างบน

### หน้าจอ

ปุ่มหายเฉย ๆ คนถือสิทธิ์จะอ่านเป็นบั๊ก เพราะคำขอใบอื่นก็ยังเห็นปุ่ม → ฟุตเตอร์ขึ้นบรรทัดจาง **"ปิดเคส TK-xxxx แล้วคำขอนี้จะปิดตามเอง"** (คีย์ `req_fulfill_awaits_case`) โดยดูจาก `useAuth().can()` ไม่ใช่ `can_fulfill` ซึ่งตอนนี้ false ด้วยเหตุนี้เอง จึงแยก "IT ที่ต้องรอ" กับ "คนที่ไม่ใช่ IT" ไม่ได้

**ไม่เติมสถานะ/ผู้รับผิดชอบในการ์ด Linked ticket** — `request-trail.tsx` รายงานอยู่แล้วในไดอะล็อกเดียวกัน ("รอรับเคส" / "อยู่ระหว่างดำเนินการ โดย xxx") และโค้ดเขียนกำกับไว้ว่าการ์ดถือแต่เลขเคสเพื่อไม่ให้พูดซ้ำ

**KPI `to_fulfill` กับแท็บ queue ปล่อยไว้ตามเดิม** — นับ `Approved` ทั้งหมดรวมใบที่รอเคส เพราะนั่นคือภาระที่ IT ถืออยู่จริง และ trail บอกอยู่แล้วว่าเคสอยู่กับใคร

### Tests / Verification

**ทั้ง suite = 917 passed / 3,574 assertions** (เดิม 913) · `tsc --noEmit` = 0 · prettier ผ่าน · pint ผ่าน · `npm run build` ผ่าน · eslint เหลือ 2 warning เดิมของโมดูล stock (ไม่ใช่ไฟล์ที่แก้รอบนี้)

4 tests ใหม่ใน `RequestAutoTicketTest` — เคย **ถอด `abort_if` ออกแล้วรันซ้ำ ยืนยันว่าสองตัวแรกพังจริง** ไม่ใช่เทสต์ที่ผ่านอยู่แล้ว:
- เคส `in_progress` → 422 · สถานะยังเป็น `Approved` · และ `can_fulfill` ใน payload = false (ปุ่มหายจริง ไม่ใช่ปุ่มที่รอเด้ง)
- เคส `Open` ยังไม่มีคนรับ → 422
- ticket `Completed` แต่ request ยัง `Approved` (แถวเก่า) → ยัง fulfil ได้ **ตัวนี้กันไม่ให้แก้บั๊กแล้วไปสร้างของค้างถาวร**
- workflow ที่ไม่เปิดเคส → fulfil ได้ตามปกติ (กรณีที่ 1 ข้างบน)

**2 tests เดิมพัง แล้วแก้ fixture** — `RequestWorkflowTest::fulfill_requires_permission_and_approved_status` และ `RequestNotificationTest::final_approval_notifies_requester_and_the_fulfill_queue` ทั้งคู่ทดสอบเรื่องอื่น (ด่านสิทธิ์ / bell) แต่ยืม workflow ที่เปิดเคสอัตโนมัติมาใช้ → ปิด `auto_ticket` ใน fixture ให้ตรงกับกรณีที่ปุ่มนั้นมีไว้ใช้จริง

**แก้ flaky ที่มีอยู่ก่อน** — `requestBells()` ถูกใช้ผ่าน `end($bells)` แต่ bell ของ "อนุมัติครบ" กับ "ปิดงาน" เกิดในวินาทีเดียวกัน และ `notifications()` เรียงด้วย `created_at` อย่างเดียว ลำดับของสองใบนี้จึงไม่แน่นอน — เจอตอนรันทั้ง suite (ได้ `approved_final` แทน `fulfilled`) เปลี่ยนเป็น `assertContains` ซึ่งตรงกับสิ่งที่เทสต์ต้องการจริง คือ "ผู้ขอได้รับแจ้ง"

**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — บรรทัดในฟุตเตอร์ควรลองด้วยตาอีกรอบ

---

## ลิงก์ที่ตายแล้ว, ค่าสองภาษา, และบัญชีของคนที่ลาออก (2026-08-12)

### 1. `?view=<id>` ที่ไม่มีของ — พังทั้ง 7 โมดูล

`/requests?view=99999` ขึ้นไดอะล็อก skeleton ค้างถาวร · ต้นเหตุคือ `pickRecordView()` (`use-record-view.ts:33`) **ไม่รับ error เข้าไปเลย** มันคืน `switching: true` ทุกครั้งที่ record ไม่มี จึงแยก "ยังไม่มา" กับ "ไม่มีวันมา" ไม่ได้ และไม่มีทางอื่นให้ 404 โผล่ (interceptor ใน `http.ts` จัดการแค่ 401/419)

ทางเข้าที่สองคือ `Number(searchParams.get('view'))` — `?view=abc` เป็น `NaN` ซึ่งผ่านการเช็ค `!= null` แล้วยิง `/api/<resource>/NaN`

พฤติกรรมจริงก่อนแก้ ไม่ได้เหมือนกันทุกหน้า:

| หน้า | อาการ |
|---|---|
| `requests` · `stock` | ไดอะล็อกเปล่าค้างถาวร (skeleton ที่ไม่มีวันจบ) |
| `assets` · `tickets` · `employees` · `contracts` | เงียบ ไม่เปิดอะไรเลย (`if (!record) return null` ก่อนถึง `<Dialog>`) |
| `access` | เงียบ และ **ไม่ยิง API เลย** เพราะหา row จากชุดที่โหลดมาในแท็บปัจจุบัน |

แก้:
- `toRecordId()` ใน `shared/lib/utils.ts` — รับเฉพาะจำนวนเต็มบวก ลิงก์ผิดรูปจึงไม่เปิดอะไรและไม่ยิง API · ใช้ทั้ง 7 หน้า
- `RecordMissing` / `RecordMissingDialog` (`shared/components/record-missing.tsx`) — แผงเดียวกันทุกโมดูล ขนาดมาจากค่าเดียว `recordMissingContentClass` (440px) เพราะรอบแรกผมเขียนขนาดซ้ำในสองไฟล์แล้วมันหลุดกันจริง (requests 980 / ที่เหลือ 440)
- **ไม่แตะไส้ในไดอะล็อกทั้ง 4 ตัวที่เงียบ** — mount `<RecordMissingDialog>` ไว้ข้าง ๆ แล้วเปิดด้วย `isError` ของ query เดิม จึงไม่เสี่ยงกับ logic retained-copy/exit-animation ของแต่ละตัว
- ข้อความเป็นคำกลางคู่เดียวใน `common.ts` (`record_missing_title/hint`) — "ข้อมูล" ครอบได้ทั้งคำขอ/ทรัพย์สิน/สัญญา/สินค้า จึงไม่ต้องมีคีย์ต่อโมดูล
- `retry` ระดับแอป (`query-client.ts`) ไม่ลองซ้ำเมื่อเจอ 404 — ถามซ้ำก็ได้คำตอบเดิม เสียแต่เวลาที่ skeleton ค้าง (**เปลี่ยนพฤติกรรมทั้งแอป** ไม่ใช่โมดูลเดียว)

**`access` ยังเงียบอยู่** และแก้แบบเดียวกันไม่ได้ เพราะไม่เคยถาม API จึงไม่มี error ให้จับ — ต้องเลือกก่อนว่าจะยิง endpoint รายตัวไหม ยังไม่ตัดสิน

### 2. `_display` เก็บค่าไทยคู่กับอังกฤษ

ตารางรายละเอียดคำขอขึ้น `Smartphone` / `Yes` ใต้ label ไทย และสลับภาษาก็ไม่เปลี่ยน เพราะ `buildDisplayRows()` snapshot ค่าจาก `label_en` เท่านั้น — label เก็บสองภาษา แต่**ค่า**เก็บภาษาเดียว อ่านเหมือนบั๊กมากกว่าหลักการ

`displayValue()` คืนคู่ `[value, value_th]`: managed option ใช้ `label_th` ที่ IT กรอกเองที่ Settings, select ใน schema ใช้ `label_th`, ส่วน text/source เป็น `null` (มีภาษาเดียวจริง) · `value` **ยังเป็นอังกฤษ** เพราะ `fieldLines()` เอาไปประกอบ description ของ auto-ticket ซึ่งเป็นของ IT

**แถวเก่ายังเป็นอังกฤษ** (7 แถวในฐานข้อมูลจริงหาคำไทยย้อนหลังได้) — ยังไม่ backfill เพราะเป็นการเขียนทับ snapshot ของใบที่ตัดสินไปแล้ว

### 3. รูปแบบ description ของเคสที่เปิดอัตโนมัติ

```
Auto-opened
-----
Service request RQ-2026-0001 (Approved).
Type: Computer
Requester: ทดสอบ Supervisor (Information Technology)
Device type: Desktop PC
Reason:
...
```

และ **บั๊กที่ทำให้ไม่มีใครเห็นโครงนี้เลย**: `ticket-detail-drawer.tsx:316` เรนเดอร์ description ด้วย `<p>` เปล่า ๆ ไม่มี `whitespace-pre-wrap` → `\n` ที่มีอยู่ครบใน DB ยุบรวมเป็นย่อหน้าเดียวมาตลอด

`Priority:` กับข้อความ `Details to be confirmed with their manager.` ที่ยังเห็นในเคสเก่า **ไม่ได้มาจากเทมเพลตปัจจุบัน** — ถูกถอดไปตั้งแต่ commit ที่เลิกใช้ priority และตอนแก้คำ reason ของ onboarding; เคสที่สร้าง 2026-08-07 แช่ข้อความเดิมไว้ เทสต์ใหม่ผูกทั้งบล็อกด้วย `assertSame` ต่อบรรทัด + `assertStringNotContainsString('Priority:')`

### 4. placeholder ที่ hardcode

สำรวจได้ 47 จุดในไฟล์ .tsx แยกเป็นของที่พังจริง 25 จุด (ที่เหลือเป็นรูปแบบ/ตัวอย่างเชิงเทคนิคอย่าง `0.00`, `SN-XXXXXXXX`, `smtp.example.com` ที่ไม่มีภาษา) แก้ไปแล้ว:

- **`placeholder="—"` 7 จุด** — em dash เป็นสัญลักษณ์ "ไม่มีค่า" ของแอปนี้ เอามาเป็น placeholder ของฟิลด์ required จึงบอกความหมายกลับด้าน · และมันไปกดทับ default ที่ถูกอยู่แล้ว (`SearchableSelect` fallback ไป `select_placeholder` เอง) → **ลบ prop ทิ้ง** ไม่ต้องเพิ่มคีย์
- **2 คอมโพเนนต์ใน `shared/`** ที่ร้ายแรงกว่าเพราะใช้ข้ามโมดูล และไม่เคยเรียก `useT()` เลย: `search-select.tsx` (อังกฤษตายตัว 2 จุด) · `icon-picker.tsx` (ไทยตายตัว 2 จุด — ผู้ใช้ EN เห็นภาษาไทย) · default ของ `IconPicker` ย้ายจาก parameter มาไว้จุดเรนเดอร์ เพราะ hook เรียกใน parameter ไม่ได้
- 5 ช่องที่หน้า Settings เปลี่ยนจากตัวอย่างอังกฤษเป็นคำสั่งกรอก (`set_*_ph`)

ยังเหลือ ~14 จุดเป็นตัวอย่างอังกฤษในฟอร์ม (ตำแหน่ง, role, industry) — ไว้ทำตอนแตะฟอร์มนั้น ๆ

### 5. คนลาออกแล้วยังเข้าระบบได้

`EmployeeService::resign()` เขียนแค่ `employees.status`, `resign_reason`, `last_day` — **ไม่แตะตาราง `users`** และตาราง `users` ไม่มีคอลัมน์สถานะให้แตะด้วย · `LoginRequest::authenticate()` ทำแค่ `Auth::attempt` · middleware ทั้ง 3 ตัวไม่มีใครดูสถานะ → รหัสผ่านของคนที่ออกไปแล้วยังใช้ได้ พร้อม role และสิทธิ์ทุกข้อ · เจอเพิ่มตอนเขียนเทสต์: **session ที่เปิดค้างอยู่ก่อนลาออกก็ใช้ต่อได้เรื่อย ๆ**

กติกาเดียวอยู่ที่ `Employee::hasLeft()` — `Resigned` **และ** พ้น `last_day` แล้ว (ไม่มี `last_day` = ไม่มีช่วงบอกกล่าว ปิดทันที) วันทำงานวันสุดท้ายยังเข้าได้ ปิดวันถัดไป

- **ประตูหน้า** `LoginRequest::ensureEmployeeHasNotResigned()` → `Auth::logout()` + **403 `account_closed`** ไม่ใช่ 422 เพราะ 422 แปลว่า "ชื่อผู้ใช้หรือรหัสผ่านผิด" ซึ่งจะส่งคนที่บัญชีถูกปิดไปนั่งหาว่าพิมพ์ผิดตรงไหน · หน้า login เพิ่มกิ่ง 403 + คีย์ `login_err_closed`
- **ทุก request** middleware `BlockResignedEmployees` — invalidate session + 401 ให้ interceptor พาไปหน้า login การลาออกจึงมีผลทันทีไม่ต้องรอ session หมดอายุ · route `logout` ยกเว้นไว้ ให้เคลียร์คุกกี้ตัวเองได้
- บัญชีที่ไม่มี employee (เช่น `super`) ไม่ถูกแตะทั้งสองชั้น — ไม่มีประวัติในไดเรกทอรีก็ไม่มีอะไรให้ลาออก

**สายอนุมัติใช้เกณฑ์ต่างกันโดยตั้งใจ** — `WorkflowResolverService::canHoldAStep()` ข้ามคนที่ `status = Resigned` ตั้งแต่วินาทีที่บันทึก เพราะมีใบลาออกในมือแล้วต้องหาคนมาแทนทันที ไม่ใช่ส่งคำขอไปรอคนที่กำลังจะออก · คอมเมนต์ทั้งสองฝั่งชี้กันไป-กลับพร้อมคำกำกับว่าห้ามแก้ให้ตรงกัน

### Tests / Verification

**ทั้ง suite = 935 passed / 3,609 assertions** (เดิม 913) · `tsc --noEmit` = 0 · pint ผ่าน · prettier ผ่าน · `npm run build` ผ่าน · eslint เหลือ 2 warning เดิมของ `stock/pages/tabs/*` ที่ไม่ได้แตะ

ไฟล์เทสต์ใหม่ 2 ไฟล์:
- `RecordNotFoundContractTest` — DataProvider ครอบ **6 detail endpoint** ว่าต้องตอบ 404 กับ id ที่ไม่มี เพราะแผง "ไม่พบข้อมูล" ทั้งหมดพึ่งสถานะนี้เพียงอย่างเดียว ถ้าวันหนึ่งตัวใดตอบ 200 ตัวเปล่า ไดอะล็อกจะกลับไปค้าง skeleton
- `ResignedAccountAccessTest` — DataProvider ไล่ทุกวันบนไทม์ไลน์ลาออก (วันสุดท้าย / วันถัดไป / อาทิตย์ถัดไป / ยังไม่ถึง / ไม่มี last_day) + 2 เคสคุมที่ต้องไม่พัง (พนักงาน active, บัญชีที่ไม่มี employee) + session ที่เปิดค้าง + logout ที่ต้องยังทำงาน

**เขียนเทสต์ก่อนแก้ และยืนยันว่ามันจับของจริง** — ทั้งสองเรื่องหลัก: ถอด `abort_if` ออกแล้วรันซ้ำเพื่อดูว่าสองเทสต์แรกแดงจริง (เรื่อง gate ปิดคำขอ) และรันเทสต์ลาออกกับโค้ดเดิมก่อนแก้ ได้ 200 ทั้งสองจุดตามที่คาด

**2 tests เดิมพัง แก้ fixture ไม่ใช่แก้ให้ผ่าน** — ทั้งคู่ยืม workflow ที่เปิดเคสอัตโนมัติมาทดสอบเรื่องอื่น (ด่านสิทธิ์ / bell) จึงปิด `auto_ticket` ใน fixture ให้ตรงกับกรณีที่ปุ่มนั้นมีไว้ใช้จริง · และ **แก้ flaky ที่มีอยู่ก่อน**: `requestBells()` ถูกอ่านผ่าน `end($bells)` แต่ bell สองใบเกิดในวินาทีเดียวกันและ `notifications()` เรียงด้วย `created_at` อย่างเดียว → เปลี่ยนเป็น `assertContains`

**ยังไม่ได้ทดสอบบนเบราว์เซอร์:** หน้า login ตอนบัญชีถูกปิด (ต้องมีบัญชีที่ลาออกจริง) และ description ของเคสที่เปิดอัตโนมัติในรูปแบบใหม่ (ต้องรอคำขอที่ยื่นวันนี้ผ่านอนุมัติครบ) · ส่วนแผง "ไม่พบข้อมูล" ทั้ง 6 หน้า วัดขนาดและถ่ายภาพยืนยันแล้ว

## คิวอนุมัติที่อ่านรู้เรื่อง, ความเคลื่อนไหวที่จริง, และขีดกลางทั้งระบบ (2026-08-12)

### 1. การ์ด "รอการตัดสินจากคุณ" พูดเรื่องที่ต้องตัดสิน

การ์ดเดิมบอก `วันนี้` กับ `4 วัน` ไว้ข้าง ๆ กันโดยไม่บอกว่าอันไหนคืออะไร (วันที่ยื่น vs จำนวนวันที่รอ) — สองตัวเลขที่ไม่มีป้าย ตีความผิดได้ทั้งคู่ จึงตัดออกทั้งคู่ แล้วเปลี่ยนเป็น **badge `ใหม่` สีแดง** สำหรับใบที่มาถึงคุณวันนี้ วางในช่อง `w-10` หน้าแถบ Step เพื่อให้แถบ Step ของทุกแถวอยู่ตรงกัน ไม่ขยับตามความยาวข้อความ

หัวข้อการ์ดขึ้น **ค่าที่ขอจริง** จาก `fields_display` (เช่น "Notebook", "ซิม / แพ็กเกจดาต้า") ไม่ใช่ชื่อประเภทคำขอ — คนอนุมัติต้องรู้ว่าอนุมัติอะไร ไม่ใช่ว่าใบนี้ประเภทไหน

**แท็บ "รออนุมัติจากฉัน" ยุบเป็นชิปตัวกรอง** — มันไม่เคยเป็นมุมมองแยก แค่ `scope=approvals` ต่อท้าย query เดิม สภาพเดิมคือตัวกรองที่ใส่เสื้อแท็บ ทำให้ผู้ใช้เข้าใจว่าเปลี่ยนหน้า

### 2. `admin` เห็นปุ่มอนุมัติของขั้นที่ไม่ใช่ของตัวเอง

`scope=approvals` กรองด้วย permission `requests.view_all` มาก่อน — คนที่ดูได้ทั้งระบบจึงได้ทุกใบที่ค้างอยู่ในคิว **ของคนอื่น** มาแสดงในการ์ด "รอการตัดสินจากคุณ" พร้อมปุ่มอนุมัติที่กดแล้วเด้ง 403 กลับมา

การอนุมัติไม่ใช่สิทธิ์ มันคือ**ตัวบุคคล**: กรองด้วย `approver_employee_id = ผู้ใช้คนนี้` ตรง ๆ และบัญชีที่ไม่มี employee (เช่น `super`) ได้ผลลัพธ์ว่างเสมอ ไม่ใช่ทั้งระบบ · เพิ่ม `disabled={!r.can_approve}` เป็นตาข่ายชั้นสอง

### 3. "ความเคลื่อนไหวล่าสุด" ที่เคลื่อนไหวจริง

การ์ดเดิมเรียงตามใบที่ยื่นล่าสุด — ใบที่เพิ่งมีคนเซ็นเมื่อ 5 นาทีก่อนจึงจมอยู่ใต้ใบที่ค้างมาตั้งแต่เดือนที่แล้ว ซึ่งไม่ใช่ความหมายของ "ความเคลื่อนไหว"

ต้องมี stamp ของตัวเอง (`service_requests.last_activity_at`, มี index) เพราะไม่มีคอลัมน์เดิมตัวไหนตอบได้: `updated_at` ขยับทุกการเขียน (คำสั่ง refresh snapshot เขียนทับ `fields` ทุกแถว = ส่งทั้งตารางขึ้นหัวฟีด) และการเซ็นขั้นกลางเขียนที่ `request_approvals` โดยไม่แตะตัวคำขอเลย · migration backfill จาก stamp ที่มีอยู่ด้วย PHP ไม่ใช่ `GREATEST()` เพราะทุกคอลัมน์ nullable

`ServiceRequestResource::lastActivity()` คืน `kind` เป็นรหัส (submitted / approved_step / approved / rejected / cancelled / fulfilled) ให้ SPA ประกอบประโยคเป็นภาษาผู้อ่าน ส่วน `by` เป็นชื่อที่ freeze ไว้บนแถวที่ขยับ ไม่ resolve ใหม่

**เจอบัคลำดับตอนเขียนเทสต์**: ลำดับ default เรียงด้วย `created_at desc` คีย์เดียว สองใบที่ยื่นวินาทีเดียวกันจึงไม่มีลำดับแน่นอน — รายการนี้แบ่งหน้าฝั่ง server แถวหนึ่งจึงโผล่ซ้ำหน้าหนึ่งและหายจากหน้าถัดไปได้ · เติม `->latest('id')` ปิดท้ายทั้งสองสาขา

### 4. กระดิ่ง Ticket ที่ยังขึ้น "coming soon"

ไม่ใช่ของที่ยังไม่ได้ทำ — backend ส่ง bell ของ ticket ครบทุกชนิดมานานแล้ว แต่ `notifications-dropdown.tsx` มีตาราง `live: false` ค้างจากตอนที่โมดูลยังไม่เสร็จ แล้วกิ่ง coming-soon ก็ตัดหน้าการเรนเดอร์รายการจริง — ลบ flag + กิ่งนั้นทิ้ง

### 5. ขีดกลาง: em dash → hyphen ทั้งระบบ (291 จุด / 76 ไฟล์)

`—` (U+2014) กว้างกว่าที่การ์ดและกระดิ่งต้องการ และในระบบเดียวกันมีทั้งขีดยาว-ขีดสั้นปนกัน แทนที่ ` — ` เป็น ` - ` ในข้อความที่ผู้ใช้เห็น:

| กลุ่ม | จำนวน |
|---|---|
| `lang/**` ค่าใน dict (en + th) | 152 |
| seeder (ข้อมูล demo ที่จะถูก seed ครั้งต่อไป) | 62 |
| PHP: หัวข้อ AuditLog, ข้อความ error 422, เทมเพลตอีเมล | 44 |
| สตริงที่ hardcode ใน `.tsx` (ตัวคั่น `code - name`, placeholder, chip, toast) | 29 |
| blade อีเมล / PDF | 4 |

**ไม่แตะ** — คอมเมนต์ทุกภาษา · `—` เดี่ยวที่เป็นสัญลักษณ์ "ไม่มีค่า" (193 จุด, ยังเป็นภาษาของแอปนี้) · output ของ artisan command (เห็นแค่ใน terminal) · regex `[—-]` ใน migration ที่รองรับทั้งสองแบบอยู่แล้ว · **ข้อมูลจริงใน DB** (ชื่อสัญญา, `owner = 'Pool — IT'`, AuditLog แถวเก่า) เป็นข้อมูลไม่ใช่ UI

**สวีปรอบแรกกินคอมเมนต์ไปด้วย 25 บรรทัด** เพราะตัวกรองจับได้แค่บรรทัดที่ *เริ่ม* ด้วย `//` `*` `{/*` ไม่ใช่บรรทัดที่ต่อเนื่องอยู่ในบล็อก — เขียนตัวตรวจสถานะบล็อกจริง (นับ `/* */`, `{/* */}`, `{{-- --}}` โดยตัดสตริงออกก่อนเพื่อไม่ให้ `/*` ที่อยู่ในสตริง toggle สถานะ) แล้วย้อนคืนโดยจับคู่กับ HEAD ตาม **เนื้อความ** ไม่ใช่เลขบรรทัด เพราะไฟล์เหล่านั้นมีงานอื่นค้างอยู่

**3 จุดที่ hyphen ทำให้อ่านผิด แก้คำแทนการใส่ขีด**: กฎ username สองคีย์ (`. _ - only - starting…` → `only, starting…` เพราะ `-` เป็นอักขระที่อนุญาตด้วย จึงอ่านเป็นรายการต่อ) และเทมเพลตอีเมล 2 ฉบับที่ em dash คู่ทำหน้าที่เป็นวงเล็บ (`{{ticket.id}} - {{ticket.subject}} - was forwarded…` → ตัดขีดที่สองออก)

### Tests / Verification

**ทั้ง suite = 942 passed / 3,646 assertions** (เดิม 935) · `tsc --noEmit` = 0 · pint ผ่าน · prettier ผ่าน · `npm run build` ผ่าน · eslint เหลือ 2 warning เดิมของ `stock/pages/tabs/*`

เทสต์ใหม่ใน `RequestWorkflowTest`: การเซ็นหนึ่งขั้นดันคำขอขึ้นหัวฟีดและเปลี่ยน `activity.by` จากคนยื่นเป็นคนเซ็น (`travel(1)->minutes()`) · `scope=approvals` ของ `admin` ที่ดูได้ทั้งระบบต้องว่าง ไม่ใช่ทุกใบ

ยืนยันบนเบราว์เซอร์: การ์ดคิวอนุมัติ (badge `ใหม่`, แถบ Step ตรงกันทุกแถว), ชิปตัวกรอง + ช่องค้นหาสูง 40px เท่ากันทั้ง 6 หน้าที่ใช้ FilterPopover, ตัวเลือกใน filter บริการที่ไม่ตัดคำอีก (panel `minWidth` = ความกว้าง trigger, `width: max-content`, เพดาน 320px)

### 6. กระดิ่งคิว IT: "รอการตัดสินจากคุณ" ที่ไม่มีอะไรให้ตัดสิน

`finalApproved()` ส่งกระดิ่งให้คิว `requests.fulfill` โดยยืม subtype `waiting` ของขั้นอนุมัติมาใช้ แล้วยัดคำว่า `IT Staff` เป็นชื่อขั้น → ได้ประโยค "รอการตัดสินจากคุณ - IT Staff" · ขั้นนี้ไม่มีใครตัดสิน มันคือขั้นส่งมอบ และเมื่อ workflow เปิดเคสเอง **ก็ไม่มีอะไรให้กดด้วย** เพราะ gate ปิดปุ่มไว้ (ปิดที่เคสคือทางเดียว) กระดิ่งจึงขอสิ่งที่ระบบเองห้าม พร้อมยืนซ้อนกับกระดิ่ง "เคสใหม่รอการรับ" ของเคสนั้น

`ready_to_fulfill` เป็น subtype ของตัวเอง และ `waiting` เหลือความหมายเดียว = คนที่ต้องตัดสิน · อ่านได้สองแบบตามความจริง: มีเคส → `เปิดเคสให้คุณเรียบร้อยแล้ว - TKT-…` ฟ้า (เป็นข่าว) · ไม่มีเคส → `อนุมัติครบทุกขั้นแล้ว - รอคุณส่งมอบและปิดคำขอ` เหลือง (เป็นงาน) · payload พก `ticket_id`/`ticket_no` มาเรียกชื่อเคส แต่คลิกแล้วยังเปิด**คำขอ** ไม่ใช่เคส เพราะ `requests.fulfill` ไม่ได้แปลว่ามีสิทธิ์ดู Ticket จะเป็นทางตัน 403

notification เขียนครั้งเดียวไม่ re-render จาก source → migration retag ใบที่ส่งไปแล้ว (จับด้วย `step_label = 'IT Staff'` ซึ่งมีแต่กระดิ่งคิวที่ใช้ ขั้นอนุมัติจริงใช้ชื่อตำแหน่ง) พร้อมเติมเลขเคสให้

### 7. Fade out ของ drawer ที่เนื้อหาหายก่อน panel

เก็บ DOM ทุก 25ms ตอนกดปิด `/tickets?view=9`: เปิดอยู่ = 5 บล็อค / 788 ตัวอักษร, เฟรมแรกของ exit = **4 บล็อค / 719 ตัวอักษร** — แถบ "เคสนี้ยังไม่มีผู้รับผิดชอบ" หายทั้งบล็อคและปุ่ม "รับเคส" หายจาก footer panel จึงหดสั้นลงหนึ่งแถวพร้อมกับ fade

drawer retain ตัว record ไว้อยู่แล้ว (`shown`) แต่ **flag ที่คำนวณจาก record อยู่ที่หน้าเพจและไม่ได้ retain**: `canTake={canTake && (detail ? hasLevel(detail.category) : false)}` · ปิด → `?view=` หลุด → query ปิด → `detail` เป็น undefined ในเรนเดอร์ถัดไป → flag เป็น false ก่อน animation ได้เล่นแม้แต่เฟรมเดียว drawer ถือ record ครบแต่ถูกสั่งซ่อนปุ่ม

ทั้งสองหน้าอ่าน flag จาก record ที่ drawer ยังโชว์อยู่ ส่วน open/closed ยังตามค่าจริง · หน้า Access เป็นรูปเดียวกัน (`members` เป็น `useMemo` ที่คืน null ทันทีที่ `?view=` หลุด) แก้ด้วย · Asset/Contract/Employee ไม่เป็น เพราะ `can*` เป็นสิทธิ์ระดับผู้ใช้ และ Request ฝัง `can_approve`/`can_fulfill` มาใน record จาก API จึง retain ไปพร้อมกัน

วัดหลังแก้: จำนวนบล็อคและความยาวข้อความคงที่ตลอด exit ที่เหลือคือ zoom-out keyframe ของ Radix เอง

## ชื่อคำขอเป็นของ server ไม่ใช่ของคนกรอก (2026-08-12)

### 8. `title` ที่แช่ภาษาของคนยื่นไว้ในคอลัมน์

ไม่มีใครพิมพ์ title — wizard ปั้นเองจาก `t('req_auto_title')` + ชื่อประเภท แล้ว POST ขึ้นมาเก็บดิบ ๆ ประเภทเดียวกันจึงถูกเก็บคนละภาษาตามภาษา UI ของคนยื่น (ในฐานข้อมูลจริง: ไทย 9 แถว อังกฤษ 34 แถว ทั้งที่เป็นบริการชุดเดียวกัน) และสตริงนั้นถูกอ่านต่อ **4 ที่**: รายการ/ไดอะล็อกคำขอ · หัวกระดิ่ง · **subject ของ Ticket** · **อีเมลอนุมัติ** — ทั้งหมดจึงพูดภาษา *คนยื่น* ไม่ใช่ *คนอ่าน*

เลือกทางที่ไม่ต้องเพิ่มคอลัมน์ `title_th` (จะกลายเป็นหนี้ `*_th` ก้อนใหม่ และภาษาที่ 3 ต้องเพิ่มคอลัมน์อีก):

- **server เป็นเจ้าของคอลัมน์** `RequestService::canonicalTitle()` ประกอบเอง (direct = `Request: {service}` · onboarding = `{service} for {ชื่อ}`) เป็นอังกฤษ ให้ตรงกับ body ของ auto-ticket ที่เป็นอังกฤษอยู่แล้ว — จะสลับทั้งระบบเป็นไทยคือเปลี่ยน `label()` เป็น `labelTh()` ในเมธอดนี้จุดเดียว
- **client ปั้นไม่ได้อีก** ถอด rule `title` ออกจาก Form Request → `validated()` ทิ้งสิ่งที่ส่งมา และลบ `autoTitle()` ออกจาก wizard บั๊กนี้จึงกลับมาไม่ได้
- **หน้าจออ่านจาก `type`** `requestTitle()` ที่ `shared/lib/request-meta.ts` เขียนประโยคเดียวกันในภาษาผู้อ่าน ใช้ที่รายการ 3 จุด · ไดอะล็อกรายละเอียด 5 จุด · decision dialog 2 จุด · กระดิ่ง (payload เพิ่ม `requester_name` เพื่อให้ใบ onboarding เรียกชื่อคนได้เหมือนในรายการ) — **แถวเก่าจึงอ่านถูกด้วยโดยไม่ต้องแก้ข้อมูล**
- **ค้นหาเลิกขึ้นกับภาษา** เดิม `title LIKE '%…%'` ซึ่ง `title` ไม่มี index (full scan) และหาข้ามภาษาไม่เจอ · เพิ่ม `RequestType::matching()` เทียบคำค้นกับ label ทั้งสองภาษาแล้ว `whereIn('type', …)` บน `service_requests_type_index` ที่มีอยู่ — เร็วกว่าเดิมและข้ามภาษาได้
- **ใบเก่า** `php artisan requests:normalize-titles` (มี `--dry-run`) รันแล้ว: เขียนใหม่ 9 แถว, ตรงรูปอยู่แล้ว 34 แถว **รวมใบ onboarding ทุกใบ** ซึ่งเป็นหลักฐานว่ากฎใหม่ให้ผลเหมือนของเดิมเป๊ะ · ใช้ `withoutTimestamps()` ไม่ให้การเขียนหมู่ไปโป๊ะ `updated_at` จนดูเหมือนมีความเคลื่อนไหว

ยืนยันบนเบราว์เซอร์: แถวเดิม (RQ-0038…0043 ซึ่งมีทั้งใบที่เก็บอังกฤษและใบที่เพิ่ง normalize มาจากไทย) กดสลับภาษาแล้วอ่านเป็น `คำขอ: กลุ่มเมล` / `Request: Mail group` ตามผู้อ่าน

### 9. เคสของพนักงานใหม่ต้องสะดุดตา

Ticket ไม่มีฟิลด์บอกที่มา คำเดียวที่เหลือคือตัวหนังสือ — เติม ` (New employee)` ที่ **subject** (เห็นในคิวโดยไม่ต้องเปิดเคส) และ **บรรทัดแรกของ description** ต่อ**หลัง**ตัด 200 ตัวอักษร ไม่งั้นชื่อยาวจะกินวงเล็บหายเงียบ ๆ · ไม่เอาไปต่อบรรทัด `Requester:` เพราะบรรทัดนั้นมีวงเล็บแผนกอยู่แล้ว จะเป็นวงเล็บซ้อนวงเล็บ · กฎอยู่ที่ `newHireMarker()` จุดเดียว ทั้งสองที่อ่านจากตัวเดียวกัน

```
[RQ-2026-0044] Computer for Somchai Jaidee (New employee)
Auto-opened (New employee)
```

เคสเก่า 7 ใบที่มาจากคำขอ onboarding **ไม่เติมย้อนหลัง** (ตัดสินใจไว้: เป็น subject ของเคสที่ IT ถืออยู่จริงและอาจถูกอ้างไปแล้ว)

### Tests / Verification

**ทั้ง suite = 953 passed / 3,712 assertions** (เดิม 942) · tsc · prettier · eslint 0 error · pint · `npm run build` ผ่าน

`RequestCanonicalTitleTest` ใหม่ 9 ตัว เขียนก่อนแก้และเห็นแดง 8/8 จริง: server ทับ title ที่ client ส่งมา · ไม่ส่ง title ก็ผ่าน · subject ของเคสไม่ตามภาษาคนยื่น · DataProvider ค้นหา 3 คำ (EN / TH / reference) · แถวที่เก็บไทยยังหาด้วยคำอังกฤษเจอ · ทุกประเภทมี label ครบสองภาษา · คำสั่ง normalize (dry-run ไม่เขียน / รันจริงเขียน / ใบที่ตรงแล้วไม่ถูกแตะ) · และใน `RequestAutoTicketTest` เพิ่มเคสพนักงานใหม่ (marker ครบสองที่) พร้อม assert ว่าคำขอปกติต้อง **ไม่มี** คำนี้

---

## Employee detail: แท็บ Requests เลิกเป็น Coming soon (2026-08-13)

แท็บสุดท้ายในไดอะล็อกดูพนักงานที่ยังเป็นการ์ด "เร็ว ๆ นี้" มาตั้งแต่ดีไซน์แรก — ตอนนี้อ่านคำขอจริงของคนคนนั้น ต่อจาก Assets/Tickets/Access ที่ทำไปแล้ว

### เจ้าของคำขออยู่ 2 คอลัมน์ ไม่ใช่คอลัมน์เดียว

`GET /employees/{employee}/requests` (`EmployeeController@requests`) คืนคำขอที่ `employee_id` = คนนี้ **หรือ** `user_id` = บัญชีของคนนี้ เพราะคำขอเกิดได้ก่อนเจ้าตัวจะมีบัญชี (ใบ onboarding ที่ HR ยื่นแทนมี `employee_id` แต่ `user_id` เป็น null) ส่วน `user_id` เป็นตาข่ายรับกรณีที่ `employee_id` ถูก null ทิ้งภายหลัง — ใบที่เขาเป็นแค่**คนยื่นแทน** (`submitted_by_user_id`) ไม่ขึ้นที่นี่ เพราะมันเป็นคำขอของอีกคน

- **Gate = `employees.view`** ไม่ใช่ `requests.view_all` — แพทเทิร์น peek เดิมของโมดูล Employee (อ่านข้อมูล "ของคนคนนี้" ผ่านหน้าพนักงาน)
- เรียง `created_at` desc **แล้วต่อด้วย `id` desc** เพราะใบ onboarding หลายใบเกิดในวินาทีเดียวกัน ถ้าไม่มีตัวตัดสินลำดับจะสลับไปมาตามอารมณ์ฐานข้อมูล
- **ไม่ส่ง `title`** จากฐาน: คอลัมน์นั้นเก็บอังกฤษตัวเดียวไว้ให้ subject ของเคสกับอีเมล ส่วนหน้าจอเขียนชื่อด้วย `requestTitle()` เป็นภาษาของ**คนอ่าน** (กฎเดียวกับหน้า Requests)

### หน้าจอ

`RequestsPane` ในไดอะล็อก: ตาราง 4 คอลัมน์ (วันที่ยื่น · เรื่อง+เลข RQ + ป้ายม่วง "พนักงานใหม่" ถ้าเป็นใบ onboarding · ประเภทพร้อมไอคอน · สถานะ) ใช้ `DataTable fillHeight` ความหนาแน่นเดียวกับแท็บ Tickets ให้อ่านเป็นตารางชุดเดียวกัน · ตัวเลขบนหัวแท็บมาจากจำนวนคำขอจริง (ว่างระหว่างโหลด ไม่โชว์ 0 ที่จะกลายเป็น 3) · **แถวกดไม่ได้** เพราะการเปิดคำขอต้องใช้สิทธิ์ของโมดูล Request ซึ่งคนที่เปิดไดอะล็อกนี้ไม่จำเป็นต้องมี

คอมโพเนนต์ `ComingSoon` กับคีย์ `emp_v_coming_soon` ถูกลบทิ้งพร้อมกัน — ไม่มีแท็บไหนเหลือใช้แล้ว

### Tests / Verification

`EmployeeRequestsTest` ใหม่ 4 ตัว: คืนทั้งใบที่ยื่นเองและใบที่ HR ยื่นให้ · ไม่รวมคำขอของคนอื่นและใบที่เขาเป็นแค่คนยื่นแทน · `employees.view` อย่างเดียวพอ · ไม่มีสิทธิ์ = 403 — **ยืนยันด้วยการปิดเงื่อนไข `orWhere('user_id')` ชั่วคราวแล้วเห็นแดงจริงก่อนคืนกลับ**

**ทั้ง suite = 957 passed / 3,726 assertions** (เดิม 953) · tsc 0 · eslint 0 · pint ผ่าน · `npm run build` ผ่าน

**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — ตัวเลขบนหัวแท็บ, ป้ายม่วงของใบ onboarding และจังหวะ skeleton ควรกดดูด้วยตาอีกรอบ

---

## Assets Dashboard: กราฟส่งมอบ/รับคืน 12 เดือน + แกนกราฟตัวกลาง (2026-08-13)

หน้า Assets แท็บ Dashboard เดิมมี KPI 4 ใบ → By type เต็มกว้าง → ตารางมูลค่าสูงสุด เพิ่มการ์ดกราฟ 12 เดือนไว้ข้าง By type

### 1. ตารางประวัติไม่เคยบอกว่าการเปลี่ยนมือนั้นคืออะไร

`asset_transfers` เก็บแค่ from/to owner — จะนับ "ส่งมอบกี่เครื่องเดือนนี้" ต้องอ่านข้อความ `reason` ภาษาอังกฤษ (`'Returned to pool'` / `'Recalled - transfer cancelled'`) ซึ่งเป็นช่องที่ผู้ใช้พิมพ์เองได้ = เดา ไม่ใช่ข้อเท็จจริง

- คอลัมน์ใหม่ `kind` + enum `AssetTransferKind` (`handover` / `return` / `recall`) เขียนที่จุด log ทั้ง **4 จุด** ใน `AssetService` (ส่งให้พนักงาน · ส่งให้ของกลาง · รับคืนเข้าคลัง · เรียกคืนใบที่ยังไม่รับ) — `logTransfer()` บังคับรับ kind เป็นพารามิเตอร์ ลืมไม่ได้เพราะ type บังคับ
- migration backfill แถวเก่าด้วยการเดาแบบเดิมครั้งเดียว (index `[kind, created_at]`, `down()` drop คืนได้) · **รันบนฐานจริงแล้ว**: 1 แถวที่มีอยู่ได้ `handover` ถูกต้อง (เหตุผลเป็นภาษาไทยที่ผู้ใช้พิมพ์ ไม่เข้าเงื่อนไขไหน)
- **`recall` แยกจาก `return` ในฐาน แต่กราฟนับรวมเป็น "รับคืน"** เพราะทั้งคู่คือของกลับเข้าคลัง (`recall()` ทำเหมือน `markReceived()` เป๊ะ ต่างแค่ต้นเหตุ) — วันหน้าอยากแยกก็แยกได้โดยไม่ต้อง migrate ใหม่

### 2. `summary` ส่ง `activity_12m`

12 เดือนย้อนหลังจบที่เดือนปัจจุบัน เก่า→ใหม่ · **เดือนที่ไม่มีอะไรเกิดก็ต้องมีแถวเป็น 0** ไม่ใช่หายไป ไม่งั้นแท่งจะเลื่อนตำแหน่งแล้วป้ายเดือนผิด · จัดกลุ่มใน PHP ไม่ใช่ SQL เพราะเทสต์รันบน SQLite แต่ production เป็น MariaDB และฟังก์ชันตัดเดือนเขียนไม่เหมือนกัน (เหตุผลเดียวกับที่ `WorkflowController` คิดค่าเฉลี่ยใน PHP) · query ดึงแค่ 2 คอลัมน์ในหน้าต่าง 12 เดือน

### 3. แกนกราฟย้ายไป `shared/` — ไม่มี chart library

ไม่ลง dependency ใหม่: กราฟ 12 แท่งไม่ต้องใช้ scale/axis/tooltip engine และธีม/สี brand ของแอปคุมด้วย CSS variable อยู่แล้ว (บันเดิลตอนนี้ 554 kB gzip — build เตือนเรื่องขนาดอยู่แล้ว)

- `shared/components/month-bar-chart.tsx` ใหม่ = แกนกราฟ (`MonthBarChart` + `CurrentMonthLegend`) ยกมาจาก `HiresTrendCard` ของโมดูล Employee ตรง ๆ · ทิศทางพึ่งพาถูกกฎ: `shared/` ไม่รู้จักโมดูลไหน ทั้ง employee และ asset พึ่ง shared
- คีย์ legend ย้ายจาก `emp_current_month` → `current_month` ใน `common.ts` เพราะ 2 โมดูลใช้แล้ว (shared ไม่ควรอ้างคีย์ของโมดูลใด) · คีย์เดิมลบทิ้ง
- `HiresTrendCard` เหลือแค่กรอบการ์ด + หัวข้อ + คำบรรยาย — **มีพฤติกรรมเปลี่ยน 1 อย่าง**: เดิมขึ้นข้อความว่างเฉพาะเมื่อ `data` ว่าง ตอนนี้ถ้า 12 เดือนเป็น 0 หมดก็ขึ้นข้อความว่างด้วย (แท่ง 0 สิบสองแท่งอ่านเหมือนกราฟเสีย) — ใช้กฎเดียวกันทั้งสองหน้า
- การ์ดใหม่ `asset-activity-card.tsx`: ปุ่มสลับ ส่งมอบ/รับคืน ที่หัวการ์ด (series เดียวต่อครั้ง — 2 ชุด 12 เดือนในการ์ดครึ่งจอ = 24 แท่ง เบียดเกิน) · state อยู่ใน component ไม่ขึ้น URL เพราะเป็นมุมมองของการ์ด ไม่ใช่ filter ที่ใครจะแชร์ลิงก์
- แถว By type เป็น `grid lg:grid-cols-2` + `items-start` — By type สูงตามจำนวนประเภท กราฟสูงคงที่ ไม่ยืดการ์ดที่สั้นกว่าให้เท่ากันแบบปลอม · `AssetDashboardSkeleton` เพิ่มโครงกราฟ 12 แท่งสูงสลับกันให้ layout ไม่กระตุกตอนโหลด

### Tests / Verification

`AssetActivityChartTest` ใหม่ 8 ตัว: kind ถูกต้องทั้ง 4 เส้นทาง (ส่งพนักงาน/ของกลาง/รับคืน/เรียกคืน) · 12 เดือนเสมอจบที่เดือนปัจจุบัน · นับเข้าเดือนที่ถูก · เดือนว่างเป็น 0 · recall รวมกับ return · แถวเก่ากว่าหน้าต่างไม่ถูกนับ — **ยืนยันด้วยการพังโค้ด 2 จุดแล้วเห็นแดงจริง** (`isInbound()` ตัด recall ออก → 1 fail · หน้าต่าง 11 เดือน → 4 fail) ก่อนคืนกลับ

**ทั้ง suite = 965 passed / 3,747 assertions** (เดิม 957) · tsc 0 · eslint 0 · prettier · pint · `npm run build` ผ่าน

**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — ฐานจริงมีทรัพย์สิน 1 รายการและ transfer 1 แถว กราฟจะขึ้นข้อความว่างเกือบทุกมุมมอง · ต้องดูด้วยตาว่าการ์ดคู่กันเรียงสวยจริง, ปุ่มสลับใช้ได้, และ `HiresTrendCard` หน้า Employee หน้าตาไม่เปลี่ยนหลังย้ายแกนกราฟ

---

## Workflow: View / Edit มี URL แล้ว (2026-08-13)

หน้า Workflow เป็นโมดูลเดียวที่ dialog ยังเป็น state ในหน่วยความจำล้วน — reload แล้วปิด, ส่งลิงก์ให้คนอื่นไม่ได้ ตอนนี้ทั้งสองตัวขับด้วย URL เหมือนอีก 7 โมดูล

- **`?view=<id>` และ `?edit=<id>`** เขียนผ่าน `open(mode, id)` ตัวเดียวที่ **ลบพารามิเตอร์อีกตัวทิ้งเสมอ** — "เปิดได้ทีละอัน" จึงเป็นคุณสมบัติของ URL ไม่ใช่กฎที่ต้องจำ · `{ replace: true }` ไม่ถมประวัติ back button · ปุ่ม Edit ในหน้า View = สลับพารามิเตอร์ด้วย id เดิม
- **หา record จาก list ไม่ใช่ยิง API** — `WorkflowController` ไม่มี `show` (มีแค่ index/update/preview/employee-options) และเส้นทางอนุมัติมาคู่กับประเภทคำขอ ~12 รายการที่โหลดมาแล้วทั้งหมด ⇒ ไม่ต้องเพิ่ม endpoint
- **`RecordMissingDialog`** สำหรับ id ที่ไม่มีจริง — เงื่อนไขเช็ค `data != null` ไม่ใช่ `!isLoading` เพราะ refetch ระหว่างใช้งานไม่ควรกล่าวหา URL ว่าตาย และตอนโหลดครั้งแรก id ที่ยังจับคู่ไม่ได้ก็ไม่ใช่ลิงก์เสีย
- `toRecordId()` กรอง `?view=abc` (บั๊ก NaN ที่ 7 โมดูลแก้ไปเมื่อ 2026-08-12 — โมดูลนี้ไม่มีเพราะยังไม่มี URL ให้พัง)
- **ต่างจากแพทเทิร์นเดิมข้อเดียว**: contract/asset จงใจให้ edit เป็น local (`edit stays local`) เพราะฟอร์มมี draft ที่ reload แล้วหาย · ที่นี่ตัวแก้ไขโหลดค่าจาก workflow ใหม่ทุกครั้งไม่มี draft ค้าง จึงให้ URL ได้

### Tests / Verification

backend ไม่แตะเลย (`WorkflowAdminTest` 8 ตัวยังผ่าน) · logic เป็น React ล้วนและโมดูลนี้ไม่มีเทสต์ frontend ⇒ `tsc` 0 · eslint 0 · prettier · `npm run build` ผ่าน

**ยังไม่ได้ทดสอบบนเบราว์เซอร์** — 4 เคสที่ต้องกดเอง: `/workflows?view=1` และ `?edit=1` เปิด dialog ถูกตัว · เปิดจากปุ่มแล้ว URL เปลี่ยน · ปุ่ม Edit ในหน้า View สลับ `view` → `edit` · `?view=999` ขึ้นกล่อง "ไม่พบรายการ"
