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

### Coming Soon (v1) — สถานะ ณ 2026-08-13

| รายการ | สถานะ |
|---|---|
| ปิด Ticket แล้ว auto-fulfill คำขอ | ✅ ทำแล้ว 2026-08-08 (`RequestService::settleFromTicket()`) |
| ปุ่มสร้าง workflow ใหม่ | ❌ ไม่ทำ — ตัดสินใจ 2026-08-06 (โมดูลนี้**ปรับ**เส้นทางของประเภทคำขอที่มีอยู่ ไม่สร้างใหม่) |
| daily SLA reminder sweep | ❌ ตกไปเอง — SLA ถูกลบออกจากฐาน 2026-08-06 จึงไม่มีเส้นตายให้เตือนถึง (ถ้าจะทำต้องเป็นฟีเจอร์ใหม่: เตือนคำขอที่ค้างเกิน N วัน ซึ่งวัดจากเวลาที่ผ่านไป ไม่ใช่กำหนดส่ง) |
| แนบไฟล์ในคำขอ | ❌ ไม่ทำ — ตัดสินใจ 2026-08-13 |
| ปุ่ม Export หน้า Requests | 🕗 ยังไม่ทำ — รวมอยู่ในเรื่อง Export ทั้งระบบ (ยังไม่มี `maatwebsite/excel` ในโปรเจกต์) |

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

`EmployeeImportTest` (17 tests / 72 assertions) — text matching ทั้งสามช่อง · section ผิดแผนก · ข้อความกำกวม · กฎ special position · หัวหน้าอยู่ท้ายไฟล์ · ลูป · header เดิม `code` · dry-run ไม่เขียน · endpoint preview/import/template · และ **เทสต์ที่ seed ผังองค์กรจริง** (`EmployeeDepartmentSeeder`/`EmployeeSectionSeeder`/`EmployeePositionSeeder`) แล้วยืนยันว่าคำที่ HR พิมพ์ resolve ได้ตัวเดียว
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
fixture ของ `RequestWorkflowTest` / `RequestNotificationTest` / `RequestAutoTicketTest` / `EmployeeOnboardingRequestTest` เปลี่ยนมา seed `EmployeePositionSeeder` แล้วให้พนักงานถือตำแหน่งจริง
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

---

## คำขอที่ไม่มีใครแตะ: กระดิ่งรายวัน + อีเมลสรุปวันจันทร์ (2026-08-14)

แจ้งเตือนทุกตัวในระบบเป็น **push ครั้งเดียวตอนเกิดเหตุ** และไม่มีอะไร replay — ผู้อนุมัติที่ไม่ได้เปิดกระดิ่งเช้านั้นจะไม่มีอะไรมาทวงอีกเลย คำขอค้างเงียบได้เป็นสัปดาห์โดยระบบถือว่าจบธุระไปแล้ว เพิ่ม 2 กวาดที่ "พูดโดยไม่มีเหตุการณ์" เป็นครั้งแรกของโมดูลนี้

### 1. กระดิ่งรายวัน — ค้างเกิน 3 วัน (`requests:send-stalled-reminders`, 08:10)

- ส่งหา**คนที่ถือขั้นอยู่** (`status = current`) นับจาก `became_current_at` ที่มีอยู่แล้ว ไม่ต้องเพิ่มคอลัมน์
- **ไม่มีอีเมล** — อีเมล `request.approval_needed` ยิงไปแล้วตอนขั้นมาถึง ส่งซ้ำทุกวันคือสอนให้คนตั้งกฎกรองที่อยู่ผู้ส่ง
- **รันทุกเช้าไม่กองกัน** — `sendBell()` ลบใบเดิมก่อนส่งใหม่อยู่แล้ว เห็นเป็นกระดิ่ง 1 ใบที่ยังไม่อ่านเสมอ ไม่ต้องมี dedup ledger แบบ stock
- **ผู้อนุมัติที่ยังไม่มีบัญชี = ไม่ทำอะไร** (ตัดสินใจไว้) · แถวคิว IT ที่ไม่ระบุตัวบุคคลส่งให้ผู้ถือ `requests.notify_approved`
- ตรวจ 2 ชั้น: แถวเป็น `current` **และ** คำขอยังเปิดอยู่ (`pending` สำหรับขั้นอนุมัติ / `approved` สำหรับคิว IT) — คำขอที่ถูกยกเลิกไปแล้วยังทิ้งแถว current ไว้ ถ้าไม่กรองจะไปทวงเรื่องที่จบแล้ว

### 2. อีเมลสรุปรายสัปดาห์ — ค้างเกิน 7 วัน (`requests:send-stalled-digest`, จันทร์ 12:00)

- **1 คน = 1 ฉบับ** รวมทุกใบที่ค้างอยู่กับเขาไว้ในตารางเดียว — 5 อีเมลเช้าวันจันทร์คือ 5 อย่างที่ต้องกดปิด แต่ลิสต์เดียวคืองานหนึ่งชิ้น
- ตาราง 4 คอลัมน์: เลขที่ (ลิงก์เปิดคำขอ) · ชื่อเรื่อง · ผู้ขอ · ค้างกี่วัน เรียงนานสุดขึ้นก่อน
- ตารางถูก render เป็น HTML แล้วส่งเข้าเทมเพลตเป็นตัวแปรเดียว `{{digest.table}}` ⇒ แอดมินยังแก้ข้อความรอบ ๆ ได้ที่หน้า Email Templates โดยไม่ต้องเขียน markup ตารางเอง · เทมเพลตใหม่ `request.stalled_digest` cadence `weekly` (ค่าใหม่ ฝั่งหน้าเว็บเดิมรู้จักแค่ realtime/daily ป้ายเลยเคยโกหกว่าเป็น realtime)
- **ไม่มีงานค้าง = ไม่ส่งอะไรเลย** ไม่ส่ง "สัปดาห์นี้ไม่มีงานค้าง" เพราะจะสอนให้คนเลิกเปิดอ่าน

### 3. สิทธิ์ใหม่ 2 คีย์ — แยก "ใครทำได้" ออกจาก "ใครอยากรู้"

| คีย์ | ใช้ที่ไหน |
|---|---|
| `requests.notify_approved` | **แทน `requests.fulfill`** ในการเลือกผู้รับกระดิ่ง/อีเมล "อนุมัติครบ พร้อมปิดงาน" + กระดิ่งเตือน 3 วันของแถวคิว IT |
| `requests.notify_stalled` | รับอีเมลสรุปวันจันทร์ (ไม่มีสิทธิ์ = ยังได้กระดิ่งรายวันตามปกติ) |

migration เติมคีย์ใหม่ให้ทุก role ที่ถือ `requests.fulfill` อยู่ก่อน กันแจ้งเตือนเงียบตอน deploy — **บนฐานจริงเติม 0 แถว เพราะไม่มี role ไหนถือ `requests.fulfill` เลย** (มีแต่ `super` ที่ข้ามการเช็คสิทธิ์อยู่แล้ว) แปลว่าพฤติกรรมบนฐานจริงไม่เปลี่ยน แต่ถ้าอยากให้ทีมอื่นได้รับต้องไปติ๊กที่หน้า Permissions เอง

### Tests / Verification

`RequestStalledReminderTest` ใหม่ 9 ตัว: เกิน 3 วันได้กระดิ่งพร้อมจำนวนวัน · ยังไม่ถึงเกณฑ์ไม่ได้ · รันซ้ำเหลือใบเดียว · คำขอที่ยกเลิกแล้วไม่ถูกทวง · คนไม่มีบัญชีไม่มีใครได้ · อีเมลสรุปใบเดียวต่อคนพร้อม**ตรวจเนื้อ HTML จริง** (เลขที่ทั้งสองใบ · เรียงนานสุดก่อน · เลขวัน · หัวเรื่องบอกจำนวน) · ไม่มีสิทธิ์ = ไม่ส่ง · ต่ำกว่า 7 วันไม่เข้าสรุป · เทมเพลตถูก seed — **ยืนยันด้วยการเปลี่ยนเกณฑ์ 7 → 3 วันแล้วเห็นแดงก่อนคืนกลับ**
`RequestNotificationTest` แก้ให้ role IT ถือ `requests.notify_approved` ด้วย (เทสต์เดิมยืนยันกฎเก่า)

**ทั้ง suite = 974 passed / 3,785 assertions** (เดิม 965) · tsc 0 · eslint 0 · prettier · pint · build ผ่าน · `schedule:list` ยืนยัน `10 8 * * *` และ `0 12 * * 1`

**ยังไม่ได้ทดสอบบนเบราว์เซอร์/อีเมลจริง** — ยังไม่เคยเห็นกระดิ่ง `stalled` กับหน้าตาอีเมลสรุปบนจอจริง (ฐานจริงยังไม่มีคำขอที่ค้างถึงเกณฑ์)

---

## อีเมลที่ไม่ได้ส่ง ก็ต้องมีที่บันทึก + แท็บประวัติการส่ง (2026-08-14)

### 1. การตัดสินใจว่า "ส่งได้ไหม" กระจายอยู่ 7 ไฟล์

ทุกบริการเช็ค `if (! $recipient->email) return;` เองแล้วปล่อยผ่านเงียบ ๆ (Request · Stock · Ticket · SLA · Contract · Employee) ⇒ คนที่ไม่เคยรู้เรื่องคำขอของตัวเองไม่ทิ้งร่องรอยไว้ที่ไหนเลย และไม่มีใครนับได้ว่ามีกี่คน

- ย้ายการตัดสินใจไป `EmailNotificationService::sendTemplate()` จุดเดียว — รับที่อยู่แบบ **nullable** + ชื่อผู้รับ · มีอีเมล → คิว, ไม่มี → เขียน `email_logs` สถานะ **`skipped`** พร้อมชื่อคนที่ตกหล่น · **ลบ guard ซ้ำทั้ง 7 จุดทิ้ง**
- **เทมเพลตที่ถูกปิดไม่ถูก log** — นั่นคือสวิตช์ของแอดมินเอง ไม่ใช่ความล้มเหลว ถ้า log ทุกครั้งจะได้แถวที่บอกแค่ว่า "เขาปิดไว้"
- `email_logs`: `to_email` เป็น nullable, เพิ่ม `recipient_name` (ไม่มีอีเมลแล้วชื่อคือสิ่งเดียวที่บอกว่าใคร), index `(status, created_at)` · `SendTemplatedEmail` พาชื่อไปด้วยเพื่อให้แถวที่ส่งสำเร็จบอกได้ว่าส่งถึงใคร

### 2. แท็บ "ประวัติการส่ง" ในหน้าเทมเพลตอีเมล

การ์ด KPI นับแถวพวกนี้มาตลอด แต่ไม่มีที่ให้เปิดดู — เห็น "อัตราการส่งสำเร็จ 94%" โดยไม่รู้ว่า 6% คือใคร

- หน้าแบ่งเป็น 2 แท็บ **`?tab=templates|log`** (URL อย่างเดียว + type guard ตามมาตรฐาน) · KPI อยู่เหนือแท็บ เห็นทั้งคู่
- ตาราง: เวลา · เทมเพลต (key + หัวข้อ) · ผู้รับ (ชื่อ + ที่อยู่) · สถานะ · เหตุผล — server-paginated ผ่าน `DataTable server` เพราะตารางนี้โตขึ้น 1 แถวต่อ 1 อีเมลและไม่เคยถูกลบ
- chip กรองสถานะ **นับจากทั้ง log ไม่ใช่หน้าปัจจุบัน** (ตัวเลขที่เปลี่ยนตามหน้าเป็นตัวเลขที่โกหก) · **การ์ด "อัตราการส่งสำเร็จ" กดได้** → เด้งมาแท็บนี้
- `GET /api/email-logs` gate ด้วย `system.configure_notifications` เดียวกับเทมเพลต

### 3. แถมจากการเปิดดูของจริง

- **เทมเพลตใหม่ไม่เคยไปถึงฐานข้อมูล** — `EmailTemplates.php` เป็นแคตตาล็อก ส่วนที่ส่งจริงคือแถวในตาราง และ `sendTemplate()` หา key ไม่เจอจะ return เงียบ ๆ ⇒ `request.stalled_digest` จะไม่ถูกส่งเลย · migration `add_missing_standard_email_templates` เติมด้วย **`firstOrCreate`** ไม่ใช่ `updateOrCreate` เพราะบนฐานจริงมีเทมเพลตที่แอดมินแก้ข้อความไว้ **12 ใบ** (รันแล้ว: เพิ่ม 1 เป็น 28, ของที่แก้ไว้อยู่ครบ)
- cadence `weekly` ฝั่งหน้าเว็บเดิมรู้จักแค่ `realtime|daily` ป้ายเลยเคยตกไปที่ realtime — เพิ่มค่าที่สามพร้อมป้าย "รายสัปดาห์"
- พรีวิว `{{digest.table}}` เคยขึ้นเป็นข้อความดิบ (ตัวแปรนี้สร้างใน PHP ตอนส่ง) — ใส่ตารางตัวอย่างที่ `sampleVars()` ของ controller ให้แอดมินเห็นว่ากำลังแก้คำรอบอะไร

### Tests / Verification

`EmailDeliveryLogTest` ใหม่ 7 ตัว: ไม่มีที่อยู่ → แถว `skipped` + ไม่มีอะไรเข้าคิว · มีที่อยู่ → เข้าคิวพร้อมชื่อ · เทมเพลตปิด → ไม่มี log · `deliver()` เก็บชื่อ · endpoint เรียงใหม่สุดก่อน + นับทั้ง log · กรองสถานะ/ค้นหาชื่อ · กันคนไม่มีสิทธิ์ — **ยืนยันด้วยการใส่ `return;` ก่อนเขียน log แล้วเห็นแดงก่อนคืนกลับ**
`TicketOwnerNotificationTest` แก้ตัวช่วยเป็น `updateOrCreate` เพราะ migration ทำให้ฐานเทสต์เริ่มต้นด้วยเทมเพลตมาตรฐานครบชุดแล้ว

**ทั้ง suite = 981 passed / 3,807 assertions** (เดิม 974) · tsc 0 · eslint 0 · prettier · pint · build ผ่าน · **ยืนยันบนเบราว์เซอร์**: แท็บอ่านจาก URL ตรง ๆ, chip นับ 51 รายการ, pagination 1-20 จาก 51 (3 หน้า)

**ที่ยังไม่ได้ทำ**: `email_logs` ไม่มีระบบล้างข้อมูลเก่า โตขึ้นเรื่อย ๆ ตลอด (ตอนนี้ 51 แถว) — ถ้าจะทำควรเป็น command ลบของเกิน N วัน

### ตัดปุ่ม "เพิ่ม Template" ทิ้ง (2026-08-14)

เทมเพลตจะถูกส่งก็ต่อเมื่อโค้ดเรียก `sendTemplate($key)` และ **ทุก key ที่เรียกได้เขียนอยู่ในซอร์สทั้งหมด** (`App\Support\EmailTemplates`) — แถวที่สร้างจากหน้าเว็บด้วย key ใหม่จึงแก้ได้ เปิด/ปิดได้ ส่งทดสอบได้ แต่**ไม่มีเหตุการณ์ไหนในระบบส่งมันเลย** (ช่องกรอก key ยังใส่ placeholder ว่า `ticket.escalated` ซึ่งไม่มีโค้ดไหนเรียก)

เป็นกรณีเดียวกับปุ่ม "สร้าง workflow" ที่ตัดทิ้งไปเมื่อ 2026-08-06 แต่หนักกว่าเพราะบันทึกลงฐานจริง ⇒ ผู้ใช้ได้ของที่ดูเหมือนใช้ได้ · ลบปุ่ม + ไดอะล็อกสร้าง + `POST /email-templates` + คีย์ i18n ที่ตายแล้ว (`email_new` / `email_create` / `email_key`)

`ApiAuthorizationTest` เปลี่ยน data set จาก "create email template" เป็น **"edit email template"** (`PUT`) — endpoint ที่หายไปทำให้เทสต์ได้ 405 แทน 403 · **ทั้ง suite 981 passed เท่าเดิม**

> ถ้าวันหน้าเพิ่มเทมเพลตใหม่ ให้เพิ่มใน `EmailTemplates::all()` แล้วเขียน migration เติมแถวที่ขาด (แพทเทิร์น `add_missing_standard_email_templates`) — ไม่ใช่สร้างจากหน้าเว็บ

### Logs: คอลัมน์ครบ + เปิดดูอีเมลที่ส่งจริงได้ (2026-08-14)

- **6 คอลัมน์**: เวลา · Trigger · หัวข้อ · ผู้รับ · สถานะ · เหตุผล (เดิมยุบ Trigger กับหัวข้อไว้ช่องเดียว) — ทุกค่าอยู่ในฐานอยู่แล้ว ไม่ต้องแก้ schema
- **กดแถวเปิด View Drawer** เห็นอีเมลจริงที่ผู้รับได้รับ — หัวเป็น `FocusDialogHeader` (trigger เป็น eyebrow · หัวข้อเป็น title · เวลา+ผู้รับเป็น subtitle · badge สถานะขวาบน) · กล่องเหตุผลโผล่เฉพาะใบที่ล้มเหลว/ไม่มีอีเมล · เนื้อหาแสดงใน iframe
- **เก็บเฉพาะเนื้อความ ไม่เก็บทั้งใบ** — คอลัมน์ใหม่ `email_logs.body_html` เก็บ**เนื้อความที่แทนค่าตัวแปรแล้ว** (~0.2-3 KB) ส่วนกรอบแบรนด์/ปุ่ม/ฟุตเตอร์ถูกสวมกลับตอนเปิดอ่านจาก Blade `emails.templated` ตัวเดิม · วัดจริงแล้ว: เก็บทั้งใบ = **6.6 KB/ฉบับ** ซึ่ง 95% เป็นกรอบที่เหมือนกันทุกใบ ⇒ ประหยัดราว 30 เท่าโดยได้ภาพเหมือนเดิมเป๊ะ
- **แถวที่ไม่มีอีเมลก็เก็บเนื้อหา** — "สิ่งที่เขาควรได้รับแต่ไม่ได้" คือครึ่งที่มีประโยชน์ของ log ประเภทนี้
- แถวเก่าที่ไม่มี body → Drawer บอกว่าไม่ได้เก็บไว้ ไม่ใช่โชว์กรอบเปล่า · `GET /email-logs/{id}` คืน `preview_html` เป็น null

`EmailDeliveryLogTest` +4 (เก็บ body ตอนส่ง · เก็บ body ตอน skipped · endpoint สวมกรอบให้ถูก · แถวเก่าคืน null) — **ยืนยันด้วยการเปลี่ยนเป็นเก็บ null แล้วเห็นแดง 2 ตัวก่อนคืนกลับ** · **ทั้ง suite 985 passed**

### ticket.created: เนื้อจดหมายที่บอกว่าแจ้งอะไรไป (2026-08-14)

- **`reference.id` ออกจากเทมเพลตตระกูล ticket ทั้งหมด** — มันคือเลขใบเดียวกับ `{{ticket.id}}` เป๊ะ ๆ การมีชื่อ 2 ชื่อให้ค่าเดียวชวนให้แอดมินเข้าใจว่าเป็นคนละอย่าง
- **เนื้อจดหมายขยายเป็น 4 บรรทัด** (Ticket No. / Subject / Issue type / Details) — เดิมบอกแค่ว่า "รับเรื่องแล้ว" ผู้แจ้งต้องเข้าเว็บถึงจะรู้ว่าตัวเองพิมพ์อะไรไป
- `{{ticket.details}}` เป็นตัวแปรตัวเดียวที่พาข้อความที่ผู้ใช้พิมพ์เองเข้าไปใน HTML ⇒ `nl2br(e(...))` — escape กัน tag หลง และขึ้นบรรทัดใหม่ตามที่พิมพ์
- **`{{app.name}}` แทนคำว่า "the IT portal"** ที่ hardcode อยู่ 5 เทมเพลต — ดึงจาก `brand_name` ใน settings ผ่าน `globalVars()` เปลี่ยนชื่อระบบแล้วอีเมลเปลี่ยนตาม
- รายการ **Available variables** และเมนู Insert variable เรียง A-Z (เดิมเรียงตามลำดับที่เขียนโค้ด — คนอ่านกำลังหาชื่อ และการหาชื่อคือการไล่ตัวอักษร)

---

## เคสใหม่: ทีม IT ได้อีเมลด้วย + สรุปเคสค้างเช้าวันจันทร์ (2026-08-14)

กระดิ่ง "มีเคสใหม่" มีอยู่แล้วตั้งแต่แรก แต่กระดิ่งเห็นได้เฉพาะคนที่เปิดหน้าเว็บอยู่ — ซึ่งตรงกับเวลาที่เคสไม่มีคนรับพอดี

### 1. `ticket.new_case` — ส่งพร้อมกระดิ่งตอนเปิดเคส

- **ผู้รับชุดเดียวกับกระดิ่งเป๊ะ**: `tickets.resolve` + `tickets.level_<ประเภท>` ที่ตรงกับเคส และ**ไม่ส่งหาผู้แจ้งเอง** (เขารับเคสตัวเองไม่ได้อยู่แล้ว)
- เนื้อจดหมายเหมือนใบเสร็จของผู้แจ้ง บวก **`{{ticket.requester}}`** — คนที่กำลังตัดสินใจว่าจะรับเคสไหมต้องรู้ว่าใครแจ้ง (ป้ายใช้คำว่า **Requester** ตรงกับที่หน้าเว็บเรียก ไม่ใช่คำใหม่)
- `staffVars()` **จงใจไม่มี `user.first_name`** เพราะจดหมายฉบับนี้ส่งหลายคน แต่ละคนต้องถูกทักด้วยชื่อตัวเอง ⇒ ผู้เรียกเป็นคนใส่ (ถ้า reuse `ownerVars()` ตรง ๆ ทีม IT ทุกคนจะถูกทักด้วยชื่อผู้แจ้ง)

### 2. `tickets:send-weekly-digest` — จันทร์ 08:30

- **2 ตาราง ไม่ใช่ตารางเดียว** เพราะต้องทำคนละอย่างกัน: *ยังไม่มีคนรับ* (`open`) กับ *รับแล้วยังไม่ปิด* (`in_progress`)
- ตารางที่สองเป็น**ของทั้งทีม ไม่ใช่ของตัวเอง** ⇒ ต้องมีคอลัมน์ Assignee · ตารางแรกมีคอลัมน์ Requester แทน (หัวตารางใช้คำเดียวกับหน้าเว็บ)
- ทั้งสองตารางกรองด้วย **ticket level ของคนอ่าน** — ไม่ส่งแถวที่เขากดอะไรไม่ได้ให้ดู
- **ไม่มีเกณฑ์จำนวนวัน** (ต่างจากคำขอที่ใช้ 7 วัน) — เคสค้างวันเดียวก็ยังเป็นเคสค้าง · เรียงเก่าสุดขึ้นก่อน · ไม่มีอะไรค้าง = ไม่ส่ง
- `App\Support\EmailTable` **ใหม่**: ตัว render ตารางอินไลน์สไตล์ที่ digest ทุกตัวใช้ร่วมกัน (mail client ทิ้ง `<style>` ทุกกฎเลยต้องติดไปกับ element) — `RequestNotificationService` กับ `sampleVars()` ของหน้า Email Templates ย้ายมาใช้ตัวเดียวกัน พรีวิวจึงเพี้ยนจากของจริงไม่ได้อีก

### Tests / Verification

`TicketStaffNotificationTest` ใหม่ 6 ตัว: เคสใหม่ส่งหาคนที่มี level ตรง · ข้ามคนที่ level ไม่ตรง · **แต่ละฉบับทักด้วยชื่อผู้รับเอง** · สรุปรายสัปดาห์แยก 2 ตารางถูกต้องพร้อมชื่อคนถือเคส · ไม่มีสิทธิ์ `tickets.resolve` หรือไม่มี level ที่ตรง = ไม่ได้รับ · ไม่มีเคสค้าง = ไม่ส่ง — **ยืนยันด้วยการถอด level filter ทั้ง 2 จุดแล้วเห็นแดงก่อนคืนกลับ**

> เทสต์นี้สร้าง **role แยกต่อ 1 บัญชี** เพราะสิทธิ์ผูกกับ role — 2 บัญชีที่เป็น `admin` เหมือนกันจะแชร์สิทธิ์กันเงียบ ๆ และเทสต์ชุดนี้มีไว้แยกว่าใครได้อะไร

**ทั้ง suite = 994 passed / 3,851 assertions** (เดิม 985) · tsc 0 · eslint 0 · prettier · pint · `schedule:list` ยืนยัน `30 8 * * 1`

**ยังไม่ได้ทดสอบบนอีเมลจริง** — ยังไม่เคยเห็นหน้าตาสรุป 2 ตารางบนกล่องจดหมายจริง (ยังไม่ถึงเช้าวันจันทร์)

### พรีวิวโชว์ตัวแปรดิบเพราะไม่มีค่าตัวอย่าง (2026-08-14)

`{{ticket.requester}}` ขึ้นเป็นข้อความดิบในหน้าพรีวิว — ค่าตัวอย่างอยู่ข้าง controller แต่ตัวแปรอยู่ในแคตตาล็อก เพิ่มตัวแปรที่หนึ่งโดยไม่เพิ่มอีกที่ = แอดมินเห็น `{{...}}` ตรงที่ผู้รับจะเห็นชื่อคน

เขียนเทสต์ไล่**ทุกเทมเพลตมาตรฐาน** ยิง endpoint พรีวิวจริงแล้วหา `{{...}}` ที่เหลือค้าง — เจอว่าขาด **7 ตัว ไม่ใช่ตัวเดียว**: `from.name` (ticket.forwarded) · `contract.end_date` · `request.title` · `requester.name` · `actor.name` · `step.label` · `remark` ⇒ เทมเพลตกลุ่มคำขอกับสัญญาโชว์ตัวแปรดิบมาตั้งแต่ต้น เติมครบทั้ง 2 ฝั่ง (controller + chip list หน้าเว็บ ซึ่งขาด `items` ด้วย แปลว่า stock template แทรกตัวแปรนี้จากเมนูไม่ได้เลย)

**ยืนยันด้วยการถอด `ticket.requester` ออกแล้วเห็นแดงก่อนคืนกลับ** · Email/Ticket/Request suites 302 passed

### ลิงก์ในอีเมลพาไปแท็บด้วย ไม่ใช่แค่เปิด drawer (2026-08-14)

`?view=15` เปิด drawer ได้ก็จริง แต่พอปิด drawer คนอ่านจะค้างอยู่บนแท็บ default ของ role ตัวเอง (ส่วนใหญ่คือ Dashboard) ไม่ใช่รายการที่เคสนั้นอยู่ ⇒ เปลี่ยนเป็น `?tab=all&view=15` ทั้ง 4 จุดที่ประกอบ URL ฝั่ง server: อีเมลเคสใหม่ · ทุกแถวในสรุปรายสัปดาห์ · ปุ่มท้ายสรุป (`?tab=all`) · อีเมลเตือน SLA breach

### ตารางในอีเมลสรุป: ขยายกรอบ + คอลัมน์ตรงกัน + subject ยาวตัด … (2026-08-14)

จากภาพจริงที่ได้รับ: เลขใบ `TKT-2856` ตัดเป็น 2 บรรทัด · หัว "Days open" ตัดเป็น 2 บรรทัด · 2 ตารางในฉบับเดียวกันคอลัมน์ไม่ตรงกันเลย

- **กรอบอีเมล 600 → 720px** (`emails.templated`) — ตารางในสรุปมี 5 คอลัมน์ ที่ 600 ไม่พอ · กว้างกว่า reading pane ของ Outlook ซึ่งจะย่อทั้งฉบับให้พอดีไม่ใช่ตัดทิ้ง ตารางได้พื้นที่คุ้มกว่าที่เสียไป · media query ขยับตาม (620 → 740)
- **`EmailTable` เพิ่ม `$widths`** ⇒ ใส่ความกว้างที่ `<th>` (ทั้ง attribute และ inline) · 2 ตารางที่ส่ง widths ชุดเดียวกันจะเรียงตรงกันพอดี — ค่าคงที่อยู่ที่ `TicketDigestService::WIDTHS/HEADERS_OPEN/HEADERS_WORKING/NUMERIC` ที่เดียว ทั้ง service และตารางตัวอย่างในหน้าพรีวิวอ้างตัวเดียวกัน (ก่อนหน้านี้เขียนหัวตารางซ้ำ 2 ที่ เวลาแก้คำต้องไล่แก้ทั้งคู่)
- **หัวตารางกับเลขใบ `white-space:nowrap`** · เซลล์ `vertical-align:top` แถวที่มี 2 บรรทัดจะไม่ลอยกลาง
- **`EmailTable::text()`** escape + ตัดที่ 60 ตัวอักษร (ชื่อคน 32) เติม `…` — **ตัดที่ PHP ไม่ใช่ CSS** เพราะ `text-overflow:ellipsis` ไม่รอดใน Outlook (เรนเดอร์ด้วยเอนจิน Word) ตารางที่พึ่ง CSS จะสวยทุกที่ยกเว้นโปรแกรมที่คนในออฟฟิศใช้จริง

`TicketStaffNotificationTest` +1 (subject ยาวถูกตัด ไม่ใช่ wrap) · **ยืนยันบนเบราว์เซอร์**: เปิดพรีวิว `ticket.weekly_digest` จริง เห็นเลขใบ/หัวตารางอยู่บรรทัดเดียว และ 2 ตารางคอลัมน์ตรงกันแล้ว

> **`<colgroup>` ใช้ไม่ได้ในอีเมล** — เวอร์ชันแรกใส่ความกว้างผ่าน `<colgroup><col>` ผลคือ **Send test แล้วได้อีเมลหน้าขาว ไม่มีเนื้อหาเลย** (log ยืนยันว่า body ออกไปครบ 4,385 ตัวอักษร แท็กปิดครบ ⇒ ตัว sanitizer ฝั่งผู้รับทิ้งทั้งฉบับ) · เทียบไทม์ไลน์ชัด: log 70 ที่ยังไม่มี colgroup แสดงผลได้ ส่วน 71+ ขาวหมด · นอกจากนั้น Outlook (เอนจิน Word) ไม่รองรับ colgroup อยู่แล้ว แปลว่าที่คิดว่า "2 ตารางตรงกัน" ก็ไม่จริงบน Outlook ⇒ ย้ายไปใส่ `width` ที่ `<th>` ซึ่งเป็นวิธีมาตรฐานของ HTML email

### "Send test แล้วอีเมลขาว" — ไม่ใช่บั๊กของเรา (2026-08-14)

ไล่หาทีละชั้นจนหมดข้อสงสัยฝั่งเรา:

| ตรวจอะไร | ผล |
|---|---|
| body ที่บันทึกใน log | ครบ 4,349 ตัวอักษร แท็กเปิด/ปิดตรงกัน |
| MIME ที่ออกทางสาย (ส่งผ่าน log mailer แล้วอ่านดิบ) | `multipart/related` + `text/html; charset=utf-8` + `quoted-printable` ถูกต้อง |
| HTML ฉบับเต็ม (กรอบ+เนื้อ) เปิดในเบราว์เซอร์ | **แสดงผลครบทุกส่วน** |
| สมมติฐานแรก: `<colgroup>` | **ผิด** — ฉบับที่ส่งหลังเอา colgroup ออกก็ยังขาว (log 75, 76) |

เหตุผลจริง: **การส่งทดสอบซ้ำได้ข้อความเหมือนกันเป๊ะทุกตัวอักษร** กล่องจดหมายที่จัดกลุ่มตามหัวเรื่อง (Gmail) จะยัดฉบับที่ 2 เข้าไปในเธรดของฉบับแรกแล้วซ่อนเนื้อหาที่ซ้ำไว้หลังปุ่ม **"…"** ⇒ เปิดมาเห็นหน้าขาวมีจุดสามจุด · ฉบับแรกของแต่ละเทมเพลตจึงเห็นครบเสมอ ฉบับถัดไปขาวหมด

⇒ ต่อท้ายหัวเรื่องของ **การส่งทดสอบ** ด้วยเวลา `(test 17:52)` ทุกฉบับไม่ซ้ำกันอีก และคนอ่านรู้ด้วยว่ากำลังดูการกดปุ่มครั้งไหน (`EmailDeliveryLogTest` +1) — อีเมลจริงจากเหตุการณ์ในระบบไม่ถูกแตะ เพราะเนื้อหาต่างกันตามข้อมูลอยู่แล้ว

## Workflows: มี Master gate เหมือนโมดูลอื่น + ย้ายไป Administration (2026-08-17)

หน้า Permissions วางการ์ด Workflows ไว้ใน **Workspace** ข้าง Requests และมีสวิตช์เดียว (`workflows.manage`) ขณะที่ sidebar ย้ายเมนู Workflows ไปอยู่ Administration ไปแล้ว — ตำแหน่งไม่ตรงกัน และ "เข้าดูสายอนุมัติได้" กับ "แก้สายอนุมัติได้" เป็นสวิตช์เดียวกัน

- **คีย์ใหม่ `workflows.module`** เป็น master ตามแพทเทิร์นเดียวกับทุกโมดูล (`workflowHierarchy()` + `normalizeWorkflows()` เรียกต่อจาก normalize ตัวอื่นใน `RolePermissionController@update`)
- **แยกสิทธิ์อ่าน/แก้**: `GET /workflows`, `employee-options`, `position-options`, `preview` ใช้ `workflows.module` · `PUT /workflows/{id}` ใช้ `workflows.manage`
- **sidebar** เปลี่ยน gate เป็น `workflows.module` (master คุมเมนู ตามที่การ์ดบอกว่ามันคุม)
- **การ์ดย้ายไป section Administration** (`ADMIN_GROUPS`) และเปลี่ยนเป็นทรี master → group แบบเดียวกับ Contracts (`WorkflowPermissionTree`) — หัวการ์ด `Workflows access` + บรรทัด `Master · gates the module and the sidebar icon` + ลูกคือ `Edit approval workflows`
- **migration เติม `workflows.module` ให้ทุก role ที่ถือ `workflows.manage` อยู่** กันเมนูหายตอน deploy — บนฐานจริงเติม 0 แถว เพราะไม่มี role ไหนถือคีย์นี้ (มีแต่ super ที่ข้ามการเช็คอยู่แล้ว) พฤติกรรมจึงไม่เปลี่ยน

`WorkflowAdminTest` +1 (**ถือ master อย่างเดียว = เปิดหน้าได้ แต่ PUT ถูกปฏิเสธ**) · เทสต์เดิม 2 ไฟล์แก้ให้ role ทดสอบถือ master ด้วย (เทสต์เดิมยืนยันกฎเก่า) · **ทั้ง suite 998 passed / 3,921 assertions** · tsc 0 · eslint 0 · prettier · pint · **ยืนยันบนเบราว์เซอร์**: การ์ดขึ้นใน Administration นับ 2/2 หน้าตาตรงกับการ์ด Stock/Employee

## เมนูที่กดแล้วเจอ 403: route gate ไม่ตรงกับ sidebar 5 โมดูล (2026-08-25)

การแยก `workflows.module` ออกจาก `workflows.manage` รอบที่แล้วเปลี่ยน gate ครบทุกที่ **ยกเว้น route ฝั่ง React** — `App.tsx` ยังขอ `workflows.manage` ขณะที่ `nav.ts` โชว์เมนูด้วย `workflows.module` และ `GET /workflows` ยอมรับ master ⇒ role ที่ถือ master อย่างเดียว (เคสที่ `WorkflowAdminTest` เพิ่งเขียนเทสต์รองรับ) เห็นไอคอนแต่กดแล้วได้หน้า 403

ไล่เทียบทั้งสองไฟล์แล้วพบว่า**ไม่ใช่จุดเดียว — เป็น 5 โมดูล**:

| โมดูล | sidebar โชว์เมื่อ | route เดิมขอ | คนที่ตกหล่น |
|---|---|---|---|
| workflows | `workflows.module` | `workflows.manage` | ผู้ดูสายอนุมัติแบบอ่านอย่างเดียว |
| tickets | `tickets.module` · `create` · `my` | `create` · `view_all` | **พนักงานที่ถือ `tickets.my` อย่างเดียว** |
| employees | `employees.module` | `employees.view` | role ที่ได้แค่แดชบอร์ดพนักงาน |
| assets | `assets.module` | `assets.view` | role ที่ได้แค่แดชบอร์ดทรัพย์สิน |
| contracts | `contracts.module` | `contracts.view` | role ที่ได้แค่แดชบอร์ดสัญญา |

- **กฎที่ใช้แก้**: route ต้องยอมรับ**ทุก key ที่ sidebar ใช้โชว์เมนู** · กว้างกว่าได้ (เข้าทาง URL โดยไม่มีเมนูเป็นการตั้งใจ) แต่แคบกว่าคือเมนูที่กดไม่ได้เสมอ
- ปลอดภัยเพราะ**แต่ละหน้ากรองแท็บของตัวเองอยู่แล้ว** (ticket/employee/asset มี fallback เมื่อไม่มีแท็บที่ดูได้) และ `http.ts` ปล่อย 403 ให้ผู้เรียกจัดการ ไม่เด้งจอ error ทั้งแอป
- คง key เดิมไว้คู่กับ master ทุกจุด (`['x.module', 'x.view']`) เพราะ normalize บังคับ master เฉพาะตอนบันทึกสิทธิ์ — แถว role เก่าที่ถือ child โดยไม่มี master จึงไม่หลุด
- คอมเมนต์ `WorkflowController` ที่ยังเขียนว่า "routes carry permission:workflows.manage" แก้ให้ตรงกับของจริง (อ่าน = `workflows.module`, เขียน = `workflows.manage`) ทั้ง 3 จุด

### Tests / Verification

`SidebarRouteGateTest` ใหม่ 2 ตัว — parse `nav.ts` กับ `App.tsx` จากฝั่ง PHP แบบเดียวกับ `PermissionMatrixTest` (ทั้งสองฝั่งเป็นข้อมูลดิบ TypeScript จับให้ไม่ได้): ทุกเมนูต้องเปิดหน้าที่มันลิงก์ไปได้ · ทุก key ที่ใช้ gate ต้องมีอยู่จริงใน `Permissions::all()` — **ยืนยันด้วยการย้อน `workflows` กลับเป็น `manage` แล้วเห็นแดงพร้อมข้อความชี้ตัวจุดก่อนคืนกลับ**

**ทั้ง suite = 1,000 passed / 3,925 assertions** (เดิม 998) · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

> **ยังไม่ได้ทำ**: role ที่ถือ master + `view_dashboard` (ไม่มี `.view`) ตอนนี้เข้าหน้า Assets/Contracts ได้แล้วแต่จะเห็นแท็บรายการที่ว่างเปล่า เพราะ API ยังตอบ 403 ให้ list — หน้า Tickets/Employees กรองแท็บตามสิทธิ์ครบแล้ว ส่วน Assets (แท็บ Inventory/Transfers) กับ Contracts (ทั้ง 2 แท็บ) ยังไม่กรอง ถ้าจะทำให้ครบต้องกรองแท็บ + ใส่ `enabled` ให้ query รายการเหมือนหน้าอื่น

## Resign modal: เลิก Coming soon + วางใหม่เป็น 2 คอลัมน์ — อุปกรณ์ค้างของคนลาออกถูกเรียกคืนจริง (2026-08-25)

หน้าจอลาออกเขียนข้อความไว้ล่วงหน้าตั้งแต่ตอนที่โมดูล Assets ยังไม่มี — `resign_warn` บอกว่า "ขอเรียกคืนอุปกรณ์ทั้งหมด" และ `resign_assets_flagged` บอกว่า "ระบบจะตั้งสถานะอุปกรณ์เหล่านี้เป็น รอรับคืน" แต่ของจริงคือ **ป้าย Coming soon สองที่ กับ `// NOTE: ... (not yet built)` ใน `EmployeeService::resign()`** ⇒ กดลาออกแล้วอุปกรณ์ยังค้างสถานะ Deployed ในชื่อคนที่ไม่อยู่แล้ว

ชิ้นส่วนที่ต้องใช้มีครบอยู่ก่อนแล้ว งานรอบนี้คือต่อสายให้ถึงกัน:

| มีอยู่แล้ว | ใช้ทำอะไร |
|---|---|
| `GET /employees/{id}/assets` (`useEmployeeAssets`) | รายการอุปกรณ์ที่คนนั้นถืออยู่ — แท็บ Assets ในดรอเวอร์ใช้อยู่ |
| `AssetService::requestReturn()` | `deployed → pending_return` + กระดิ่งหา IT ที่ถือ `assets.receive` |
| badge sidebar ของ Assets | นับ `pending_return` อยู่แล้ว — เด้งเองไม่ต้องแตะ |

- **`AssetService::requestReturnForEmployee()`** ใหม่ — เรียกคืนทีเดียวทั้งคน: หยิบเฉพาะที่ยัง**อยู่ในมือจริง** (`deployed` · `pending_acceptance`) ส่วนที่ `pending_return` อยู่แล้วปล่อยไว้ ไม่ตีกระดิ่งซ้ำ · resolve ผู้รับกระดิ่ง**ครั้งเดียวต่อ batch** (`requestReturn()` เดิม `User::all()` ใหม่ทุกชิ้น — คนถือ 12 เครื่องคือโหลด user 12 รอบ)
- **`EmployeeService::resign()`** inject `AssetService` แล้วเรียกเมธอดข้างบน พร้อมเหตุผล `Resignation — {code}` ที่ไปโผล่ในหน้า Assets ว่าทำไมถึงถูกเรียกคืน
- **ตั้งใจไม่ใส่ gate ของ Assets ในชั้น service** — คนบันทึกลาออกถือ `employees.resign` เป็นงาน HR ไม่จำเป็นต้องมีสิทธิ์อะไรในโมดูล Assets เลย ถ้าใส่ abort ตรงนั้น การลาออกจะพังในมือคนที่ควรทำได้
- **Resign modal วางใหม่เป็น 2 คอลัมน์** (`max-w-4xl`, แบบร่างอยู่ที่ `docs/mockup/resign-dialog.html`) — ซ้ายคือสิ่งที่บันทึก ขวาคืออุปกรณ์ที่จะถูกเรียกคืนไปพร้อมกับคนนั้น **ผลลัพธ์ของการกดจึงอยู่ข้างปุ่ม ไม่ใช่ใต้ปุ่ม** ของเดิมรายการอยู่ล่างสุด คนกดเห็นปุ่มแดงก่อนเห็นว่ามีของค้างกี่ชิ้น
- **หัวคอลัมน์ซ้ายเป็นตัวตนแบบอ่านอย่างเดียว 4 ช่อง** — ชื่อ-นามสกุล · รหัสพนักงาน · ตำแหน่ง · แผนก อ่านจาก `Employee` ที่ส่งเข้ามาอยู่แล้ว (list eager-load `department`/`position` อยู่แล้ว ไม่ยิง API เพิ่ม) คำบรรยายใต้หัวเรื่องจึงกลับเป็นประโยคกลาง ๆ เพราะตัวตนย้ายลงมาอยู่ในฟอร์มครบกว่าเดิม
- **ช่อง "อุปกรณ์ที่ต้องคืน"** เป็นตัวเลขจริง (`3 รายการ`, เหลืองเฉพาะตอนมีของค้าง ไม่มีของค้าง = เทา) และกล่องเส้นประกลายเป็นรายการอุปกรณ์จริง (รุ่น · tag · serial · จุดสีตามสถานะ) **แบ่งหน้า 4 แถว** ตรึงความสูงไว้ — หน้าสุดท้ายที่ไม่เต็มจะไม่ทำให้ dialog หด
- **`Field` ได้ prop `grow`** — ช่องเหตุผลยืดกินที่ที่เหลือ คอลัมน์ซ้ายจึงจบเสมอกับแถว pager ฝั่งขวาเอง ไม่ต้องไล่แก้ `min-height` ทุกครั้งที่เพิ่มฟิลด์ (ของเดิมตั้งเป็นตัวเลขตายตัว แก้ 3 รอบระหว่างทำ mockup)
- **`DialogContent` ต้องไม่มี `overflow` เด็ดขาด** — รอบแรกผมใส่ `overflow-y-auto` ไว้กันเนื้อหาล้นจอ ผลคือ**ปฏิทินของ DateInput กลายเป็นเนื้อหาที่ต้องเลื่อนแทนที่จะลอยทับ** เหตุผล: `DateInput` portal ปฏิทินเข้าไปใน node ที่เป็น `[role="dialog"]` โดยตั้งใจ (ถ้า portal ไป `<body>` modal guard จะกินคลิกจนกดวันที่ไม่ได้) และ `DialogContent` มี `translate-x/y-[-50%]` ซึ่งทำให้มันกลายเป็น containing block ของลูกที่เป็น `position: fixed` ⇒ ปฏิทินถูกกักไว้ข้างใน พอตั้ง overflow เป็นอะไรก็ตามที่ไม่ใช่ `visible` มันจึงไปเพิ่ม scroll area แทนที่จะล้นออกมา · วัดยืนยันแล้ว: `overflow-y:auto` เลื่อนได้ 265px / `visible` `scrollTop` ค้างที่ 0 ทั้งที่ `scrollHeight` เท่ากัน · dialog อื่นที่สูงตามเนื้อหา (`department-members-dialog` ฯลฯ) ก็ใช้ `flex max-h-[Nvh] max-w-* flex-col` เปล่า ๆ ด้วยเหตุผลเดียวกัน
- **`resign_assets_flagged` ถูกลบ** — เลย์เอาต์ใหม่ไม่มีที่ให้ประโยคนี้ และแบนเนอร์เหลืองบอก "ขอเรียกคืนอุปกรณ์ทั้งหมด" อยู่แล้ว เก็บคีย์ที่ไม่มีใครใช้ไว้คือขยะ
- **fetch พังต้องไม่อ่านว่า "ไม่มี"** — `isError` แยกจาก "โหลดเสร็จแล้วว่าง" คนละข้อความ (`resign_assets_unavailable` vs `resign_assets_none`) เพราะ 403/เน็ตหลุดแล้วขึ้น "ไม่มีอุปกรณ์ค้าง" คือการรายงานข้อมูลผิดในจอที่ตัดสินใจไม่ย้อนกลับ
- `HELD_STATUS_META` ย้ายจากในไฟล์ดรอเวอร์ออกมาที่ `modules/employee/lib/held-assets.ts` — สองจอวาดแถวเดียวกัน ไม่ก๊อป

### Tests / Verification

`EmployeeResignAssetsTest` ใหม่ 5 ตัว — flag ครบทั้ง `deployed`/`pending_acceptance` พร้อมเหตุผล · ของคนอื่นกับของในคลังไม่ถูกแตะ และของที่ `pending_return` อยู่แล้วคง `last_reason` เดิม · กระดิ่งถึง IT ชิ้นละใบและไม่ถึงคนที่ไม่มีสิทธิ์รับคืน · **บัญชีทรง HR ที่ถือแค่ `employees.*` ลาออกได้และอุปกรณ์ถูกเรียกคืนจริง** (เทสต์ตัวที่กันไม่ให้เผลอใส่ gate) · คนที่ไม่ถืออะไรเลยลาออกผ่านปกติ

**ทั้ง suite = 1,005 passed / 3,940 assertions** (เดิม 1,000) · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

เปิดจอจริงในแอปที่ล็อกอินแล้ว: เคสไม่มีของค้าง (EMP-7) ขึ้น "ไม่มีอุปกรณ์ค้าง" ป้ายนับเทา · เคสมีของค้าง (EMP-14) ขึ้น "1 รายการ" ป้ายเหลืองพร้อมแถวอุปกรณ์จริง จุดสีเหลือง = รอรับคืน · เปิดปฏิทินแล้ววัดในหน้าเว็บ `overflowY: visible` · ตั้ง `scrollTop = 999` แล้วยังค้างที่ **0** (ไม่มี scroll) · ขอบล่างปฏิทิน 836px ล้ำขอบ dialog (756px) ออกมาโดยยังอยู่ในจอ (873px)

> **ยังไม่ได้ทำ**: ยังไม่มีทางกดคืนอุปกรณ์ "บางชิ้น" ตอนลาออก — เรียกคืนทั้งหมดเสมอ ถ้าจะให้เลือกได้ต้องส่ง `asset_ids` ไปกับ payload ของ resign แล้วกรองใน service · `cancelResign()` ไม่ย้อนสถานะอุปกรณ์กลับให้ (ยกเลิกลาออกแล้วต้องให้ IT กดรับคืนหรือส่งมอบใหม่เอง)

### แท็บ "คำขอ" ในดรอเวอร์พนักงาน ยุบเหลือ 1 แถวต่อหน้า (2026-08-26)

อาการที่เห็นคือ "animation แปลก ๆ ตอนสลับแท็บ Tickets กับ คำขอ" — ของจริงคือ**ตารางคำขอยุบตัว**: เฟรมแรกขึ้น 4 แถว (`1/6`) แล้วหดเหลือ 1 แถว (`1/21`) ทั้งที่พื้นที่ว่างเหลือทั้งบาน

ต้นเหตุอยู่ที่บรรทัดเดียวใน `employee-view-drawer.tsx` ที่เลือกคลาสให้กล่องเนื้อหาแท็บ:

```
tab === 'assets' || tab === 'tickets' ? 'flex flex-col p-5' : 'overflow-y-auto p-5'
```

ทั้ง Assets · Tickets · Requests เรนเดอร์ `DataTable` แบบ `fillHeight` ซึ่งคิดจำนวนแถวต่อหน้าจาก**ความสูงที่วัดได้จริง** แต่ `requests` ตกไปอยู่สาขา else ที่เป็น `display: block` ⇒ `flex-1` ของ `RequestsPane` ไม่มีผล ความสูงจึงอิงเนื้อหาแทนที่จะยืดเต็มกล่อง เกิดเป็นลูปป้อนกลับ: ตารางวัดตัวเองว่าเตี้ยลง → ลดแถว → เตี้ยลงอีก → วนจนชนพื้น `Math.max(1, …)`

- แก้โดยเติม `tab === 'requests'` เข้าไปในสาขา flex — สามแท็บที่ใช้ `fillHeight` ต้องอยู่ในสาขาเดียวกันทั้งหมด · ใส่คอมเมนต์อธิบายกลไกไว้ตรงนั้นแล้ว เพราะเป็นกับดักที่มองไม่เห็นจากตัวคลาส
- เป็นบั๊กเดิม ไม่เกี่ยวกับงาน Resign modal (diff ในไฟล์เดียวกันรอบนั้นมีแค่ย้ายค่าคงที่ `HELD_STATUS_META` ออกไปที่ `lib/held-assets.ts`)

### Tests / Verification

วัดใน DOM ของแอปจริง ก่อนแก้: กล่องแม่ `display: block` · pane สูง 118px ทั้งที่กล่อง scroll สูง 541px ⇒ 1 แถว · หลังแก้: `display: flex` · pane สูง 470px จาก 510px ⇒ **8 แถว นิ่งตั้งแต่เฟรมแรก** (`1–8 จาก 21`, `1/3`) สลับ Tickets ↔ คำขอ กลับไปกลับมาแล้วไม่ยุบ · tsc 0 · prettier · build ผ่าน

### รอบตรวจ UX ของ Resign modal — แก้ 5 จุด (2026-08-26)

ไล่เปิดจอจริงทุกสถานะ (ไทย/EN · light/dark · มีของค้าง/ไม่มี · error · keyboard) แล้วพบของที่ต้องแก้:

- **จอแคบแล้วปุ่มยืนยันหลุดนอกกล่อง กดไม่ถึง** — เป็นผลข้างเคียงจากการถอด `overflow` ออกจาก `DialogContent` เพื่อปล่อยปฏิทินรอบก่อน พอต่ำกว่า `md` คอลัมน์ซ้อนกันจนเนื้อหาเกิน `max-h` แล้วไม่มีอะไรเลื่อนได้ · วัดก่อนแก้: เนื้อหา 990px ในกล่อง 560px · `canScroll: false` · ปุ่มอยู่ต่ำกว่าก้นกล่อง 431px
  **แก้โดยย้าย scroll ลงไปหนึ่งชั้น** — ห่อแบนเนอร์+grid ด้วย `flex min-h-0 flex-1 overflow-y-auto` ให้ header/footer เป็นลูกตรงของ `DialogContent` · ปฏิทินยังลอยอิสระเพราะมัน portal เข้า `DialogContent` ซึ่งเป็น**พี่น้อง**กับตัวที่เลื่อน ไม่ได้อยู่ข้างใน (ยืนยันด้วย `parentElement === dialog` และ `scroller.contains(popper) === false`) · เพิ่ม `w-[calc(100vw-2rem)]` ให้มีขอบข้างบนมือถือ แทนที่จะชนขอบจอ
- **API ปฏิเสธแล้วจอเงียบ** — `submit()` ไม่มี try/catch และไม่มีแบนเนอร์ระดับฟอร์ม 422/500 จึงเห็นแค่ปุ่มกลับมากดได้ เหมือนไม่มีอะไรเกิดขึ้น · เพิ่ม `formError` + แบนเนอร์ `animate-shake` ตามแพตเทิร์นเดียวกับ `set-credentials-modal` (ข้อความจาก API ก่อน ตกไปที่ `resign_err_failed`)
- **ที่ว่างตายในคอลัมน์ขวา** — คนถือของชิ้นเดียวได้แถวเดียวลอยเหนือช่องว่าง ~210px · **ใส่กรอบคุมโซนทั้งก้อน** (`rounded-xl border`) แถวข้างในเลิกมีกรอบของตัวเองเปลี่ยนเป็น `divide-y` และ pager ยึดก้นแผง — ช่องว่างจึงอ่านเป็นพื้นที่ของแผง ไม่ใช่ความว่างเปล่า **คงสองคอลัมน์ไว้เหมือนเดิม**
- **`"1 items"`** — เพิ่ม `filter_item` เอกพจน์ใน common แล้วเลือกตามจำนวน (ไทยใช้ "รายการ" ทั้งคู่ ถูกอยู่แล้ว)
- **validation ไม่ย้าย focus** — ส่ง `name` ให้ `Field` แล้วเรียก `focusFirstError()` ที่ `shared/lib/utils` มีอยู่แล้ว เคอร์เซอร์จึงลงช่องแรกที่ยังไม่ได้กรอก

### Tests / Verification

วัดในแอปจริงหลังแก้: จำลองคอลัมน์เดียว + `max-h` แล้ว **ตัวเลื่อนชั้นในเลื่อนได้ 240px และปุ่มยืนยันอยู่ในกล่อง** (`btnBottom 711 ≤ boxBottom 736`) · `DialogContent` ยัง `overflow: visible` ปฏิทินลอยพ้นขอบ 38px โดยอยู่ในจอ · กดยืนยันทั้งที่ว่างเปล่า → focus ลงใน `[data-field="lastDay"]` จริง · EN ขึ้น **"1 item"** · ตรวจซ้ำทุกครั้งว่าไม่มีพนักงานถูกบันทึกลาออก (`resigned: 0`) · tsc 0 · eslint 0 · prettier · build ผ่าน

> **ยังไม่ได้ทำ**: หัวข้อ "อุปกรณ์ที่ต้องคืน" กับคำอธิบายใต้มัน "รายการอุปกรณ์ที่ต้องคืนทั้งหมด" ยังพูดเรื่องเดียวกันสองรอบ — ถ้าจะตัดควรเปลี่ยนบรรทัดล่างเป็นข้อมูลที่เพิ่มขึ้นจริง เช่น "จะถูกตั้งเป็นรอรับคืนเมื่อยืนยัน" ไม่ใช่ลบทิ้งเฉย ๆ

### แถวสุดท้ายในแผงอุปกรณ์สูงกว่าเพื่อน (2026-08-26)

หน้าที่มี 4 รายการเต็ม แถวสุดท้ายดูสูงเป็นสองเท่าของแถวอื่น วัดแล้วพบว่า**แถวสูงเท่ากันหมด (63, 63, 63, 62)** ตัวปัญหาคือกล่องรายการถือ `flex-1` จึงถูกยืดเป็น 276px ขณะที่ 4 แถวรวมเส้นคั่นกินแค่ 254px เหลือ **22px ค้างอยู่ก้นกล่อง** — และเพราะ `divide-y` ไม่วางเส้นใต้ลูกคนสุดท้าย ช่องว่างนั้นจึงไม่มีขอบมาปิด กลืนเป็นเนื้อเดียวกับแถวที่ 4

- **เลิกยืดกล่องรายการ** — ถอด `flex-1` ทั้งจากแผงและจากกล่องรายการ ความสูงแผงมาจากจำนวน slot ตรง ๆ ไม่มีเศษให้ค้าง
- **เติม slot ว่างให้ครบหน้าเสมอ** — แบบเดียวกับ filler rows ของ `DataTable` หน้าสุดท้ายที่ไม่เต็มจึงสูงเท่าหน้าเต็ม ช่องว่างถูกแบ่งเป็นช่อง ๆ มีเส้นคั่น อ่านออกว่า "ที่ว่างสำหรับรายการถัดไป" ไม่ใช่แถวยักษ์
- ทุก slot สูง `h-16` เท่ากันหมด (จริงและว่าง) · สถานะว่าง/ดูไม่ได้ใช้ `min-h-65` ให้แผงสูงเท่าหน้าเต็ม · skeleton เรนเดอร์ 4 slot ด้วย แผงจึงไม่ขยายตอนข้อมูลมาถึง

### Tests / Verification

วัดในแอปจริง: หน้า 1 (4 รายการ) กับหน้า 2 (1 รายการ + 3 slot ว่าง) ได้ `panelH` **303px เท่ากันทั้งคู่** · slot สูง **64px ทั้ง 4 ช่องทุกหน้า** · กดเปลี่ยนหน้าแล้ว dialog ไม่ขยับ · เคสไม่มีของค้างแผงสูง 260px คอลัมน์จบเสมอกัน · `resigned: 0` · tsc 0 · eslint 0 · prettier · build ผ่าน

### คอลัมน์ซ้าย–ขวาไม่จบเสมอกัน (2026-08-26)

หลังจากตรึงแผงอุปกรณ์ให้เป็นขนาดคงที่ (4 slot) แผงก็เลิกยืด ⇒ คอลัมน์ซ้ายกลายเป็นตัวกำหนดความสูงแถว textarea ที่ถือ `grow` จึงไม่มีที่ว่างให้ยืดและติดพื้น `min-h` ส่วนขวาเหลือช่องว่างใต้แผง

- **ให้ทั้งสองฝั่งมีตัวซับพื้นที่** — ซ้ายคือ textarea (`grow`) ขวาคือ `flex-1` spacer ที่วางไว้**ใต้แถวสุดท้าย เหนือ pager** ในแผง ⇒ ฝั่งไหนเตี้ยกว่าก็ยืดของตัวเองมาชนอีกฝั่ง เสมอกันทุกเคส
- **spacer อยู่นอกกล่องรายการ** ไม่ใช่ข้างใน — จุดนี้คือหัวใจ ถ้าปล่อยให้กล่องรายการยืด เศษความสูงจะไปกองใต้แถวสุดท้ายซึ่งไม่มีเส้นคั่นปิด กลายเป็นแถวสูงสองเท่าแบบเดิม
- ลด `min-h` ของ textarea จาก 32 เหลือ 24 เพื่อไม่ให้ฝั่งซ้ายดันความสูงเกินจำเป็นก่อนที่ `grow` จะได้ทำงาน
- สถานะว่าง/ดูไม่ได้ได้ `flex-1` ด้วย ข้อความจึงอยู่กึ่งกลางแผงจริง ไม่ใช่กึ่งกลางเฉพาะ `min-h` ของตัวเอง

### Tests / Verification

วัดในแอปจริงทั้งสองทรง: **EMP-14 (5 ชิ้น มี pager)** ก้น textarea กับก้นแผงห่างกัน **0px** slot สูงเท่ากันทั้ง 4 ช่อง · **EMP-15 (ไม่มีของค้าง ไม่มี pager)** ห่างกัน **0px** เช่นกัน (จากเดิมซ้ายสูงกว่า 29px) · `resigned: 0` · tsc 0 · prettier · build ผ่าน

### แถวอุปกรณ์: ย้าย Tag ลงบรรทัดสอง (2026-08-26)

เดิมแถวหนึ่งวางของสี่อย่างเรียงแนวนอน (ไอคอน · ชื่อรุ่น · tag · serial) รุ่นจึงโดนบีบจนตัดกลางชื่อ — `ThinkCentre Neo 55a 24 ...`

จัดใหม่เป็นสองบรรทัด **ซ้ายคือสิ่งที่บอกว่าเครื่องนี้คืออะไร ขวาคือรหัสที่ติดอยู่บนตัวเครื่อง**:

```
[icon]  ThinkCentre Neo 55a 24 G6            SN-123456
        ● คอมพิวเตอร์ · ใช้งานอยู่              🏷 PC001
```

- serial ขึ้นบรรทัดแรกคู่กับชื่อรุ่น · tag ลงบรรทัดสองคู่กับประเภท/สถานะ — รหัสสองตัวอยู่คอลัมน์ขวาเดียวกัน ชื่อรุ่นจึงได้ความกว้างคืนและแสดงเต็มไม่โดนตัด
- ความสูงแถวยังเป็น `h-16` เท่าเดิม ไม่กระทบจำนวน slot ต่อหน้าหรือความสูงแผง

### Tests / Verification

วัดในแอปจริง: slot สูง **เท่ากันทั้ง 4 ช่อง** · ก้น textarea กับก้นแผงห่างกัน **0px** เหมือนเดิม · ชื่อรุ่นแสดงเต็ม `ThinkCentre Neo 55a 24 G6` ไม่มี ellipsis · `resigned: 0` · tsc 0 · eslint 0 · prettier · build ผ่าน

### hover ลบสีแดงของช่องที่กรอกผิด (2026-08-26)

ตรวจ hover ของ input ในจอลาออกแล้วพบว่า **ช่องที่ติด error พอเอาเมาส์ชี้ กรอบเปลี่ยนจากแดงเป็นน้ำเงิน** ทั้งที่ข้อความ error ใต้ช่องยังแดงอยู่ — สัญญาณว่า "ช่องนี้ยังไม่ผ่าน" หายไปทันทีที่ผู้ใช้เอาเมาส์ไปหา ซึ่งเป็นจังหวะที่เขากำลังจะแก้พอดี

สาเหตุอยู่ที่ specificity ใน `Field`: คลาส error เป็น descendant selector `[&_textarea]:border-destructive` → `.wrapper textarea` = (0,1,1) ส่วนคลาสของตัวคอนโทรลเองคือ `hover:border-brand/50` → `.hover\:border-brand\/50:hover` = (0,2,0) ⇒ **hover ชนะ** (ไฟล์นี้มี `focus:` override ไว้อยู่แล้วด้วยเหตุผลเดียวกัน แต่ลืม `hover:`)

- เติม `[&_input]:hover:` · `[&_textarea]:hover:` · `[&_select]:hover:` · `[&_button]:hover:border-destructive` เข้าไปในชุดคลาส error ⇒ (0,2,1) ชนะ hover ของคอนโทรล
- แก้ที่ `shared/components/field.tsx` จุดเดียว ทุกฟอร์มในแอปที่ใช้ `Field` ได้ผลตามไปด้วย
- อัปเดตคอมเมนต์เหนือบล็อกให้บอกว่าทั้ง `hover:` และ `focus:` ต้องอยู่ ไม่ใช่แค่ `focus:`

### Tests / Verification

วัดค่า `borderColor` จริงในเบราว์เซอร์ · ก่อนแก้: textarea ที่ติด error + hover = `oklab(… /0.5)` (brand 50%) · หลังแก้ = `rgb(220, 40, 40)` (destructive) · ยืนยันว่า hover ปกติ (ไม่มี error) ยังเป็น brand 50% เหมือนเดิม ไม่ได้ถูกกลบ · ช่องวันที่แดงถูกต้องทั้งก่อนและหลัง · `resigned: 0` · tsc 0 · prettier · build ผ่าน

### เงา focus ของช่องกรอกโดนตัด 3 ด้าน (2026-08-26)

ต่อจากรอบที่ย้าย scroll ไปไว้ที่ตัวห่อชั้นในเพื่อกันปุ่มยืนยันหลุดจอ — ตัวห่อนั้นใช้ `overflow-y-auto` ซึ่ง **เบราว์เซอร์บังคับให้แกน x กลายเป็น clip ตามไปด้วย** (`overflowX: auto`) และช่องกรอกทั้งสองวางชิดขอบกล่องนั้นพอดี วัดได้ `leftGap: 0` · `bottomGap: 0` ⇒ วงแหวน focus `ring-[3px]` ที่วาด**นอก**กรอบช่องเลยถูกเฉือนทั้งซ้าย ขวา และล่าง

- แก้ด้วย `-mx-2 -mb-2` คู่กับ `px-2 pb-2` บนตัวที่เลื่อน — margin ติดลบขยายกล่อง clip ออกไป 8px ส่วน padding ดันเนื้อหากลับที่เดิม **เลย์เอาต์ไม่ขยับสักพิกเซล แต่วงแหวนมีที่ให้วาด**
- ไม่ใช้วิธีใส่ padding เฉย ๆ เพราะจะดันทั้ง body เข้ามา 8px ทำให้หัวข้อกับแบนเนอร์ไม่ตรงแนวกับหัวเรื่องและปุ่มท้าย dialog

### Tests / Verification

วัดในแอปจริง — ก่อนแก้: `leftGap 0` · `bottomGap 0` (วงแหวน 3px ไม่มีที่) · หลังแก้: `leftGap 8` · `bottomGap 8` · ระยะจากก้นช่องเหตุผลถึงปุ่มท้ายยังเป็น **16px เท่าเดิม** (เลย์เอาต์ไม่ขยับ) · โฟกัสช่องวันที่แล้วอ่าน `box-shadow` ได้ `0 0 0 3px` ครบวง · ซูมดูขอบซ้ายทั้งสองช่องแล้วเงาไม่ขาด · `resigned: 0` · tsc 0 · prettier · build ผ่าน

### Access: การ์ดกับรายการนับคนละหน่วย และมองไม่เห็นเจ้าของที่ลาออก (2026-08-26)

ทดสอบให้พนักงานลาออกจริง (EMP-14 ถือ membership 3 และเป็นเจ้าของ resource อีก 2) แล้วเปิดหน้า Access พบสองเรื่องใน `AccessService::dashboard()` เมธอดเดียวกัน:

**1. การ์ดนับคน รายการนับสิทธิ์** — `resigned_holders` ใช้ `$resignedGrants->unique('employee_id')->count()` (นับ**คน** = 1) ส่วน drill-down ส่ง `$resignedList` ที่เป็นแถวละ grant (= 3) จอเดียวกันเลยขึ้นเลขสองค่า แถวอื่นบนการ์ดนี้ (`empty_resources`, `no_owner`) นับ**รายการที่ต้องแก้**ทั้งหมด ⇒ แก้ให้แถวนี้นับรายการเหมือนกัน

**2. เห็นแต่ member ไม่เห็น owner** — คิวรีดูแค่ตาราง `access_memberships` แต่ resigned staff ยัง**เป็นเจ้าของ** EmailGroup / FileShare ได้ผ่าน `owner_employee_id` ซึ่งไม่ใช่แถว membership จึงไม่โผล่เลย ทั้งที่เป็นครึ่งที่เร่งกว่า — resource มีผู้ดูแลระบุชื่อไว้แต่คนนั้นไม่อยู่แล้ว

- เพิ่มคิวรีฝั่งเจ้าของ (`whereHas('owner', status = resigned)` ทั้ง FileShare และ EmailGroup) รวมเข้ากับรายการเดิม **เรียงเจ้าของขึ้นก่อน** เพราะ resource ที่ไม่มีคนดูแลสำคัญกว่าสิทธิ์ที่แค่ยังเปิดค้าง
- แต่ละแถวพก `role` (`owner` / `member`) เพราะ**วิธีแก้ต่างกัน** — เจ้าของต้องเปลี่ยนมือ ส่วน member ต้องถอนสิทธิ์ · drill-down จึงขึ้น "เจ้าของคือ …" กับ "ถือสิทธิ์โดย …" คนละบรรทัด
- เปลี่ยนชื่อแถวจาก "พนักงานลาออกที่ยังถือสิทธิ์" เป็น **"สิทธิ์ค้างของพนักงานที่ลาออก"** เพราะตอนนี้ตัวเลขคือจำนวนรายการ ไม่ใช่จำนวนคน — ป้ายกับหน่วยต้องพูดเรื่องเดียวกัน (คำอธิบายใต้แถวครอบทั้งสองวิธีแก้)

### Tests / Verification

`AccessResignedGovernanceTest` ใหม่ 5 ตัว — คนเดียวถือ 3 grant ต้องได้เลข 3 ไม่ใช่ 1 · resource ที่เจ้าของลาออกต้องขึ้นในรายการพร้อม `role: owner` · แถวเจ้าของมาก่อนแถว member · คนที่ยังอยู่ไม่ทำให้เกิดรายการ · grant ที่ถอนแล้วไม่นับ

ของจริงในแอปหลังแก้: การ์ดขึ้น **5** ตรงกับ drawer **5** (เจ้าของ 2 + member 3) · `Folder1` และ `ทดสอบ email Group 1` ขึ้นบนสุดพร้อม "เจ้าของคือ ทดสอบเพิ่มพนักงาน test" · **ทั้ง suite = 1,010 passed / 3,957 assertions** (เดิม 1,005) · tsc 0 · prettier · pint · build ผ่าน

> **แก้แล้วในรอบถัดไป** (ดูหัวข้อล่าง): แถวผู้ดูแลถูกจัดใหม่ให้ครอบทั้ง "เจ้าของลาออก" และ "ไม่มีเจ้าของ"

### Access: จัดกลุ่มแถวใหม่ตาม "กดแล้วต้องไปทำอะไร" (2026-08-26)

รอบก่อนแก้ตัวเลขให้ตรงกันแล้ว แต่ยังเหลือปัญหาที่ลึกกว่า — แถวในการ์ดจัดกลุ่มคนละเกณฑ์กัน แถว "สิทธิ์ค้างของพนักงานที่ลาออก" จัดตาม**ใคร** (คนที่ลาออก) จึงมีทั้งงานถอนสิทธิ์และงานเปลี่ยนเจ้าของปนกัน ส่วนแถวผู้ดูแลจัดตาม**อะไร** (resource) แต่ดูแค่ว่ามีชื่อเจ้าของไหม ไม่ได้ดูว่าคนนั้นยังอยู่ไหม จึงขึ้นติ๊กเขียวทั้งที่เจ้าของลาออกไปแล้ว

จัดใหม่โดยยึด **"กดแล้วต้องไปทำอะไร" เป็นเกณฑ์เดียว** — หนึ่งแถว = หนึ่งวิธีแก้ ไม่มีรายการซ้ำข้ามแถว:

| แถว | ครอบคลุม | วิธีแก้ |
|---|---|---|
| 🔴 สิทธิ์ค้างของพนักงานที่ลาออก | membership ที่ยังเปิดค้าง | ถอนสิทธิ์ |
| 🔴 Resource ที่ต้องหาผู้ดูแล | เจ้าของลาออก **+** ไม่มีเจ้าของ | หาคนมารับช่วง |
| 🟡 Resource ที่ยังไม่มีสมาชิก | ไม่มีใครเข้าถึงเลย | ตรวจว่ายังต้องใช้ไหม |

- แถวผู้ดูแลรวมสองเหตุที่ปลายทางเหมือนกันไว้ด้วยกัน แต่ละแถวใน drill-down พก `reason` (`resigned` / `none`) จึงยังบอกได้ว่ามาจากทางไหน — "เจ้าของลาออกแล้ว - ชื่อ" กับ "ยังไม่มีเจ้าของ" · เรียงเคสที่มีชื่อให้ส่งต่อขึ้นก่อน
- ยกระดับแถวผู้ดูแลเป็นสีแดง (เดิมเหลือง) เพราะ resource ที่ไม่มีคนรับผิดชอบไม่ใช่แค่ข้อมูลไม่ครบ · เปลี่ยนไอคอนเป็น `ShieldAlert`
- `owners_complete` เปลี่ยนความหมายจาก "มีชื่อเจ้าของครบ" เป็น **"มีเจ้าของที่ยังทำงานอยู่ครบ"** ติ๊กเขียวจึงพูดความจริง

### Tests / Verification

`AccessResignedGovernanceTest` ปรับเป็น 5 ตัวตามโครงใหม่ — คนเดียวถือ 3 grant ได้เลข 3 · resource ที่เจ้าของลาออกไปอยู่คิวหาผู้ดูแล (ไม่ใช่คิวถอนสิทธิ์) และทำให้ `owners_complete` เป็น false · เจ้าของลาออกกับไม่มีเจ้าของอยู่แถวเดียวกันโดยแยกด้วย `reason` และเคสที่มีชื่อมาก่อน · คนที่ยังอยู่ไม่ทำให้เกิดรายการและติ๊กเขียวคงอยู่ · grant ที่ถอนแล้วไม่นับ

ของจริงในแอป: การ์ดขึ้น **3 / 3 / 2** ตรงกับ drawer ทั้งสามกลุ่มพอดี · **ทั้ง suite = 1,010 passed / 3,962 assertions** · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

### รอบตรวจดีไซน์ drawer "รายการที่ต้องตรวจสอบ" — แก้ 6 จุด (2026-08-26)

**1. สีของบรรทัดเหตุผลผูกกับ "มีชื่อคนไหม" ไม่ใช่ความรุนแรง** — เงื่อนไขคือ `item.employee ? toneText : muted` ยังไม่เห็นผลเพราะบังเอิญไม่มี resource ที่ "ไม่มีเจ้าของ" เลย แต่พอมีเมื่อไหร่ แถวนั้นจะเป็น**สีเทาอยู่ในกล่องสีแดง** ข้าง ๆ แถวแดง ทั้งที่เป็นงานชนิดเดียวกัน — แก้โดยให้บรรทัดเหตุผล**เป็นสีกลางทุกกลุ่ม** ความรุนแรงเป็นหน้าที่ของรางซ้าย ส่วนน้ำหนักไปลงที่**ชื่อคน** แทน (label เทา + ชื่อ foreground/medium)
**2. คิวงานไม่มีลำดับที่แน่นอน** — คิวรี grant ไม่มี `ORDER BY` เลย ลำดับแถวขึ้นกับ DB · เรียงตามคนแล้วตามชื่อ resource คิวจึงไม่สลับตำแหน่งทุกครั้งที่เปิด
**3. ไอคอนกับ pill ประเภทพูดซ้ำกัน** — ชิปไอคอนซ้ายใช้สีเดียวกับ pill "File Shares" และบอกเรื่องเดียวกัน · ตัด pill ทิ้ง ชื่อ resource ได้ความกว้างคืน (เดิม `ทดสอบ mail Group Manager` เกือบชนขอบ)
**4. ความรุนแรงเข้ารหัส 3 ที่** (ราง + ไอคอน + badge) — ทำ badge ให้เป็นกลาง เหลือราง+ไอคอนที่อยู่ติดกันอ่านเป็นชุดเดียว · **จำนวนคือข้อมูล ไม่ใช่คำเตือน**
**5. dark mode คอนทราสต์ต่ำ** — บรรทัดเหตุผลสีแดง 12px บนพื้นเกือบดำเป็นข้อความที่อ่านยากที่สุดในแผง · หายไปเองจากข้อ 1
**6. copy** — ตัดศัพท์ราชการ "ธรรมาภิบาล" ออกจาก empty state พูดตรง ๆ ว่าอะไรเรียบร้อย · เปลี่ยนตัวคั่นจาก `-` (อ่านเหมือนช่วง) เป็น `·` · ตัด "กำหนดได้จากหน้าจัดการ" ทิ้งเพราะซ้ำกับลูกศรที่บอกอยู่แล้วว่ากดเข้าไปได้

### Tests / Verification

เพิ่ม `test_the_revoke_queue_has_a_stable_order` — สร้างข้อมูลสลับลำดับตั้งใจ แล้วยืนยันว่าออกมาเรียงตามคนและตามชื่อ (ถ้าเรียงถูกโดยบังเอิญจาก DB เทสต์นี้จะไม่จับ) · **ทั้ง suite = 1,011 passed / 3,965 assertions** · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

> **ยังไม่ได้ทำ**: drawer เป็นคิวงานที่**ทำงานในตัวเองไม่ได้** — ทุกแถวกดแล้วปิด drawer พาไปหน้าจัดการ เคลียร์ 5 รายการ = เปิด-ปิด 5 รอบ และไม่มีร่องรอยว่าทำอันไหนไปแล้ว ถ้าจะให้เป็นคิวจริงต้องมีปุ่มลงมือในแถว (ถอนสิทธิ์ได้เลย) ซึ่งเป็นงานคนละขนาด

### Access: ถอนสิทธิ์ได้จาก drawer เลย ไม่ต้องเด้งออกไปทีละรายการ (2026-08-26)

drawer "รายการที่ต้องตรวจสอบ" ตั้งชื่อและเรียงลำดับเหมือนคิวงาน แต่โครงจริงเป็นสารบัญลิงก์ — ทุกแถวกดแล้ว**ปิด drawer** พาไปหน้าจัดการ เคลียร์ 5 รายการ = เปิด-ปิด 5 รอบ และไม่มีร่องรอยว่าทำอันไหนไปแล้ว

- **ปุ่ม "ถอนสิทธิ์" ในแถว เฉพาะกลุ่มสิทธิ์ค้าง** — กลุ่มนี้วิธีแก้เป็นคลิกเดียวไม่ต้องเลือกอะไร ส่วนกลุ่ม "ต้องหาผู้ดูแล" ต้องเลือกคน จึงยังพาไปหน้าจัดการเหมือนเดิม (แถวหนึ่งมีสองปุ่ม: เปิด resource กับถอนสิทธิ์ — ห่อด้วย div เพราะซ้อน `<button>` ใน `<button>` ไม่ได้)
- **เรียกผ่าน endpoint เดิมของแต่ละทะเบียน** (`/{kind}/{id}/members/{membership}/revoke`) ไม่สร้าง endpoint รวม เพราะแต่ละอันมี gate ของตัวเอง (`access.email_edit` ฯลฯ) — endpoint รวมคือการเปิดทางข้าม gate · ฝั่ง UI ซ่อนปุ่มด้วย `canEdit[kind]` ชุดเดียวกับที่หน้า Access ใช้อยู่แล้ว
- backend ส่ง `membership_id` มากับแถว (เดิมมีแค่ `resource_id` จึงถอนไม่ได้)
- **ข้อความ confirm เดิมโกหก** — variant `danger` ขึ้นค่าเริ่มต้นว่า "ลบข้อมูลนี้? การลบนี้ถาวรและไม่สามารถย้อนกลับได้" ทั้งที่เป็น soft-revoke และเพิ่มสมาชิกกลับได้ · override เป็น "ถอนสิทธิ์นี้? คนนี้จะเข้าถึง Resource นี้ไม่ได้อีก เพิ่มกลับได้ภายหลังจากหน้าจัดการ" + ไอคอน `UserMinus` + ปุ่ม "ถอนสิทธิ์"
- toast `access_member_removed` เปลี่ยนจาก "ลบสมาชิกแล้ว" เป็น **"ถอนสิทธิ์แล้ว"** และไอคอนจากถังขยะเป็นคน — คีย์นี้ `members-drawer` ใช้ร่วมและทำสิ่งเดียวกันเป๊ะ (soft-revoke) จึงถูกขึ้นทั้งสองที่

### Tests / Verification

ทดสอบวงจรเต็มในแอปจริง: กดถอนสิทธิ์ `Folder2` ของพนักงานที่ลาออก → confirm ขึ้นชื่อคนและชื่อ resource → กดยืนยัน → **แถวหายจากคิว (3→2) · การ์ดลดตาม · toast "ถอนสิทธิ์แล้ว" · drawer ยังเปิดค้างทำงานต่อได้** · knock-on ที่ถูกต้อง: `Folder2` เด้งไปโผล่กลุ่ม "ยังไม่มีสมาชิก" ทันที (3→4) เพราะเป็นสมาชิกคนสุดท้าย · **ทั้ง suite = 1,011 passed / 3,965 assertions** · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

### กระดิ่งเมื่อคนลาออกยังถือสิทธิ์อยู่ (2026-08-27)

ตอนกดลาออก ระบบเรียกคืนอุปกรณ์และเตือน IT ให้ปิดบัญชี แต่**ไม่มีอะไรบอกเรื่องสิทธิ์เลย** — grant ที่ยังเปิดค้างและ resource ที่คนนั้นเป็นเจ้าของ นอนรออยู่จนกว่าจะมีคนบังเอิญเปิดหน้า Access เอง

- **`AccessOffboardingNotification` ใหม่ — หนึ่งใบต่อการลาออก ไม่ใช่ใบต่อรายการ** คนถือ 5 อย่างคือข่าวชิ้นเดียวและงานทริปเดียว ส่ง 5 ใบคือถล่มกระดิ่งเพื่อบอกเรื่องเดิม ส่วนการไล่ทีละอันมี drawer "รายการที่ต้องตรวจสอบ" รับหน้าที่อยู่แล้ว
- **`AccessService::outstandingFor()`** นับ grant ที่ยังเปิด + resource ที่เป็นเจ้าของ — ตัวเลขชุดเดียวกับที่การ์ดใช้ กระดิ่งกับการ์ดจึงเถียงกันเองไม่ได้ · payload แยก `grants` / `owned` ไม่ใช่แค่ยอดรวม เพราะถอนสิทธิ์กับหาเจ้าของใหม่เป็นคนละงาน
- **ส่งถึงคนที่ถือ `access.*_edit` อย่างน้อยหนึ่งทะเบียน** ไม่ใช่ทุกคนที่เห็นหน้า Access — ทั้งถอนสิทธิ์และเปลี่ยนเจ้าของต้องใช้ edit ส่ง viewer ไปก็ได้แค่ to-do ที่ทำไม่ได้ · ไม่ส่งให้คนที่กดลาออกเอง
- **ไม่ค้างอะไรเลย = ไม่ส่ง** — กระดิ่งที่เตือนเรื่องความว่างเปล่าสอนให้คนเลิกอ่านถาด
- **ไม่ถอนสิทธิ์ให้อัตโนมัติ** คงกฎเดิมของระบบที่ว่า IT ลงมือเองเสมอ (เหตุผลเดียวกับที่คำขออนุมัติแล้วไม่ auto-grant) กระดิ่งแค่ทำให้งานถูกรับรู้
- ฝั่ง UI: `moduleOf()` เดิมไม่รู้จัก prefix `access` จึงตกไปกอง `employees` — เพิ่มสาขาให้ · เพิ่มแท็บ Access ใน dropdown (มี `shownTabs` ซ่อนแท็บว่างอยู่แล้ว จึงไม่รกตอนไม่มีของ) · ไอคอน `ShieldAlert` สีแดง กดแล้วเข้า `/access`

### Tests / Verification

`AccessOffboardingNoticeTest` ใหม่ 7 ตัว — ส่งถึงคนที่แก้ได้ · ถือ 5 อย่างยังได้ใบเดียวและ payload แยก 3/1/4 ถูกต้อง · viewer ที่แก้ไม่ได้ไม่ได้รับ · ไม่มีของค้างไม่ส่ง · grant ที่ถอนแล้วไม่นับ · เป็นเจ้าของอย่างเดียวก็พอให้ส่ง · คนกดลาออกเองไม่ได้รับ · **ทั้ง suite = 1,018 passed / 3,980 assertions** (เดิม 1,011) · tsc 0 · eslint 0 · prettier · pint · build ผ่าน

> **ยังไม่ได้ทำ**: อีเมล — ตกลงกันว่าเอาแค่กระดิ่งก่อน · แคตตาล็อกยังไม่มี `employee.resigned` (และการคืนทรัพย์สินก็เป็นกระดิ่งล้วนเหมือนกัน ไม่มีอีเมล) ถ้าจะทำควรเป็นฉบับเดียวสรุปทั้งสิทธิ์และอุปกรณ์ ไม่ใช่แยกตามโมดูล

### การ์ดสิทธิ์: เลิกใช้ grid มาใช้ columns (2026-08-27)

การ์ดในหน้า Permission สูงไม่เท่ากันมาก — Workflows มีแถวเดียว ส่วนพนักงานมี 18 แถว ต่างกัน 3.5 เท่า แต่ grid ใช้ `align-items: stretch` เป็นค่าเริ่มต้น ⇒ **การ์ดในแถวเดียวกันถูกยืดให้สูงเท่าตัวที่สูงกว่า เหลือช่องว่างเปล่าในกรอบตัวเอง** ซึ่งอ่านว่า "เนื้อหาหายไป" ไม่ใช่ "โมดูลนี้เล็ก"

- เปลี่ยนเป็น `columns-1 md:columns-2` + `[&>*]:mb-4 [&>*]:break-inside-avoid` — แต่ละการ์ดสูงเท่าเนื้อหาตัวเอง ตัวถัดไปอัดชิดขึ้นมา · ลำดับการอ่านยังเป็นลำดับเดิม (บนลงล่างในคอลัมน์แรก แล้วขึ้นคอลัมน์ถัดไป)
- `gap` ในโหมด column คุมเฉพาะระยะห่างระหว่างคอลัมน์ ระยะแนวตั้งจึงต้องใช้ `mb` · `break-inside` กันการ์ดถูกผ่ากลางคอลัมน์
- ใช้ `[&>*]` เพราะการ์ดถูก return ตรง ๆ จาก map (แพตเทิร์นเดียวกับ `[&>*]:min-w-0` ใน `dialog.tsx`) ไม่ต้องห่อ div เพิ่มทีละใบ

### Tests / Verification

วัดด้วยหน้าเทียบที่จำลองความสูงจริงของทั้ง 7 การ์ด (session แอปหลุด เข้าหน้า Permission ไม่ได้) — **grid**: คำขอเหลือช่องว่าง 147px · คลังอะไหล่ 181px · สัญญา 27px · ความสูงรวม 2,180px · **columns**: ทุกใบช่องว่าง = 0 · ความสูงรวม **1,746px (สั้นลง 20%)** · ลบหน้าเทียบทิ้งแล้ว · tsc 0 · prettier · build ผ่าน (ยืนยันว่า `columns-2` และ `break-inside-avoid` ถูก emit ลง CSS จริง)

> **ยังไม่ได้ยืนยัน**: ยังไม่ได้เห็นในหน้า Permission ของแอปจริง เพราะ session ในเบราว์เซอร์ล็อกเอาต์

### ไอคอนบนหัวการ์ดสิทธิ์ + รวมหัวการ์ดเป็นตัวเดียว (2026-08-27)

หัวการ์ดถูกเขียนซ้ำอยู่ **9 ที่** (tree 8 ไฟล์ + `CardHeader` ในตัวการ์ด Administration) บวก fallback ในหน้าอีกทรงหนึ่ง การใส่ไอคอนแบบก๊อปไปทีละไฟล์คือการต่ออายุความซ้ำนั้น

- `PermissionCardHeader` ใหม่รับ `module` แล้วหาไอคอนเอง — **ใช้ไอคอนชุดเดียวกับ sidebar** (`nav.ts`) การ์ดกับเมนูที่มันคุมจึงเป็นของสิ่งเดียวกันในสายตา · ลบ `CardHeader` ที่ซ้ำใน `module-permission-card.tsx` ทิ้ง
- fallback card (ตอนนี้ยังใช้จริงกับ `email_templates` และ `reports`) จัดโครงใหม่ให้ใช้หัวเดียวกัน — เดิมเป็น `p-3.5` ทั้งใบไม่มีเส้นคั่น ทำให้หัวการ์ดสองแบบไม่ตรงกัน
- **ไอคอนอยู่สีเทาเสมอ แม้โมดูลจะเปิดสิทธิ์แล้ว** — ตัวนับข้างขวาบอกสถานะนั้นอยู่แล้ว (เปลี่ยนเป็นสีแบรนด์เมื่อ > 0) ใส่สัญญาณที่สองซ้ำเรื่องเดิมทำให้การ์ดดังขึ้นโดยไม่ได้บอกอะไรเพิ่ม ไอคอนคือ "นี่คือโมดูลอะไร" ไม่ใช่ "เปิดอยู่ไหม"

### Tests / Verification

เทียบรายชื่อด้วยสคริปต์: โมดูลที่เรนเดอร์เป็นการ์ดจริง 12 ตัว (workspace 7 + admin 5) **มีไอคอนครบทุกตัว ไม่มีตัวไหนเกิน** · grep ยืนยันไม่เหลือหัวการ์ดที่เขียนเองนอก `permission-card-header.tsx` · tsc 0 · eslint 0 · prettier · build ผ่าน

> **ยังไม่ได้ยืนยัน**: ยังไม่ได้เห็นในหน้า Permission ของแอปจริง เพราะ session ในเบราว์เซอร์ล็อกเอาต์

### คำศัพท์ในผังสิทธิ์: Workflow / Dashboard (2026-08-27)

ไฟล์ `lang/th/workflow.ts` ตั้งกติกาไว้ตั้งแต่ตอนสร้างโมดูลว่า **ชื่อโมดูลใช้ "Workflow" ตรง ๆ ส่วน "สายอนุมัติ / สายบังคับบัญชา" สงวนไว้ให้หมายถึง "ลำดับคนที่อนุมัติจริง" เท่านั้น** แต่ `lang/th/permission.ts` ไม่ได้อัปเดตตามตอนนั้น การ์ดสิทธิ์จึงยังเรียกโมดูลว่า "สายอนุมัติ"

- `perm_mod_workflows` · `perm_act_workflows.module` · `perm_act_workflows.manage` เปลี่ยนเป็น Workflow · แก้ "หน้า Workflow**s**" เป็นเอกพจน์ให้ตรงกับที่อื่นทั้งแอป
- **คงคำว่า "สายอนุมัติ" ไว้ใน `perm_desc_workflows.module`** — ประโยคนั้นหมายถึงลำดับผู้อนุมัติจริงของคำขอแต่ละประเภท ซึ่งเป็นความหมายที่กติกาสงวนไว้พอดี
- `perm_act_assets.view_dashboard` เป็นตัวเดียวใน 5 โมดูลที่ยังเขียน "แดชบอร์ด" — Ticket / สัญญา / คลัง / พนักงาน ใช้ "Dashboard" กันหมดแล้ว แก้ให้ตรงกัน

**ไม่แตะ** ประโยคใน `employee.ts` และ `requests.ts` ที่ใช้คำว่า "สายอนุมัติ" (เช่น "สายอนุมัติของคุณยังไม่ได้ตั้งผู้บังคับบัญชา") — ทั้งหมดพูดถึงลำดับคนอนุมัติของพนักงานคนนั้นจริง ๆ ไม่ได้เรียกชื่อโมดูล การแทนที่ทั้งไฟล์จะทำให้ประโยคเหล่านี้ผิดความหมาย

### Tests / Verification

grep ยืนยันว่าไม่เหลือ "แดชบอร์ด" ในไฟล์ และ "สายอนุมัติ" เหลือแค่จุดเดียวที่ตั้งใจคงไว้ · tsc 0 · prettier · build ผ่าน

> **ยังไม่ได้ยืนยัน**: `req_col_workflow: 'สายอนุมัติ'` ใน `requests.ts` เป็นหัวคอลัมน์ที่แสดง**ชื่อ workflow ที่ใช้** ไม่ใช่ลำดับคน — ตามกติกาน่าจะเป็น "Workflow" แต่ไม่ได้อยู่ในรายการที่สั่ง จึงยังไม่แตะ

### Workflow Seeder: ให้ตรงกับที่ใช้งานจริง (2026-08-27)

`DefaultWorkflows` เป็นเทมเพลตกลางจากไดอะแกรมตอนออกแบบ ส่วนของจริงถูกแอดมินแก้ไปหลายจุดแล้ว ⇒ ติดตั้งใหม่จะได้เส้นทางที่ต้องมานั่งแก้ซ้ำอีกรอบ เทียบทีละช่องกับ DB แล้วพบ 5 จุดที่ต่าง:

| | เทมเพลตเดิม | ของจริง |
|---|---|---|
| ชื่อ workflow (ทั้ง 11) | อังกฤษ (`Email Group Access`) | **ไทย** (`คำขอสิทธิ์เข้าใช้งาน Email Group`) |
| ป้ายขั้นแรก | `Supervisor / Head` | **`Supervisor`** |
| รุ่น executive | Vice President + Director | **Vice President เท่านั้น** |
| `email` | Department Manager → IT (2 ขั้น) | **Supervisor → Manager → VP → IT (4 ขั้น)** |
| `recovery` | Resource Owner → IT | **Supervisor → IT** (และรับเฉพาะตำแหน่ง `Supervisor` ไม่ใช่ทั้งรุ่น) |

- **ตรวจก่อนว่า Director ไม่ได้หายไปจากระบบ** — ตำแหน่งมีอยู่จริงในตาราง positions แปลว่าการที่ขั้น VP เหลือชื่อเดียวเป็นการตั้งใจแก้ ไม่ใช่ผลข้างเคียงตอน seed (seeder ข้ามตำแหน่งที่ไม่มีเงียบ ๆ) · ถ้าไม่เช็คตรงนี้จะบันทึกความบังเอิญเป็นค่าตั้งต้น
- `recovery` ตั้งรายการตำแหน่งไว้ในตัวมันเอง ไม่ใช้ `RUNGS['supervisor']` เพราะแคบกว่ารุ่นโดยตั้งใจ
- **ไม่แตะ migration `create_workflow_step_positions`** ที่ map ป้ายเดิม (`Supervisor / Head`, `Department Manager`) — migration รันไปแล้ว แก้ย้อนหลังจะทำให้ install ที่รันไปแล้วกับที่รันใหม่ได้ผลต่างกัน

### Tests / Verification

เขียนสคริปต์เทียบ `DefaultWorkflows::all()` กับ DB ทีละช่อง (ชื่อ · auto_ticket · ลำดับขั้น · actor_type · label · kind · ตำแหน่งของทุกขั้น) → **MATCH ครบทั้ง 11 workflow** · เทสต์ 2 ตัวที่อ้างป้าย `Supervisor / Head` ของ seeder (`WorkflowAdminTest`, `RequestResolutionTest`) แก้ตามป้ายใหม่ · **ทั้ง suite = 1,029 passed / 4,008 assertions** · pint ผ่าน

### ลำดับประเภทคำขอ: ให้ทุกจอเรียงเหมือนกัน (2026-08-27)

หน้า Workflow เรียงด้วย `orderBy('request_type')` — **เรียงตามตัวอักษรของ key ภายใน** จึงได้ Computer ติดกับ Email และ Hardware อยู่หลัง Fileshare ซึ่งไม่ได้สื่ออะไรกับคนอ่าน ส่วน enum `RequestType` มีลำดับที่ตั้งใจไว้อยู่แล้ว (อุปกรณ์ → บัญชี/สิทธิ์ → เบ็ดเตล็ด → `other` ปิดท้าย) แต่ไม่มีใครใช้

เทียบกับลำดับที่ขอแล้วพบว่า**ต่างกันแค่ตำแหน่งเดียว** — `mailgroup` ย้ายจากลำดับ 7 ไปอยู่หลัง `recovery` ที่เหลือตรงกันหมด

- **ให้ `WorkflowController::index()` เรียงตามลำดับ case ของ enum** แทนการ sort คอลัมน์ · เรียงใน PHP เพราะรายการมีแค่ประเภทละแถว ไม่มีอะไรได้เพิ่มจากการทำใน SQL
- ลำดับนี้ถูกเก็บไว้ **4 ที่**: enum (ตัวตัดสิน) · `request-meta.ts` (ตัวกรองหน้าคำขอ) · `DefaultWorkflows` (ลำดับตอน seed) · endpoint · จัดให้ตรงกันทั้งหมด และเขียนคอมเมนต์ในสองไฟล์แรกว่า **ลำดับการประกาศคือลำดับการแสดงผล** ไม่ใช่เรื่องบังเอิญ
- คอมเมนต์ "owner decides, IT carries out" เดิมครอบ mailgroup+fileshare ที่อยู่ติดกัน พอแยกห่างแล้วย้ายไปไว้ที่ File Share (ตัวแรก) และให้ Email Group ชี้กลับมา

### Tests / Verification

`RequestTypeOrderTest` ใหม่ 3 ตัว — parse `request-meta.ts` เทียบกับ enum ทีละตัว · `DefaultWorkflows` เรียงตรงกับ enum · **ยิง `GET /api/workflows` จริงแล้วเทียบลำดับที่คืนมา** · ถ้าไฟล์ไหนหลุดออกจากกันจะแดงทันที · ตรวจกับข้อมูลจริงแล้วได้ครบ 11 รายการเรียงตรงตามที่สั่ง · **ทั้ง suite = 1,032 passed / 4,012 assertions** · tsc 0 · pint · build ผ่าน

### รอบอีเมล: ปิดช่องว่างการแจ้งเตือน + ความกว้างต่อเทมเพลต (2026-08-30)

รอบนี้ไล่ทีละเหตุการณ์ว่า "เกิดเรื่องนี้แล้วใครควรรู้ และรู้ทางไหน" แล้วพบว่ากระดิ่งกับอีเมลไม่ได้เดินคู่กันหลายจุด — พนักงานลาออก 1 คนยิงกระดิ่ง 4 ทางแต่มีอีเมลทางเดียว

**เพิ่มเทมเพลตใหม่ 4 ตัว (34 ฉบับรวม)**

| ET | key | ถึงใคร |
|---|---|---|
| 34 | `contract.weekly_digest` | ผู้ที่เปิดสิทธิ์ `contracts.alerts` — จันทร์ 08:20 |
| 35 | `access.offboarding` | ผู้ที่เปิด Access Directory ได้ + แก้ไขทะเบียนได้อย่างน้อย 1 ทะเบียน |
| 36 | `employee.offboarding` | ทุกคนที่มี `employees.view` (ยกเว้นตัวคนลาออกเอง) |
| 5 | `ticket.cancelled` | คนแจ้ง — ใช้แถวเดิมของ `ticket.sla_breach` ที่ถอนออก |

- **`ContractDigestService`** สรุปสัญญาที่ใกล้หมดอายุกับที่เลยกำหนด แยก 2 ตาราง หัวตารางชุดเดียวกันจึงเรียงตรงกัน · เคารพ opt-out เดียวกับ sweep รายวัน (สัญญาที่ปิดแจ้งเตือนทุกช่วงไม่เข้าลิสต์) · **อ่านอย่างเดียว ไม่แตะ `contract_alert_logs`/`contract_bell_logs`** — ถ้าเขียน sweep รายวันจะข้ามการแจ้งเตือนที่ยังไม่ได้ส่ง คนอ่านจะได้แต่สรุปแต่ไม่เคยได้ตัวแจ้งเตือนจริง (มีเทสต์คุม)
- **`AccessService::outstandingTableFor()`** — ตารางเดียวรวมสิทธิ์ที่ถือกับทรัพยากรที่เป็นเจ้าของ ให้คอลัมน์ `Held as` เป็นตัวแยกงาน · คอลัมน์ `Resource` เป็น address จริง (email / path / url) ไม่ใช่ชื่อซ้ำ · Software ไม่มี address จึงเป็น `-`
- **`ticket.sla_breach` ถอนทั้งเทมเพลตและโค้ดที่ส่ง** — sweep วิ่งทุก 10 นาทีทั่วทุกเคสที่เปิดอยู่ เป็นตัวเดียวที่ยิงข้อความได้เยอะโดยไม่มีใครทำอะไร และผู้รับคือ IT ที่อยู่ในระบบอยู่แล้ว · กระดิ่งยังครบทั้ง `at_risk` และ `breached` · ถ้าลบแต่เทมเพลตโดยไม่ลบโค้ด `sendTemplate()` จะเงียบไปเฉย ๆ ซึ่งอันตรายกว่า

**ความกว้างต่อเทมเพลต (`EmailTemplates::widthFor`)**

กรอบอีเมลตายตัวที่ 720px มาตลอด แต่สรุปสัญญามี 6 คอลัมน์ ที่ 720 ชื่อผู้ขายกับชื่อสัญญาตกบรรทัดทั้งคู่

- ความกว้างอยู่ใน **catalogue ไม่ใช่คอลัมน์ใน DB** — เป็นเรื่องดีไซน์ของเทมเพลต ไม่ใช่ข้อความ ถ้าเก็บใน DB คนแก้ข้อความหรือกด Reset จะทำให้ตารางล้นได้
- กรอบถูกวาด **4 ที่** (จดหมายจริง · preview เทมเพลตที่บันทึก · preview สดตอนพิมพ์ · log การส่ง) ส่งค่าครบทั้ง 4 มีเทสต์คุมทีละทาง — ถ้าใส่แค่ตอนส่งจริง คนแก้เทมเพลตจะจัดตารางโดยดู preview ที่ไม่ตรงกับของที่ผู้รับเห็น
- `renderPreview` รับ `key` เพิ่มเพื่อรู้ว่าต้องวาดกรอบกว้างเท่าไร (SPA ส่งมาให้)

**ตัวแปรที่ขาด**

- `{{employee.position}}` `{{employee.section}}` `{{employee.department}}` `{{employee.working}}` — ET-15 อ้างถึงแต่ไม่มีตัวแปรรองรับ ผู้รับจะเห็นเป็น `{{...}}` ดิบ (renderer เป็น `str_replace` ธรรมดา ไม่ใช่ช่องว่าง)
- `{{ticket.resolution}}` — ET-4 อ้างถึงเช่นกัน ใช้ได้ทั้งเคสเสร็จ (วิธีแก้) และเคสยกเลิก (เหตุผล) · escape + `nl2br` เหมือน `ticket.details` เพราะเป็นข้อความที่คนพิมพ์เอง
- master data ผสมสองภาษา — ใช้ `name` ก่อน ถ้าว่างตกไปใช้ `name_th` (section ส่วนใหญ่มีแต่อังกฤษ แผนกมีทั้งคู่)

**บั๊กที่เจอระหว่างทาง**

- **`cadence` ของ `contract.expiry_alert` ในโค้ดเป็น `realtime`** ทั้งที่ส่งโดย sweep รายวัน — `EmailTemplateResource` เอา cadence ไปเทียบด้วย ทำให้ ET-16 ขึ้นว่า "แก้ไขแล้ว" ตลอดไป และ Reset จะติดป้ายผิด
- **ระดับสิทธิ์เก็บเป็น `Write` แต่ทุกหน้าจอแสดง `Read/Write`** — ถ้าปล่อยไป อีเมลจะเขียนคนละคำกับระบบ
- **badge cadence ทั้ง 3 ตัวไม่มีสีโหมดมืด** ต่างจากทุก badge ในแอป (`status-badge.tsx` ขยับเป็น `-400`) · เติมให้ครบทั้งชุด พร้อมแยก Weekly เป็นสีม่วงเพราะเดิมใช้สีเดียวกับ Daily
- **`<p>` ไม่สมดุลใน 3 เทมเพลต** (ET-4, ET-12, ET-33) · แก้ ET-4 และตัวใหม่ทั้งหมด · **ET-12 `asset.assigned` เนื้อหาขาดกลางคัน** ตั้งแต่ในนิยามมาตรฐาน (จบที่ `Tag:` ไม่มีบรรทัดปิด) — ยังไม่แก้เพราะต้องตัดสินใจเรื่องข้อความ ไม่ใช่แค่ปิดแท็ก
- **audience ของกระดิ่งสัญญาเขียนผิด** — บอกว่า "ทุกคนที่ดูสัญญาได้" ทั้งที่กรองด้วย `contracts.alerts`

### Tests / Verification

เทสต์ใหม่ 6 ไฟล์ — `ContractWeeklyDigestTest` · `EmailFrameWidthTest` · `NewEmployeeEmailTest` · `AccessOffboardingEmailTest` · `EmployeeDepartureEmailTest` · `TicketClosureEmailTest` · `TicketOwnerNotificationTest` แก้ 1 ตัวที่ยืนยันพฤติกรรมเดิม (เคสยกเลิกเคยไม่ส่งอีเมล) พร้อมดักเพิ่มว่าต้องไม่ยิง `ticket.resolved` ปนมา · ทดสอบทุกเทมเพลตกับข้อมูลจริงโดยครอบ `DB::beginTransaction()`/`rollBack()` และตรวจยอดหลังจบทุกครั้ง · **ทั้ง suite = 1,096 passed / 4,602 assertions** · tsc 0 · pint · build ผ่าน

**ค้างไว้** — ET-12 เนื้อหาขาด · อีเมลแจ้ง IT ให้ปิด login account (มีแต่กระดิ่ง) · 12 เทมเพลตที่แก้ในหน้าเว็บแล้วยังไม่ได้ดึงเข้าเป็นมาตรฐาน (Ticket 2 · Stock 9 · Request 1)

### รอบอีเมล (ต่อ): จดหมายที่ไม่มีปุ่ม · วงจร Ticket ที่ขาดช่วง · ป้ายเตือนที่โกหก (2026-08-30)

รอบต่อจากด้านบน ไล่ทีละเทมเพลตว่า "ใครได้รับ" แล้วเจอว่าหลายใบส่งออกไปในสภาพที่หน้า preview ไม่ได้บอก

**จดหมาย 5 ใบของ Ticket ไม่มีปุ่มให้กดเลย**

`sendTemplate()` สร้างปุ่มจาก `actionUrl`/`actionLabel` แต่ ET-01/02/03/04/05 ส่ง `null` ไปทั้งคู่ ขณะที่ `EmailTemplateController::preview()` **hardcode ปุ่มไว้ให้ทุกเทมเพลต** — เทมเพลตเลยดูสมบูรณ์ในหน้าเว็บ แต่ของที่ผู้รับได้ไม่มีอะไรให้คลิก

- คนแจ้งไป `?tab=my` · IT ไป `?tab=all` — หน้า Ticket แสดงแท็บ All เฉพาะ IT (`isIT ? ['all'] : []`) ส่งคนแจ้งไปแท็บที่เขาไม่มีจะตกไปแท็บแรกที่มองเห็นแทน
- ยังเหลืออีก 4 จุดนอกโมดูล Ticket ที่ส่งโดยไม่มีปุ่ม (Contract · Employee · Request · Stock)

**คนแจ้งเงียบตลอดช่วงกลาง — เพิ่ม ET-37 / ET-38**

เดิมได้จดหมาย 2 ใบคือ "รับเรื่องแล้ว" กับ "จบแล้ว" เคสจะเปลี่ยนมือกี่รอบก็ไม่รู้ · แยก 2 เทมเพลตเพราะใบส่งต่อต้องบอกทั้งคนรับใหม่และคนเดิม (คนแจ้งอาจคุยกับช่างคนเก่าค้างไว้) · `assign()` ส่ง `owner_taken` เหมือน `take()` — จากมุมคนแจ้งเป็นข่าวเดียวกัน ส่วนใครเลือกช่างเป็นเรื่องภายใน IT

**ตัวแปรที่เดินท่อเพิ่ม**

- `{{actor.name}}` ใน ET-02 — `assign()` ไม่เคยรู้ว่าใครสั่ง ต้องรับ `?User $assignedBy` จาก controller · **ระบบไม่ได้เก็บลง DB** ร่องรอยเดียวคือ audit log
- `{{ticket.assignee}}` ตัวใหม่ ไม่ใช้ `{{actor.name}}` ซ้ำ เพราะใน ET-02 แปลว่า "คนสั่ง" แต่ใน ET-37/38 แปลว่า "คนถือเคส"
- ET-02/03 เดิมส่งแค่ 4 ตัวแปร ไม่มีประเภทเคสและรายละเอียด — คนที่เพิ่งถูกมอบหมายต้องเปิดระบบก่อนถึงจะรู้ว่างานคืออะไร · เปลี่ยนไปใช้ `staffVars()` ที่ ET-29 ใช้อยู่แล้ว

**ป้าย "ไม่มีอีเมลรองรับ" ชี้ผิดตัว**

`NotificationTemplateController` แม็ปโมดูล→คำนำหน้าอีเมลด้วยมือ และค้างว่า `'access' => null` หลัง ET-35 ขึ้นแล้ว — **กระดิ่งตัวที่เพิ่งเลิกเป็นช่องทางเดียวกลายเป็นตัวเดียวที่ยังถูกติดป้ายว่าเป็น** คอมเมนต์ในฟังก์ชันนั้นเขียนทำนายไว้เองว่าจะพังแบบนี้ · `NotificationEmailPairingTest` ดักไว้แล้ว 2 ทาง (มีอีเมลแต่ไม่มีใครอ้าง / อ้างอีเมลที่ไม่มีจริง)

**`db:seed` ถามรหัสแอดมินแทนการอ่าน `.env`**

`SEED_SUPER_PASSWORD` ใน `.env` มีกับดักเงียบ: `config:cache` ทำให้ Laravel **ข้ามการโหลด `.env` ทั้งไฟล์** (`LoadEnvironmentVariables` return ทันทีเมื่อ config ถูก cache) `env()` เลยคืน null แล้วตกไปใช้ค่า fallback `password` โดยไม่มี error

- env ยังใช้ได้เหมือนเดิม (สคริปต์/CI ไม่กระทบ) → ถ้าไม่มีและมีคนอยู่หน้าจอ **ถาม** → ถ้าไม่มีใครตอบใช้ค่าเดิม
- รหัสที่พิมพ์เองไม่ตั้ง `must_change_password` — ไม่มีอะไรให้บังคับเปลี่ยน
- ตัวคุมคือ `--no-interaction` ไม่ใช่ input object (`SeedCommand` ไม่มี `getInput()`) และ `$this->seed()` ส่ง flag นี้มาให้อยู่แล้ว เทสต์จึงไม่มีทางค้าง

**การ์ดสถิติหน้า Notification**

เพิ่ม `ปิดใช้งาน` ข้าง `เปิดใช้งาน` — เป็นที่แรกที่ควรดูเวลามีคนบอกว่าไม่ได้รับแจ้งเตือน เพราะกระดิ่งที่ถูกปิดหน้าตาเหมือนกระดิ่งที่พัง · เอา `ไม่มีอีเมลรองรับ` ออกพร้อมตัวเลข `only_channel` (สามเหลี่ยมในตารางยังอยู่ ซึ่งชี้ว่ากระดิ่งตัวไหน ไม่ใช่แค่นับ)

**Ticket ทั้ง 9 ฉบับดึงเข้าเป็นมาตรฐาน** — พร้อมซ่อม `<p>` ไม่สมดุล 2 จุด (ET-3 ขาดปิด · ET-4 เกินมา ซึ่งเคยแก้ไปแล้วรอบหนึ่งและกลับมาอีก) และ `tacking` → `tracking`

### Tests / Verification

เทสต์ใหม่ 3 ไฟล์ — `TicketAssignedEmailTest` · `TicketProgressEmailTest` · `NotificationEmailPairingTest` · แก้เทสต์เดิมที่ยืนยันพฤติกรรมเก่า 2 ตัว (`has_email` ของ Access · เคสยกเลิกไม่ส่งอีเมล) · **เทสต์ 4 ตัวเปลี่ยนจากเทียบ HTML เป็นอ่านข้อความ (`strip_tags`)** เพราะพังทันทีที่ผู้ดูแลใส่ `<strong>` ครอบตัวแปร — ยังดักได้ว่าป้ายต้องไม่ค้างเปล่า แต่ไม่ผูกกับ markup · ทดสอบทุกเทมเพลตกับข้อมูลจริงโดยครอบ `DB::beginTransaction()`/`rollBack()` · **ทั้ง suite = 1,112 passed / 4,688 assertions** · tsc 0 · pint · build ผ่าน

**ค้างไว้** — ET-12 `asset.assigned` เนื้อหาขาดกลางคันตั้งแต่ในนิยามมาตรฐาน · 4 จุดนอก Ticket ที่ส่งอีเมลโดยไม่มีปุ่ม · 10 เทมเพลตที่ยังไม่ได้ดึงเข้ามาตรฐาน (Stock 9 · Request 1) · preview ยังวาดปุ่มให้เทมเพลตที่ตั้งใจไม่มีปุ่ม

### อีเมล: ปิดงานที่ค้างจากสองรอบก่อน (2026-08-30)

**ET-12 `asset.assigned` เนื้อหาขาดกลางคัน**

จบดื้อ ๆ ที่ `Tag:` ไม่มีแท็กปิด ไม่มีบรรทัดปิด — **ผิดตั้งแต่ในนิยามมาตรฐาน** ไม่ใช่ใครแก้ และส่งจริงไปแล้ว 3 ฉบับ · เติม `Type:` ที่ขาด (มีตัวแปรอยู่แล้ว ET-33 ก็ใช้) และบรรทัดปิดแบบเดียวกับ ET-33 · **ไม่ใส่ `{{asset.from}}`** ตามที่ตัดสินใจ — คนปลายทางไม่ต้องรู้ว่าเครื่องผ่านคลังไหนมา นั่นเป็นสายการครอบครองของ IT ตัวแปรยังส่งอยู่และยังเลือกจากเมนู chip ได้
- ET-33 `asset.recalled` มี `<p>` เกินมา 1 ตัว ลบด้วย (ตัวอักษรเกินล้วน ๆ ข้อความไม่เปลี่ยน)

**ปุ่มที่หายไปอีก 3 ใบ**

`employee.account_needed` · `contract.expiry_alert` · `contract.expired_alert` ส่ง `null, null` มาตลอด — เตือนสัญญาใกล้หมดอายุแต่เปิดสัญญานั้นไม่ได้ · ตอนนี้ทั้งระบบไม่มีเทมเพลตไหนส่งโดยไม่มีปุ่มแล้ว

**แก้ตัวเลขที่เคยรายงานผิด** — รอบก่อนบอกว่ามี 4 จุดนอกโมดูล Ticket ที่ไม่มีปุ่ม **ผิด** เพราะนับจากชื่อเมธอดที่ยิงกระดิ่งโดยไม่ตามเข้าไปดู helper · ของจริงคือ 3 ตัวข้างบน ส่วน Request (8 ตัว) กับ Stock (9 ตัว) มีปุ่มครบผ่าน `emailUser()` / `emailEach()` อยู่แล้ว

### Tests / Verification

`EmailActionButtonTest` สแกนทุกจุดที่เรียก `sendTemplate()` — ถ้าเพิ่มการส่งใหม่แล้วลืม URL จะแดงพร้อมบอกไฟล์และโค้ด · เป็นอย่างเดียวที่จับได้ เพราะ preview วาดปุ่มให้เสมอไม่ว่าตัวจริงจะส่งหรือไม่ · **พิสูจน์ว่าเทสต์จับได้จริงโดยถอด URL ของ ET-15 ออกชั่วคราวแล้วดูให้แดง** ก่อนคืนไฟล์ · ยังคุมอีก 2 อย่าง: ทุกจุดที่เรียก helper ต้องส่ง URL มาจริง · key ที่ส่งต้องมีนิยามในแคตตาล็อก (ไม่งั้น `sendTemplate()` เงียบ) · `AssetHandoverEmailTest` ล็อกว่าเทมเพลต `asset.*` ต้องปิดแท็กครบทุกตัว · **ทั้ง suite = 1,118 passed / 4,740 assertions** · tsc 0 · pint ผ่าน

**ค้างไว้** — 10 เทมเพลตที่ยังไม่ได้ดึงเข้ามาตรฐาน (Stock 9 · Request 1)

### อีเมล: ET-27 คำขอที่ IT ยกเลิก (2026-09-06)

**ET-27 `request.not_delivered` — เนื้อหาเดิมสั้นกว่าญาติของมันทุกฉบับ**

ยิงจุดเดียว: คำขอที่ **ผ่านอนุมัติครบทุกขั้นแล้ว** และ IT กด Cancel ตอนปิดเคสที่ระบบเปิดให้ (`TicketController::resolve` → `RequestService::settleFromTicket` → `notDelivered()`) ถึงผู้ขอ + คนที่ยื่นแทน · ยังไม่เคยส่งจริงสักฉบับ (`last_sent_at` ว่าง) เนื้อหาที่ผิดทรงจึงยังไม่ถึงตาใคร

- ชื่อ/หัวข้อเปลี่ยนเป็น `Request was cancelled by IT (คำขอผ่านอนุมัติ แต่ยกเลิกโดย IT)` / `Your request {{reference.id}} has been cancelled by IT.` — เดิมเป็นตัวเดียวใน 38 ฉบับที่ชื่อไม่มีภาษาไทยกำกับ
- เนื้อหาเขียนใหม่ทรงเดียวกับ ET-08/ET-11: บล็อกวันที่+คนทำ+เหตุผล → บล็อกรายละเอียดคำขอ (เพิ่ม `Ticket No.` เพราะการยกเลิกมาจากเคสนั้น) → ตาราง **Already approved** → บรรทัดปิด · เดิมมีแค่ 4 บรรทัด ไม่บอกว่าใครยกเลิก ไม่บอกว่าเมื่อไร และไม่บอกว่าคำขอนั้นคืออะไร
- `'width' => 860` เพราะมีตารางประวัติอนุมัติแล้ว (ล็อกไว้ในแคตตาล็อก ไม่ใช่ในแถว DB — ผู้ดูแลแก้ข้อความแล้วตารางต้องไม่ล้น)
- **ไม่ตัดตารางอนุมัติทิ้ง** ทั้งที่จบด้วยการยกเลิก — ใบนี้ผ่านทุกขั้นจริง คนอ่านควรเห็นว่าไม่มีใครปฏิเสธ ต่างจาก ET-08 ที่ตารางคือหลักฐานว่าใครไม่อนุมัติ

**ตัวแปรใหม่ `{{request.cancelled_date}}`** — `cancelled_at` มีในตารางมาตลอดแต่ไม่เคยมีตัวแปรให้เทมเพลตใช้ · เพิ่มใน `emailUser()` + sample ทั้งสองฝั่ง (`EmailTemplateController::sampleVars()` และ `SAMPLE_VARS` ของ SPA ซึ่งเป็นเมนู chip) · `notDelivered()` ส่ง `{{actor.name}}` = ชื่อ IT ที่ปิดเคส ให้ความหมายตรงกับ ET-08 ("คนตัดสิน") แทนที่จะยืม `{{request.fulfilled_by}}` ที่อ่านแล้วขัดกับคำว่า Cancelled

**แถวจริงใน DB** อัปเดตตามมาตรฐานด้วย (`email_templates` id 27) — เนื้อความที่ส่งจริงอ่านจาก DB ไม่ใช่จากแคตตาล็อก แถวนี้ยังไม่เคยถูกแก้ในหน้าเว็บจึงทับได้ตรง ๆ

### Tests / Verification

`RequestAutoTicketTest::test_the_cancellation_mail_carries_the_reason_the_case_and_the_approvals` — เดิมมีแต่เทสต์กระดิ่ง ตัวเมลไม่มีใครดู · ตรวจเหตุผล ชื่อคนยกเลิก วันที่ เลขคำขอ เลขเคส ตาราง Already approved · `{{` ต้องไม่เหลือค้าง และ `<p>` ต้องสมดุล · **พิสูจน์ว่าเทสต์จับได้จริงโดยถอด `request.cancelled_date` ออกชั่วคราวแล้วดูให้แดง** ก่อนคืนไฟล์ · `EmailSampleVarParityTest` คุมไม่ให้ตัวแปรใหม่มีแค่ฝั่งเดียว · **suite = 1,130 passed / 4,817 assertions** · tsc 0 · pint ผ่าน
- แดงอยู่ 5 ตัว (`OrgMasterDataSeedTest` 4 · `EmployeeImportTest` 1) — เป็นงาน seeder แผนก/ฝ่ายที่ค้างอยู่ใน working tree ของอีกสายงาน ไม่เกี่ยวกับรอบนี้

### อีเมล: รื้อ Drawer แก้ไข & พรีวิว (2026-09-06)

**Send test ส่งของที่เซฟไว้ ไม่ใช่ของที่เห็นอยู่**

`EmailTemplateController::test()` เรนเดอร์จากแถวใน DB ขณะที่พรีวิวข้าง ๆ เรนเดอร์จากเนื้อหาที่ยังไม่บันทึก — แก้ข้อความแล้วกดส่งทดสอบ **เมลที่เข้ากล่องเป็นของเก่า แต่จอบอกว่าเป็นของใหม่** และไม่มีอะไรบอกความต่าง · ตอนนี้ endpoint รับ `name` / `subject` / `body_html` ที่ยังไม่เซฟ (ไม่ส่งมาก็ใช้ของเดิม สำหรับปุ่มทดสอบในตาราง) · **การกดทดสอบไม่บันทึกทับของจริง**

**กล่องแก้ HTML โตตามไดอะล็อกแล้ว**

`rows={12}` ตายตัวอยู่ในคอลัมน์ที่สูงกว่ามันสามเท่า → แก้อีเมลยาวต้องเลื่อนสามชั้นซ้อน (ในtextarea → ในคอลัมน์ → ในไดอะล็อก) · เปลี่ยนเป็น flex column: overlay กับ textarea เป็น absolute ทั้งคู่ ความสูงมาจากคอลัมน์ ไม่ใช่จำนวนบรรทัด · ใช้ prop `grow` ของ `Field` ที่มีอยู่แล้วเพื่อการนี้

**พรีวิวเลิกมี scrollbar ซ้อน** — เปลี่ยนไปใช้ `SentEmailFrame` ตัวเดียวกับ Delivery log ที่วัดความสูงตัวเองอยู่แล้ว (เคยแก้ปัญหานี้ฝั่งนั้นไปรอบหนึ่ง แต่พรีวิวสดไม่ได้แก้ตาม)

**หัวไดอะล็อกจากสามชั้นเหลือหนึ่ง**

แถบ `Edit & preview` + แถวชื่อเทมเพลต + แถบ `PREVIEW | EDIT` พูดเรื่องเดียวกันสามรอบ กินความสูงไป ~150px · ยุบเป็น `FocusDialogHeader` ตัวที่ทั้งแอปใช้ (ไดอะล็อกนี้เคยเป็นตัวเดียวที่ไม่ใช้) — eyebrow = `ET-xx` + badge cadence · title = ชื่อเทมเพลต · subtitle = key · `headerRight` = สวิตช์เปิด/ปิด · เพิ่มจุด **ยังไม่บันทึก** ข้างชื่อ
- ตัวบอก "กำลังอัปเดต" ย้ายจากแถบหัวไปเกาะที่การ์ดพรีวิว — สถานะควรอยู่ติดของที่มันอธิบาย
- คอลัมน์ 50/50 → **5:7** ซองอีเมลถูกคุมที่ 640px อยู่แล้ว ที่เหลือมีค่ากับ HTML มากกว่า · ไดอะล็อกคุมความกว้างที่ `min(1500px,92vw)` (เดิม `75vw` ไม่มีเพดาน จอ ultrawide จะกว้าง 2500px)
- เอา `aria-describedby={undefined}` ออก เพราะ `FocusDialogHeader` มีคำอธิบาย sr-only มาให้แล้ว

**บรรทัด From ในพรีวิวเลิกเดา** — เดิมประกอบ `no-reply@` + ชื่อแบรนด์เอาเว้นวรรคออก · ตอนนี้ `/email-templates` คืน `mail.from_address` ที่ resolve แบบเดียวกับ `MailConfigService` ตอนส่งจริง (ไม่ได้ตั้ง SMTP → ค่า fallback จาก `.env` ไม่ใช่ค่าที่แต่งขึ้น)

**คำที่ทำให้เข้าใจผิด**
- `ตัวแปรที่ใช้ได้` → **`ตัวแปรในอีเมลนี้`** — รายการนั้นคือตัวแปรที่ *อยู่ในเนื้อหาแล้ว* ไม่ใช่ตัวที่แทรกได้ (ตัวที่แทรกได้อยู่ในดรอปดาวน์) คนที่กำลังหาว่าใส่อะไรได้บ้างอ่านแล้วหลงทาง
- `รีเซ็ตแล้ว` → **`คืนค่าแล้ว`** — เดิมกดแล้วปุ่มเปลี่ยนจาก Reset เป็น Reset
- ปุ่ม Reset ตอนกดไม่ได้บอกเหตุผล (`ตรงกับมาตรฐานอยู่แล้ว`) แทน tooltip เดิมที่อธิบายสิ่งที่มันจะทำทั้งที่ทำไม่ได้ · และลดน้ำหนักเป็น `ghost` เพราะมันทิ้งงานที่คนเขียน แต่ไปนั่งข้างปุ่มที่กดกันทุกวัน
- ปุ่ม Save บอก `Ctrl+S` ใน tooltip (คีย์ลัดทำงานมาตลอดแต่ไม่มีใครรู้)

### Tests / Verification

`EmailDeliveryLogTest` 2 ตัวใหม่ — ส่งทดสอบต้องพาเนื้อหาที่ยังไม่เซฟไป **และต้องไม่เซฟทับของจริง** · ไม่ส่ง draft มาก็ยังใช้ของที่เซฟไว้ · `EmailTemplatePreviewTest` 2 ตัวใหม่ — From ต้องเป็นค่าที่ตั้งไว้จริง และเป็น `.env` fallback เมื่อยังไม่ตั้ง SMTP · **พิสูจน์ว่าทั้ง 3 จับได้จริงโดยย้อนโค้ดกลับเป็นพฤติกรรมเดิมแล้วดูให้แดง** ก่อนคืนไฟล์ · **suite = 1,134 passed / 4,829 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน
- แดง 5 ตัวเดิม (`OrgMasterDataSeedTest` 4 · `EmployeeImportTest` 1) ยังเป็นงาน seeder แผนก/ฝ่ายของอีกสายงาน ไม่เกี่ยวกับรอบนี้

**ค้างไว้** — `Field` ยังไม่ผูก `<Label htmlFor>` กับ input (คลิกป้ายไม่โฟกัส) แก้ทีเดียวกระทบทุกฟอร์มทั้งแอป จึงแยกเป็นงานของตัวเอง · ไดอะล็อกยังเป็นสองคอลัมน์ตายตัว ไม่มี breakpoint สำหรับจอเล็ก · `ToolBtn` ยังไม่มี focus ring

**ตรวจบนหน้าจอจริง (หลังแก้)** — วัดจาก DOM ในเบราว์เซอร์ ไม่ใช่จากสายตา
- เจอบั๊กที่โค้ดอ่านแล้วไม่เห็น: `Field` ตั้ง `grow` ให้แล้ว (สูง 401px) แต่ `BodyEditor` ข้างในยังสูง 199px เพราะ wrapper ของ `Field` เป็น **block ไม่ใช่ flex** → `flex-1` ไม่มีอะไรให้ยืด เหลือช่องว่างใต้กล่อง ~180px · เปลี่ยนรากของ `BodyEditor` เป็น `h-full` · วัดซ้ำ: กล่อง 250px · คอลัมน์ `scrollHeight === clientHeight` (ไม่ล้น) · เหลือช่องว่างท้ายคอลัมน์ = 20px พอดีกับ padding
- พรีวิว: iframe สูง 946px = เนื้อหา 938 + 8 → **ไม่มี scrollbar ใน iframe** พาเนลข้างนอกเลื่อนแทน (1046 > 601) ตามที่ตั้งใจ
- From แสดงที่อยู่จริงจาก `mail_settings` · จุด **ยังไม่บันทึก** กับป้าย **กำลังอัปเดต** บนการ์ดพรีวิวขึ้นตอนพิมพ์ · ตรวจทั้ง light และ dark
- เก็บอีกจุดระหว่างตรวจ: ป้าย `Template Name` ในภาษาไทยยังเป็นอังกฤษ → `ชื่อ Template`

### อีเมล: ดึง 5 เทมเพลตที่แก้ในหน้าเว็บเข้าเป็นมาตรฐาน (2026-09-06)

ปิดงานที่ค้างมาสองรอบ — ตอนนี้ **ไม่มีแถวไหนใน `email_templates` ต่างจากนิยามใน `App\Support\EmailTemplates` อีกแล้ว** ป้าย "แก้ไขแล้ว" หายหมด และปุ่ม Reset คืนค่าเป็นข้อความที่ใช้อยู่จริง ไม่ใช่ข้อความรุ่นก่อนที่ไม่มีใครอยากได้

| | เก็บอะไร |
|---|---|
| ET-06 `request.approval_needed` | หัวข้อ → `Request {{reference.id}} is awaiting approval from {{requester.name}}` — ผู้อนุมัติเห็นชื่อคนขอตั้งแต่ในกล่องจดหมาย |
| ET-07 `request.approved` | ตัดประโยค "The request will now proceed to IT for the next step." ออก |
| ET-09 `request.submitted` | เติม ✅ หน้าบรรทัดยืนยัน และหน้า `Next Approver` |
| ET-25 `stock.request_created` | `New request` → `Stock request` |
| ET-28 `request.stalled_digest` | ชื่อเติม `(รอคุณอนุมัติ)` ให้เข้าชุดกับตัวอื่นที่มีไทยกำกับ |

**ET-07 เก็บเจตนา ไม่เก็บ HTML ที่พัง** — การลบประโยคในหน้าเว็บพา `</p>` ท้ายบรรทัดไปด้วย เหลือ `<p>` ที่ไม่มีวันปิดและ `<br>` ลอยอยู่เหนือความว่างเปล่า · เข้ามาตรฐานเป็น `<p>All required approvals have been completed.</p>` และ**ซ่อมแถวใน DB ให้ตรงกัน** (แถวนี้ส่งจริงไปแล้ว)

**ไม่ได้แก้แต่บันทึกไว้** — `✅ Next Approver` ใน ET-09 อ่านเหมือนขั้นนั้นผ่านแล้วทั้งที่กำลังรออยู่ · เป็นการเลือกใช้คำ ไม่ใช่ข้อผิดพลาด จึงเก็บตามที่เขียนไว้ ถ้าจะเปลี่ยนค่อยว่ากัน

### Tests / Verification

`EmailTemplatePreviewTest::test_every_standard_template_closes_the_tags_it_opens` — ขยายจาก `AssetHandoverEmailTest` ที่คุมเฉพาะ `asset.*` มาคุม **ทั้งแคตตาล็อก** เพราะอาการพังแบบเดียวกันเป๊ะ (ลบประโยคแล้วพา `</p>` ไปด้วย) เพิ่งเกิดกับ `request.approved` · **พิสูจน์ว่าจับได้จริงโดยใส่ markup ที่พังกลับเข้าไปแล้วดูให้แดง** ก่อนคืนไฟล์ · ตรวจซ้ำด้วยสคริปต์ว่าทั้ง 36 แถวตรงกับมาตรฐานทุกฟิลด์ · **suite = 1,135 passed / 4,865 assertions** · pint ผ่าน
- แดง 5 ตัวเดิม (`OrgMasterDataSeedTest` 4 · `EmployeeImportTest` 1) ยังเป็นงาน seeder แผนกของอีกสายงาน

### แจ้งเตือน: ดึง 8 กระดิ่งที่แก้ในหน้าเว็บเข้าเป็นมาตรฐาน (2026-09-06)

คู่ขนานกับรอบเทมเพลตอีเมล — ตอนนี้ **ไม่มีกระดิ่งไหนใน `notification_templates` ต่างจาก `App\Support\NotificationCatalogue`** ป้าย "แก้ไขแล้ว" เป็น 0 และปุ่มคืนค่ากลับไปหาข้อความที่ใช้อยู่จริง

| กระดิ่ง | เก็บอะไร |
|---|---|
| `notif_access_offboarding` | ทั้ง EN/TH — ตัดรายละเอียด `{grants}` / `{owned}` ออก เหลือยอดรวม |
| `notif_asset_assigned` | ทั้ง EN/TH |
| `notif_asset_offboarding` | ทั้ง EN/TH — ขึ้นต้นด้วย Offboarding / ลาออก |
| `notif_asset_recalled_cancelled` | ทั้ง EN/TH |
| `notif_asset_recalled_taken_back` | ทั้ง EN/TH — "กลับแผนกไอที" แทน "เข้าคลัง" |
| `notif_asset_return_requested` | ทั้ง EN/TH |
| `notif_contract_expired` | TH — ตัดคำแนะนำท้ายประโยคออก |
| `notif_request_blocked_no_account` | TH — ตัดคำแนะนำท้ายประโยคออก |

**การเก็บเข้า STD ไม่ใช่แค่แก้ catalogue** — `NotificationTemplateTest` จับได้ทันทีว่า SPA มี dictionary สำรองของตัวเอง (`lang/{en,th}/notification.ts`) ที่ถ้ายังเป็นข้อความเก่า ผู้ใช้จะเห็นคำคนละแบบทุกครั้งที่ override ยังโหลดไม่ทัน · อัปเดตทั้งสามที่ให้ตรงกัน (catalogue + en + th)

`{grants}` / `{owned}` ยังถูกส่งมาจากฝั่งผู้ส่งเหมือนเดิม แค่ข้อความเลือกไม่ใช้ — ไม่มี `{...}` โผล่ดิบ

**ไม่ได้แก้ แต่บันทึกไว้ (เป็นเรื่องคำ ไม่ใช่ของพัง จึงเก็บตามที่เขียน)**
- `The asset have been transferred to you` — ประธาน/กริยาไม่ตรง ควรเป็น `has`
- `Offboarding  Please clear access {total} permission` — เว้นวรรคสองครั้งตรงที่น่าจะตั้งใจใส่ตัวคั่น และ `permission` ไม่เติม s
- `Offboarding,  {count} assets waiting to be collected` — เว้นวรรคสองครั้งหลังจุลภาค
- TH ของ `notif_asset_assigned` ยังชวนให้กด ("กดเพื่อตรวจสอบ") แต่ EN ตัดออกแล้ว สองภาษาบอกคนละอย่าง

### Tests / Verification

`NotificationTemplateTest::test_the_catalogue_thai_wording_matches_what_the_spa_ships` — ฝั่งไทยไม่เคยถูกล็อกเลย มีแต่ EN ซึ่งเป็นเหตุผลที่ TH ดริฟต์เงียบ ๆ ได้ · **พิสูจน์ว่าจับได้จริงโดยแก้ค่าใน `th/notification.ts` ให้เพี้ยนแล้วดูให้แดง** ก่อนคืนไฟล์ · ตรวจซ้ำด้วยสคริปต์ว่าทั้ง 42 กระดิ่งตรงกับ catalogue · **suite = 1,136 passed / 4,949 assertions** · tsc 0 · pint · build ผ่าน

### Request options: ย้าย seed data ไปไว้ใน seeder (2026-09-06)

`RequestOptionSeeder` เคยเป็นลูปเปล่า ๆ ที่ไปดูดตัวเลือกจากคีย์ `options` ของฟิลด์ `managed` ใน `RequestSchemas` — เปิดไฟล์ seeder แล้วไม่เห็นข้อมูลสักตัว ต้องตามไปอีกไฟล์ · ตอนนี้ลิสต์อยู่ในเมธอด `lists()` ของ seeder ตรง ๆ

**ทำไมย้ายได้โดยไม่กระทบอะไร** — ลิสต์ที่อยู่ใน `RequestSchemas` **ไม่เคยถูกอ่านตอนรัน**: `RequestSchemas::for()` สลับตัวเลือกของฟิลด์ `managed` ด้วยแถวจาก `request_options` ทุกครั้ง (คอมเมนต์ในเมธอดเขียนไว้เองว่า "not a runtime fallback, because its ids only exist once the rows do") ส่วน `RequestService::displayValue()` กับ `RefreshRequestDisplaySnapshots` ก็แยกสาขา `managed` ออกไปอ่านตารางก่อนถึงบรรทัดที่ใช้ `options` · สำเนาในสคีมาจึงเป็นข้อมูลที่ไม่มีใครอ่าน แต่หน้าตาเหมือนตัวเลือกที่ฟอร์มยังเสนออยู่

- ฟิลด์ `managed` ทั้ง 4 ตัว (`computer.device_id` · `hardware.device_id` · `mobile.device_id` · `telephone.device_type_id`) ไม่มีคีย์ `options` ในสคีมาอีกแล้ว — เหลือแค่ธง `managed` ที่บอกว่า "ตัวเลือกอยู่ในตาราง"
- พฤติกรรม seeder เหมือนเดิมทุกอย่าง: `firstOrCreate` จับคู่ด้วย `(request_type, field_key, label_en)` · `sort_order` เป็นหลักสิบ · รันซ้ำไม่ทับ `label_th`/ลำดับที่แอดมินแก้ และไม่ลบตัวเลือกที่เพิ่มเอง
- ไม่ได้รันบน DB จริง (แถว `request_options` เท่าเดิม 10 แถว) — เป็นการย้ายโค้ด ไม่ใช่การ seed ใหม่

### Tests / Verification

ไม่ต้องเพิ่มเทสต์ใหม่ — `ProductionSeedTest` เป็นตัวกันดริฟต์อยู่แล้ว: มันวนทุกฟิลด์ `managed` ในสคีมาแล้วยืนยันว่ามีแถวใน `request_options` จริง ฉะนั้นฟิลด์ `managed` ที่ลืมใส่ลิสต์ใน seeder = แดงทันที (ฟิลด์พวกนี้ `required` ถ้าไม่มีตัวเลือก request type นั้นจะส่งคำขอไม่ได้เลย) · **พิสูจน์แล้วโดยลบลิสต์ `telephone` ออกชั่วคราวแล้วดูให้แดง** ก่อนคืนไฟล์ · `RequestOptionTest` · `EmployeeOnboardingRequestTest` · `RequestAutoTicketTest` ผ่านครบ · **suite = 1,136 passed / 4,949 assertions** · pint ผ่าน

### Ticket: คนแจ้งเคสไม่ได้เป็นคนตัดสินว่าใครทำ (2026-09-06)

ปุ่ม **Assign to** และ **Transfer** เคยขึ้นให้ทุกคนที่ถือ `tickets.assign` — รวมถึงบนเคสที่คนดูเป็นคนแจ้งเอง · ตอนอ่านใบที่ตัวเองแจ้ง คนนั้นคือ "ผู้ใช้ที่รอ IT" ไม่ใช่ dispatcher: เขากด Take Case ไม่ได้ (anti case-pumping) และเป็นคนเดียวที่เคสนั้นส่งไปให้ไม่ได้ การเลือกว่าใครจะทำจึงไม่ใช่หน้าที่ของเขา

```tsx
const canRouteThis = !isMyOwnRequest;
const showAssign  = isOpenUnassigned && canAssign && canRouteThis;
const showForward = canForward && (isMine || (canAssign && canRouteThis));
```

**ปิดที่ API ด้วย ไม่ใช่แค่ซ่อนปุ่ม** — `TicketController::assertNotTheRequester()` เรียกจากทั้ง `assign()` และ `forward()` คืน 403 พร้อมเหตุผล · เป็นอีกครึ่งของกฎ anti case-pumping ที่มีอยู่แล้ว (เดิมพูดแค่ว่าเคส "ลงไปหา" คนแจ้งไม่ได้ ตอนนี้พูดด้วยว่าคนแจ้ง "ไม่ได้ชี้" ว่าจะลงไปหาใคร)

- คนถือเคส (assignee) ยังส่งต่อได้ทุกกรณี — สาขานี้ไม่มีทางชนกฎใหม่ เพราะเคสไม่มีวันไปอยู่กับคนแจ้ง
- dispatcher คนอื่นยังจัดเคสนั้นได้ตามปกติ และ IT คนไหนก็กด Take Case ได้
- **แก้คำที่เคยเขียนผิด**: รอบแรกผมบอกว่า "ถ้าจำเป็นยังจัดการได้จากหน้า list" — **ไม่จริง** `AssignTicketModal` / `ForwardTicketModal` เปิดจาก drawer ที่เดียว (`pages/index.tsx:1064-1065`) ตารางไม่มี row action ฉะนั้นการซ่อนปุ่มคือปิดทางเดียวที่มีจริง ๆ ซึ่งเป็นเจตนา
- บัญชี `super` ไม่มี `employee_id` เลยเป็นผู้แจ้งไม่ได้อยู่แล้ว — กฎนี้มีผลกับ IT ที่ผูกกับ record พนักงาน (เช่น `TKT-HW-260830-003` ที่ Piches แจ้งแล้ว Kankanok ถือ)

**ปิดช่องที่เจอระหว่างตอบคำถาม** — ลิสต์ปลายทางใน Forward กรองออกแค่คนถือเคสปัจจุบัน ส่วน Assign กรองออกแค่ตัวเอง ทั้งที่ API ปฏิเสธ *คนแจ้งเคส* ด้วย ชื่อนั้นจึงนั่งรออยู่ในดรอปดาวน์เพื่อตอบ 422 · `/tickets/staff` คืน `employee_id` มาด้วยแล้ว (ผู้แจ้งเป็น employee id ลิสต์เดิมมีแต่ user id จึงเทียบกันไม่ได้) และทั้งสองหน้ากรองคนแจ้งออก

### Tests / Verification

`TicketLevelScopingTest` เพิ่ม 3 ตัว — dispatcher จัดเคสของตัวเองไม่ได้ทั้ง assign และ forward (แม้หลังมีคนรับไปแล้ว) · เคสของคนอื่นยังจัดได้ตามเดิม · `/tickets/staff` ต้องบอกว่าแต่ละบัญชีผูกกับพนักงานคนไหน ซึ่งเป็นข้อมูลชิ้นเดียวที่ทำให้ตัวกรองหน้าเว็บตรงกับกฎฝั่ง API · **พิสูจน์ว่าเทสต์จับได้จริงโดยถอด `assertNotTheRequester()` ออกจาก `assign()` แล้วดูให้แดง** ก่อนคืนไฟล์ · เงื่อนไขการโชว์ปุ่มเป็นตรรกะใน component ยังไม่มี runner ฝั่ง frontend จึงยังไม่มีเทสต์คุม (gate ฝั่ง API คุมผลลัพธ์แทน) · **suite = 1,139 passed / 4,956 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน

### เก็บงานค้าง: เทสต์แดง · a11y ของฟอร์ม · คำที่ทักไว้ (2026-09-06)

**เทสต์แดง 5 ตัวหายหมด — suite เขียวทั้งก้อนครั้งแรก**

`OrgMasterDataSeedTest` (4) กับ `EmployeeImportTest` (1) แดงเพราะเทสต์กับ seeder ไม่ตรงกัน · **seeder คือฝั่งที่ถูก** (เป็นของที่ตั้งใจแก้) เทสต์จึงเดินตาม
- tag แผนกเป็น `IT` / `MN` / `SALE` ไม่ใช่ `It` / `Mn` / `Sales` → แก้ที่เทสต์และที่ fixture ของ `EmployeeImportTest` ซึ่งสร้าง `DEP-0003` ด้วย tag `It` ไว้ก่อน · `firstOrCreate` จับคู่ด้วย `code` แถวนั้นจึงเก็บ tag เดิมไว้ แล้ว `EmployeeSectionSeeder` หาแผนก `IT` ไม่เจอและโยน RuntimeException — เป็นที่มาของตัวที่ 5 · แถว import ยังพิมพ์ `It` เหมือนเดิม ซึ่งกลายเป็นการพิสูจน์ว่าการจับคู่ไม่สนตัวพิมพ์
- จำนวนแผนกย่อยเป็น **25** ไม่ใช่ 26 · `SE` มี `Environment` + `Safety` · ชื่อไทยขึ้นต้น `ส่วนงาน`

> ยังไม่ตรงกับ DB จริง: ตอนนี้ live มี tag `It`/`Mn`/`Lg`/`Sales`/`Acc` และ **26 แผนกย่อย** (มี `Quality Assurance` กับ `Occupational Safety & Health`) · seeder ไม่ทับของเดิม (`firstOrCreate` บน `code`) ของที่ใช้อยู่จึงไม่กระทบ แต่ **ติดตั้งใหม่จะได้ผังที่ไม่เหมือนวันนี้** · และ docblock ของ `EmployeeSectionSeeder` ยังเขียนว่า "twenty-six" ทั้งที่ลิสต์มี 25 — ทั้งสองข้อรอเจ้าของงานตัดสิน

**`Field` ผูกป้ายกับช่องกรอกแล้ว — ทั้งแอปในที่เดียว**

182 จุดที่ใช้ `<Field>` ไม่มีจุดไหนผูก `<Label htmlFor>` เลย คลิกป้ายไม่โฟกัส และ screen reader อ่านสองอย่างแยกกัน · แก้ที่ `Field` ตัวเดียว: `useId()` แล้ว `cloneElement` ใส่ `id` ให้ลูกที่เป็น element เดี่ยวและยังไม่มี `id` ของตัวเอง — `Input` / `Textarea` spread props ลง DOM อยู่แล้ว จึงได้ผลทันทีเป็นส่วนใหญ่ · `SearchableSelect` (35 จุด) รับ `id` เพิ่มและส่งลงปุ่ม trigger · ลูกที่ไม่รับ prop หรือ Field ที่ครอบหลายคอนโทรล = พฤติกรรมเดิม ไม่มีอะไรพัง

**ไดอะล็อกแก้เทมเพลตรองรับจอเล็ก** — ต่ำกว่า `lg` สองพาเนลเรียงลงมาและเลื่อนเป็นก้อนเดียว โดย**เอาช่องแก้ไขขึ้นก่อน** (`flex-col-reverse`) เพราะบนจอแคบสองคอลัมน์เหลือข้างละ ~440px และฝั่ง HTML คือฝั่งที่เสียหาย · `ToolBtn` ได้ focus ring กับ `aria-label` แล้ว

**คำที่ทักไว้เมื่อรอบก่อน แก้ครบ** (แก้ทั้ง catalogue + dictionary ของ SPA + แถวจริงใน DB)

| | เดิม | ใหม่ |
|---|---|---|
| `notif_asset_assigned` | The asset **have** been transferred to you | The asset **has** been transferred to you - tap to check |
| `notif_access_offboarding` | Offboarding␣␣Please clear access {total} permission | Offboarding - please clear {total} access item(s) |
| `notif_asset_offboarding` | Offboarding,␣␣{count} assets waiting… | Offboarding - {count} assets waiting… |
| ET-09 `request.submitted` | ✅ Next Approver | Next Approver |

`notif_asset_assigned` เลือกทางที่เก็บภาษาไทยไว้ทั้งประโยคแล้วเติมคำชวนกดให้ EN แทน — สองภาษาบอกเรื่องเดียวกันแล้ว · ✅ บรรทัดบนของ ET-09 (ยืนยันว่าส่งคำขอสำเร็จ) ยังอยู่ ตัวที่ถอดคือตัวที่ไปเกาะขั้นที่ยังไม่เกิด

### Tests / Verification

**suite = 1,144 passed / 4,971 assertions (ไม่มีแดงเหลือแล้ว)** · tsc 0 · eslint 0 · prettier · pint · build ผ่าน · สคริปต์ตรวจซ้ำว่าทุกเทมเพลตอีเมลและทุกกระดิ่งใน DB ตรงกับมาตรฐานหลังซิงก์ 4 แถว

### Dashboard: endpoint เดียว + การ์ด "ของฉัน" ที่เป็นข้อมูลจริง (2026-09-06)

หน้าแรกเคยเปิดมาด้วยตัวเลข hardcode 3 ใน 4 ใบ (`14` / `5` / `128` ทั้งที่ของจริงคือ 13 / 8 / 5) พร้อมข้อความ "↑ 12% จากสัปดาห์ก่อน" ที่ไม่ได้คำนวณจากอะไร และตาราง "Ticket ล่าสุด" ที่เป็น `demoTickets` 4 แถวเขียนตายตัว (`TKT-2861 Cannot connect to production VPN`) — เลขที่ตั๋วคนละรูปแบบกับของจริงด้วยซ้ำ · **กล่อง Coming soon บอกตัวเองว่าว่าง แต่ตัวเลขปลอมไม่บอก** อันหลังจึงอันตรายกว่า

**ทางที่เลือก: ประกอบจากสิทธิ์ ไม่ใช่แตกตาม role** — mockup เดิม (`docs/std-mockup/`) ออกแบบเป็น 3 หน้าแยก (`OverallDashboard` / `MyDashboard` / `HrDashboard`) สลับด้วย role string · ทั้งระบบเลิก hardcode role ไปใช้ permission แล้ว การ์ดจึงถูกทำเป็นชิ้นที่ถามสิทธิ์ของตัวเอง — คนที่เป็นทั้ง HR และ IT เห็นครบสองชุดแทนที่จะต้องเลือกข้าง และโมดูลใหม่ = เพิ่มการ์ด ไม่ใช่เพิ่ม dashboard ใบที่สี่

**`GET /api/dashboard/summary`** — `DashboardSummaryService` ประกอบทั้งหน้าในคำขอเดียว ไม่มี gate ที่ route แต่ตัด block ตามสิทธิ์ผู้เรียก (แบบเดียวกับ `SidebarBadgeService`) · หน้าเว็บยิงทีละ endpoint ต่อการ์ดไม่ได้ เพราะมันไม่รู้ล่วงหน้าว่าอันไหนจะตอบ 403 และการ์ดที่ 403 หน้าตาเหมือนการ์ดที่ว่าง

**ชุด "ของฉัน" (ยังไม่ต้องใช้สิทธิ์ใด ๆ — ทุกแถวเป็นของคนอ่านอยู่แล้ว)**
- แบนเนอร์ **รอคุณกดรับ** อยู่บนสุด เป็นรายการไม่ใช่ตัวเลข เพราะเป็นบล็อกเดียวบนหน้าที่ขอให้ลงมือทำ
- KPI 4: Ticket ที่ยังไม่ปิด · คำขอที่รออยู่ · ทรัพย์สินที่ถืออยู่ · ปิดแล้วเดือนนี้ — ทุกใบเป็น row count ไม่ใช่ค่าประมาณ และคลิกไปหน้าที่มาได้
- ตาราง Ticket / คำขอ / ทรัพย์สินของฉัน อย่างละ 5 แถว พร้อม empty state ที่บอกว่า "ไม่มี" แปลว่าอะไร
- คำขอที่ **คนอื่นยื่นแทน** (onboarding) นับเป็นของเจ้าตัวด้วย ไม่ใช่ของคนยื่นอย่างเดียว
- การ์ดสัญญาใกล้หมดอายุ (ของจริงมาแต่เดิม) ยังอยู่ แต่ gate ด้วย `contracts.module` แล้ว · การ์ด Coming soon ฝั่ง IT gate ด้วย `tickets.view_all` — ผู้ใช้ทั่วไปเลิกเห็นรายงานที่ไม่มีวันเป็นของเขา

**DB ไม่ต้องแก้อะไรเลย** — ตรวจ schema แล้วครบทุกอย่าง: `tickets.resolved_at` มีอยู่ · `AssetStatus` มี `pending_acceptance` · `service_requests` มี timestamp ครบทุกสถานะ · ที่ย้อนหลังไม่ได้มีอย่างเดียวคือ **สถานะทรัพย์สิน** (`assets.status` ไม่มีประวัติ, `asset_transfers` บันทึกแค่การโอน) จึงตัด sparkline/delta ของการ์ดทรัพย์สินทิ้งแทนที่จะไปแก้โครงเพื่อ dashboard · ถ้าวันหลังทำ asset history จริง sparkline จะตามมาเอง

### Tests / Verification

`DashboardSummaryTest` 6 ตัว — นับและลิสต์เฉพาะของคนอ่าน · เดือนนี้ตัดที่ต้นเดือน · ทรัพย์สินรอรับเป็นรายการแยกแต่ยังนับรวมใน KPI · คำขอที่ยื่นแทนนับเป็นของเจ้าตัว · **บัญชีที่ไม่มี employee record (super) ต้องได้โครงเดียวกันที่ว่างเปล่า ไม่ใช่ 500** เพราะบัญชีเดียวที่แก้ปัญหาได้ต้องเปิดหน้าแรกได้เสมอ · ต้องล็อกอิน · รันจริงกับข้อมูลบนเครื่องเทียบผลแล้ว (Piches: 4 ตั๋วค้าง / 1 คำขอ ตรงกับ DB) · **suite = 1,150 passed / 4,993 assertions** · tsc 0 · eslint 0 · build ผ่าน

**ค้างไว้** — การ์ดฝั่ง IT (Tickets overview · Team workload) และชุด HR ยังเป็น Coming soon · Recent activity (`audit_logs` มีข้อมูลพร้อมแล้ว) ยังไม่ได้ทำ

### Dashboard: ครบทั้งสามชุด — IT · HR · กิจกรรมล่าสุด (2026-09-06)

ต่อจากชุด "ของฉัน" — ตอนนี้ `/api/dashboard/summary` ส่ง block ตามสิทธิ์ครบแล้ว และการ์ด Coming soon สามใบสุดท้ายบนหน้าแรกหายไปหมด

**block ที่คนอ่านไม่มีสิทธิ์เห็น = ไม่ส่งคีย์นั้นมาเลย ไม่ใช่ส่งอาร์เรย์ว่าง** — หน้าเว็บวาดจาก "คีย์ไหนมาถึง" ถ้าส่งอาร์เรย์ว่างมา คนที่ไม่มีสิทธิ์จะเห็นรายงาน IT ที่มีหัวข้อ มีกรอบ และว่างเปล่า ซึ่งอ่านว่า "ไม่มีเคส" ไม่ใช่ "ไม่ใช่เรื่องของคุณ"

| block | สิทธิ์ | มีอะไร |
|---|---|---|
| `it` | `tickets.view_all` | สัดส่วนเคส 30 วันล่าสุด + ภาระงานรายคน |
| `hr` | `employees.view_dashboard` | KPI 4 · พนักงานเข้าใหม่ล่าสุด · จำนวนคนต่อฝ่าย |
| `activity` | `system.view_audit` | 8 รายการล่าสุดจาก `audit_logs` |

**Tickets overview** — นับจาก `created_at` ในหน้าต่าง 30 วัน ไม่ใช่ "ทุกใบที่ยังเปิดอยู่" เพราะคำถามที่การ์ดตอบคือ*ช่วงนี้งานเข้ามาแบบไหน* เคสที่เปิดตั้งแต่เดือนมีนาคมทำให้ภาพของเดือนนี้เพี้ยน · วาดเป็น **แถบเดียวแบ่งสี + legend ที่มีตัวเลข** แทนโดนัทของ mockup โดยใช้สำนวนเดียวกับแถบ active/resigned ในหน้า Employee และ**สีเดียวกับ badge สถานะ Ticket** (`TICKET_STATUS_META`) — segment กับ badge ของสถานะเดียวกันจะได้ไม่เป็นสีน้ำเงินคนละเฉด · ตัวเลขอยู่ใน legend เพราะคนที่อยากรู้ "กี่ใบกันแน่" ไม่ควรต้องเอาเมาส์ไปจิ้ม

**Team workload** — ทุกคนที่ถือเคสอยู่ + ปิดไปกี่ใบในหน้าต่างเดียวกัน · **กองที่ยังไม่มีผู้รับผิดชอบเป็นแถวปกติแถวหนึ่ง** และเรียงตามจำนวนเหมือนคนอื่น ไม่ได้ถูกยัดไว้ท้ายรายการ — คิวที่ไม่มีเจ้าของคือสิ่งเดียวบนการ์ดนี้ที่ต้องมีคนไปทำอะไรกับมัน (ข้อมูลจริงบนเครื่องตอนนี้: ยังไม่มีผู้รับผิดชอบ 13 ใบ)

**HR** — พนักงานทั้งหมด (นับเฉพาะ active) · เข้าใหม่เดือนนี้ · **รอ IT จัดเตรียม** (คำขอ origin `onboarding` ที่ยัง pending/approved) · ลาออกเดือนนี้ · ฝ่ายที่ไม่มีคนถูกตัดออกจากกราฟแทนที่จะวาดเป็นแท่งเปล่า

**Recent activity** — `audit_logs` 8 แถวล่าสุด (action · target · ใครทำ · เมื่อไร) ลิงก์ไปหน้า audit เต็ม

### Tests / Verification

`DashboardSummaryTest` เพิ่มเป็น **10 ตัว** — 4 ตัวใหม่: block ที่ไม่มีสิทธิ์ต้อง**ไม่มีคีย์** (ไม่ใช่ค่าว่าง) · หน้าต่าง 30 วันตัดเคสเก่าออกจากสัดส่วนแต่ยังนับเป็นเคสค้างของคนถือ · แถวไม่มีผู้รับผิดชอบต้องมีอยู่จริง · ฟีดกิจกรรมต้องใช้สิทธิ์ `system.view_audit` · **พิสูจน์ว่าเทสต์จับได้จริงโดยถอด gate ของ `activity` ออกแล้วดูให้แดง** (สองตัวแดงพร้อมกัน) ก่อนคืนไฟล์ · ตรวจกับข้อมูลจริง: `super` ได้ 4 block · บัญชี HR ได้ `mine` + `hr` เท่านั้น · **suite = 1,154 passed / 5,018 assertions** · tsc 0 · eslint 0 · build ผ่าน

**ภาพรวม Ticket เป็นวงแหวนตามที่ออกแบบไว้** — SVG (สำนวนเดียวกับวงนับถอยหลังใน session-timeout) เว้นช่อง 2px ระหว่างส่วนโค้ง ตัวเลขรวมอยู่กลางวง ส่วนจำนวนรายสถานะอยู่ใน legend เพราะวงแหวนตอบว่า *แบ่งกันยังไง* ส่วนคนที่อยากรู้ว่ากี่ใบไม่ควรต้องเอาเมาส์ไปจิ้ม · แต่ละส่วนโค้งมี `<title>` ให้ hover อ่านได้ และมี `role="img"` + aria-label

### ภาพรวม Ticket: โดนัท และสีที่คนตาบอดสีอ่านได้ (2026-09-06)

เปลี่ยนจากแถบแบ่งสีเป็น **โดนัท** ตามที่ออกแบบไว้ใน mockup · วงแหวน SVG ใช้สำนวนเดียวกับวงนับถอยหลังใน `session-timeout-modal` (หมุน -90°, `strokeDasharray`/`strokeDashoffset`) เว้นช่องสีพื้น 2px ระหว่างส่วนโค้ง · ยอดรวมอยู่กลางวง จำนวนรายสถานะอยู่ใน legend พร้อมชื่อสถานะ — ตัวตนของแต่ละส่วนจึงไม่ได้ฝากไว้กับสีอย่างเดียว

**In progress เปลี่ยนจากม่วงเป็นเหลืองอำพัน — และนี่คือเหตุผล**

รันตัววัดพาเลตของสกิล dataviz กับสีสถานะเดิมของแอป:

```
blue-600 #2563eb ↔ violet-500 #8b5cf6
  ΔE 2.3 (protanopia) · 12.7 (สายตาปกติ) → FAIL ทั้งสองเกณฑ์
```

สองส่วนโค้งที่ใหญ่ที่สุดของกราฟนี้ (เปิด กับ กำลังดำเนินการ) คนตาบอดสีแดง-เขียว **แยกไม่ออกเลย** และแม้สายตาปกติก็ยังต่ำกว่าเกณฑ์ · badge อยู่กับม่วงได้เพราะแต่ละอันมีคำกำกับในตัว แต่ส่วนโค้งสองอันที่ติดกันไม่มี · ลองไล่ทั้งตระกูลม่วงแล้ว (violet-300/400, purple-500, fuchsia-500) ไม่มีสเต็ปไหนผ่านทั้ง light และ dark — violet-300 ผ่าน CVD แต่ตกเกณฑ์ความสว่างและ contrast บนพื้นขาว

พาเลตที่ใช้: `blue-500 / amber-500 / emerald-500 / gray-400` (dark ใช้สเต็ป -400) — ผ่าน CVD separation และ normal-vision floor ทั้งสองโหมด
- เกณฑ์ chroma ยังฟ้อง `gray` ว่า "อ่านเป็นสีเทา" ซึ่ง**ตั้งใจ**: ยกเลิกคือสถานะที่หยุดแล้ว ไม่ใช่หมวดที่มาแย่งสายตา
- เกณฑ์ contrast เตือน amber/emerald บนพื้นขาว → แก้ด้วยป้ายชื่อ+ตัวเลขที่มองเห็นใน legend ตามที่เกณฑ์กำหนด

> **ค้างให้ตัดสิน** — ตอนนี้กราฟใช้เหลืองอำพันแต่ badge ในโมดูล Ticket ยังเป็นม่วง (`TICKET_STATUS_META`) ถ้าอยากให้ภาษาสีเป็นอันเดียวกันทั้งแอป ต้องย้าย `in_progress` เป็น amber ทุกที่ ซึ่งกระทบ badge/spine/ตัวกรองทั้งโมดูล — เป็นการตัดสินใจเรื่องภาษาสีของระบบ ไม่ใช่ของงาน dashboard

### Tests / Verification

**ตรวจบนเบราว์เซอร์จริงแล้ว** (ล็อกอินเป็น Piches S ซึ่งถือครบทั้ง `tickets.view_all` · `employees.view_dashboard` · `system.view_audit`)
- ทุกการ์ดขึ้นข้อมูลจริง: KPI 4/1/0/0 · Ticket ของฉัน 4 ใบพร้อมเลขที่จริงและผู้รับผิดชอบ · คำขอ `RQ-2026-0048`
- **วัดส่วนโค้งจาก DOM**: เปิด 74.4% · กำลังดำเนินการ 11.9% · เสร็จสิ้น 11.9% (ของจริง 12/2/2 จาก 16 = 75/12.5/12.5 ลบช่องว่าง 2px ต่อชิ้น) และแต่ละชิ้นมี `<title>` ถูกต้อง
- ภาระงานของทีม: **ยังไม่มีผู้รับผิดชอบ 13 ค้าง** อยู่แถวบนสุดตามที่ตั้งใจ
- HR + กิจกรรมล่าสุดขึ้นครบ เวลาแสดงเป็นภาษาไทย ("5 นาทีที่แล้ว")
- ตรวจทั้ง light และ dark · console ไม่มี error · คืนธีมเป็น light ตามเดิม
- เก็บระหว่างตรวจ: legend เดิมเป็น `flex-1` ทำให้ตัวเลขไหลไปติดขอบขวาห่างจากป้ายชื่อ → คุมความกว้างที่ 220px

**suite = 1,154 passed / 5,018 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน

### Dashboard: เก็บพื้นที่ว่างของการ์ดภาพรวม + ภาระงานนับเฉพาะคน (2026-09-06)

**การ์ดภาพรวม Ticket มีพื้นที่ว่างเหลือทางขวา** — วงแหวน 132px + legend คอลัมน์เดียวที่คุมไว้ 220px กินความกว้างไปไม่ถึงสองในสามของการ์ด ที่เหลือว่างเปล่า · ลองเปลี่ยนเป็นวงกลมทึบก่อนแล้วแต่ไม่ใช่ประเด็น (วงแหวนสวยอยู่แล้ว) ประเด็นคือ legend
- วงแหวนโตขึ้นเป็น **148px** ยอดรวมกลางวงใหญ่ขึ้นตาม
- legend เป็น **กริด 2 คอลัมน์ `flex-1`** กินความกว้างที่เหลือทั้งหมด — ไม่ยืดคอลัมน์เดียวให้ยาว เพราะนั่นจะพาตัวเลขเดินหนีจากป้ายชื่อของมันเอง (ปัญหาที่เพิ่งแก้ไปรอบก่อน)
- เพิ่ม **%** ข้างจำนวน เพราะมุมของวงแหวนเทียบด้วยตายาก — เป็นจุดอ่อนที่รู้กันอยู่ของกราฟทรงนี้ และ legend คือที่ที่ต้องชดเชยให้
- วัดจาก DOM หลังแก้: legend ชนขอบ padding ขวาพอดี เหลือ **1px** · สองคอลัมน์กว้าง 269px เท่ากัน

**ภาระงานของทีมนับเฉพาะคน** — ตัดแถว "ยังไม่มีผู้รับผิดชอบ" ออกจากการจัดอันดับ เพราะการ์ดนี้ตอบคำถามว่า*ใครแบกเยอะสุด* และกองไร้เจ้าของเป็นแท่งที่ยาวที่สุดเสมอ ทำให้คนที่แบกจริงถูกวัดเทียบกับคิวที่ไม่ใช่ภาระของใคร · **ตัวเลขไม่ได้หายไป** — ย้ายไปเป็นบรรทัดเล็กบนหัวการ์ด (ลิงก์ไปหน้า Ticket) เพราะคิวไร้เจ้าของ 13 ใบเป็นข้อมูลที่ควรเห็น แค่ไม่ควรลงไปแข่งในอันดับที่มันไม่ได้อยู่ในนั้น

### Tests / Verification

ตรวจบนเบราว์เซอร์จริงซ้ำทั้ง light/dark · console ไม่มี error · คืนธีมเป็น light · **suite = 1,154 passed / 5,018 assertions** · tsc 0 · eslint 0 · build ผ่าน

### My assets → My assets & access (2026-09-06)

พนักงานไม่มีทางรู้เลยว่าตัวเองมีสิทธิ์เข้าถึงระบบอะไรบ้าง — ข้อมูลมีอยู่ใน Access Directory แต่เป็นทะเบียนของ IT ที่พนักงานทั่วไปเปิดไม่ได้ · หน้า My Assets เดิมจึงขยายเป็น **`/my-assets-access`** ตอบคำถามเดียวว่า "ตอนนี้ฉันถือครองอะไรอยู่บ้าง"

**รวมเป็นรายการเดียว ไม่แยกแท็บ** — ทรัพย์สินกับสิทธิ์เข้าถึงมาจากคนละ endpoint และไม่มีอะไรเหมือนกันเลยนอกจากเป็นของคนคนเดียวกัน · หน้าแบนทั้งสองอย่างให้เป็นแถวหน้าตาเดียวกัน (ไอคอน → ชื่อ → บรรทัดรอง → ตั้งแต่เมื่อไร) แล้วกรองด้วย chip ด้านบน · **แท็บจะซ่อนคำตอบจากคนที่ไม่รู้ว่าคำตอบอยู่แท็บไหน** ซึ่งเป็นคนที่หน้านี้สร้างมาเพื่อเขาพอดี
- chip ขึ้นเฉพาะชนิดที่คนคนนั้นมีจริง — chip ที่กดแล้วว่างคือทางตัน และสี่อันเรียงกันทำให้ดูเหมือนเมนูให้เลือกซื้อ
- **ปุ่มมีเฉพาะฝั่งทรัพย์สิน** (กดรับ / ส่งคืน) เพราะเป็นสิ่งที่ผู้ถือทำเองได้ · ฝั่งสิทธิ์อ่านอย่างเดียวตามที่ตัดสินใจไว้ว่า IT ให้สิทธิ์ด้วยมือหลังคำขอผ่าน — ปุ่มตรงนี้จะสัญญา flow ที่ไม่มีอยู่จริง
- KPI เพิ่มใบที่ 4 "สิทธิ์เข้าใช้งาน" · บล็อก "รอคุณกดรับ" ยังอยู่บนสุดเหมือนเดิม

**`GET /api/access/mine`** — ใช้ `AccessService::employeeAccess()` + `EmployeeAccessResource` ตัวเดียวกับแท็บ Access ในหน้า Employee สองจอจึงขัดกันเองไม่ได้ ต่างกันแค่ว่าใครมีสิทธิ์ถาม · อยู่**นอก** route group ของ Access Directory โดยตั้งใจ เพราะทุก read ในนั้นตอบต่อ `access.module` ซึ่งคือสิทธิ์ดูทะเบียนของทั้งบริษัท

**สิทธิ์ใหม่ `access.my`** — เดินตามรอย `assets.my` ทุกอย่าง: อยู่ในโมดูล access แต่ `normalizeAccess()` เก็บไว้เสมอแม้ตัวหลักปิด (เดิมโค้ดตัด `access.*` ทิ้งทั้งหมด) · migration แจกให้ทุก role ที่มี `assets.my` อยู่แล้ว — คนกลุ่มเดียวกัน: ใครที่ไว้ใจให้ดูอุปกรณ์ตัวเอง ก็ไว้ใจให้ดูบัญชีตัวเอง · **รันบน DB จริงแล้ว**

**การ์ด Permission แยกออกมา** — `assets.my` / `assets.return` เคยอยู่ท้ายการ์ด Assets ใต้ตัวหลักที่มันจงใจไม่สนใจ ทำให้สิทธิ์ที่พนักงานทุกคนมี ไปนั่งอยู่ในการ์ดของงาน IT · ตอนนี้เป็นการ์ด **"ทรัพย์สิน และการเข้าถึงของฉัน"** ของตัวเอง (บริการตนเอง · ไม่ขึ้นกับตัวหลัก) มีสามสวิตช์: ทรัพย์สินของฉัน → ส่งคืน · การเข้าถึงของฉัน · ฝั่ง backend ไม่แตะเลย กฎ "ส่งคืนต้องมีทรัพย์สินของฉัน" ยังอยู่ที่เดิม

**ลิงก์เก่าไม่พัง** — `/my-assets` redirect ไป `/my-assets-access` (คงคิวรีสตริง) เพราะเมลรับมอบ/เรียกคืนและกระดิ่งที่ส่งไปก่อนหน้านี้ยังชี้ที่เดิม · แก้ลิงก์ในโค้ดครบ 6 จุด (เมล 2 · กระดิ่ง 2 · Dashboard 2)

### Tests / Verification

`MyAccessTest` 6 ตัว — เห็นเฉพาะของตัวเอง · สิทธิ์ที่ถูกเพิกถอนไม่ขึ้น · ตอบต่อ `access.my` ไม่ใช่ตัวหลัก · **normalize ต้องไม่ตัด `access.my` ทิ้งตอนตัวหลักปิด** · บัญชีไม่มี employee record ได้ลิสต์ว่างไม่ใช่ 500 · ต้องล็อกอิน · `PermissionMatrixTest` ยังเขียว · **suite = 1,160 passed / 5,037 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน

ตรวจบนเบราว์เซอร์: redirect ทำงาน · ชื่อหน้า/เมนู/breadcrumb เปลี่ยนครบ · `/api/access/mine` ตอบ 200 ให้ role Standard (ก่อน migration คือ 403) · **ยังไม่ได้เห็นหน้าตอนมีข้อมูลจริง** — `php artisan serve` ดับระหว่างตรวจ (ข้อมูลทดสอบที่สร้างไว้ชั่วคราวลบคืนครบแล้ว ตาราง `access_memberships` กลับมาที่ 5 แถวเท่าเดิม)

### My assets & access: จัดกลุ่มให้อ่านออกตอนของเยอะ (2026-09-06)

รอบแรกเป็นรายการแบนยาว ๆ ต่อกันแล้วแบ่งหน้า — พอของเยอะขึ้นก็อ่านไม่ออก ไม่มีที่ให้สายตาพัก และไม่รู้ว่าตรงไหนหมดเรื่องทรัพย์สินแล้วขึ้นเรื่องบัญชี

- **จัดกลุ่มตามชนิด พร้อมหัวข้อ** (ไอคอนสี + ชื่อ + จำนวน) — หัวข้อคือสิ่งที่ทำให้รายการยาวสแกนได้ และทำให้**แต่ละแถวไม่ต้องบอกชนิดของตัวเองซ้ำ**
- **เลิกแบ่งหน้า** — คนหนึ่งคนถือของราว 5–20 อย่าง การแบ่งหน้าที่ 10 คือสิ่งที่ทำให้ครึ่ง Access ตกไปอยู่หน้า 2 ตั้งแต่แรก ทั้งที่หน้านี้สร้างมาเพื่อให้เห็นมัน
- **เรียงใหม่สุดก่อนในแต่ละกลุ่ม** — ของที่เพิ่งได้มาคือของที่คนจำได้น้อยที่สุด
- **ไอคอนใช้สีประจำชนิดของ Access registry** (`#7c3aed` กลุ่มอีเมล · `#0d9488` ไฟล์แชร์ · `#6366f1` โซเชียล · `#f59e0b` ซอฟต์แวร์) ทรัพย์สินใช้สีแบรนด์ — ไฟล์แชร์เป็นสีเขียวน้ำทะเลเหมือนกันทุกที่ที่เจอมัน

**แถวรวมเป็นก้อนเดียวชิดซ้าย** — เดิมชื่ออยู่ซ้ายสุด ชิป+วันที่อยู่ขวาสุด เหลือช่องว่างกลางแถว ~900px ที่สายตาต้องกระโดดข้ามเพื่อจับคู่ชื่อกับข้อมูลของมันเอง · ตอนนี้บรรทัดรองเก็บทุกอย่าง: สถานะ · ที่อยู่ · **วัตถุประสงค์** (ข้อมูลที่ API ส่งมาอยู่แล้วแต่รอบแรกไม่ได้ใช้) · **`ตั้งแต่ <วันที่>`** — เดิมวันที่ลอยอยู่ขวาโดยไม่มีป้ายบอกว่าคือวันอะไร และหมายคนละเรื่องกันระหว่างทรัพย์สิน (วันรับมอบ) กับสิทธิ์ (วันได้รับสิทธิ์) · ปุ่มส่งคืนไม่จองที่ 104px ท้ายแถวที่ไม่มีวันมีปุ่มอีกแล้ว

**KPI ไม่ทักทายด้วยศูนย์** — เดิม 4 ใบเป็นเรื่องทรัพย์สิน 3 ใบ พนักงานที่ไม่มีอุปกรณ์บริษัทเปิดมาเจอ `0 · 0 · 0` · ตอนนี้ 3 ใบที่มีความหมายเสมอ (ถือครองทั้งหมด · ทรัพย์สิน · สิทธิ์เข้าใช้งาน) แล้ว "รอกดรับ / กำลังส่งคืน" โผล่เฉพาะตอนมีค่า เพราะเป็นสถานะชั่วคราวไม่ใช่ตัวเลขประจำหน้า

**ระดับสิทธิ์ใช้ `AccessBadge` ของโมดูล Access** — รอบแรกผมวาดชิปเองแล้วโชว์ค่าดิบ ซึ่งจะทำให้สิทธิ์ `Write` อ่านว่า "Write" บนหน้านี้ แต่อ่านว่า "Read/Write" ทุกที่ในแอป · **มีแค่ไฟล์แชร์ที่มีระดับสิทธิ์** (Read / Write) ส่วนกลุ่มอีเมล ซอฟต์แวร์ โซเชียล ไม่มีเลย

### Tests / Verification

**suite = 1,160 passed / 5,037 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน · ตรวจบนเบราว์เซอร์ด้วยข้อมูลตัวอย่างครบทั้ง 5 ชนิด — กลุ่ม/หัวข้อ/สี/ป้าย Read/Write/ปุ่มส่งคืนถูกต้อง · **ลบข้อมูลตัวอย่างคืนแล้ว** (`access_memberships` กลับมา 5 แถวเท่าเดิม)

### Dashboard: กราฟจำนวนตั๋วต่อวัน 14 วัน (2026-09-07)

เติมส่วนที่สองของการ์ด **ภาพรวม Ticket** ตามที่ mockup ออกแบบไว้ (`จำนวนตั๋วต่อวัน — 14 วันล่าสุด`) ต่อจากโดนัท คั่นด้วยเส้น

**สองค่าต่อวัน: เข้าใหม่ กับ ค้างสะสม ณ สิ้นวัน**
- `opened` นับจาก `created_at` ต่อวัน
- `backlog` เป็น**ระดับ ไม่ใช่จำนวนเหตุการณ์** จึงต้อง*สร้างขึ้นใหม่*แทนการนับ: เริ่มจากยอดค้างก่อนเข้าช่วง แล้วเดินไปทีละวัน บวกที่เข้า ลบที่ปิด · ย้อนหลังได้เพราะแถวตั๋วมี timestamp ทั้งตอนเปิดและตอนปิด — ไม่มีการเก็บค่ารายวันไว้ที่ไหนเลย
- **3 query เท่านั้นไม่ว่าหน้าต่างจะกี่วัน** (เข้าต่อวัน · ปิดต่อวัน · ยอดตั้งต้น) — ถ้านับ ณ จุดเวลาทีละวันจะเป็น 14 รอบสแกนตาราง

**ไม่วาดซ้อนกันแบบ mockup — บวกกันไม่ได้** · "เข้าใหม่ 8" คือปริมาณที่ไหลเข้าวันนั้น ส่วน "ค้าง 12" คือยอดคงค้าง ณ สิ้นวัน แท่งซ้อนจะสื่อว่าผลรวม 20 มีความหมาย และตั๋วที่เข้าวันนั้นแล้วยังไม่ปิดจะถูกนับซ้ำในสองชั้นของแท่งตัวเอง · ใช้ **แท่ง = เข้าใหม่ · เส้น = ค้างสะสม** บนแกนเดียวกัน (หน่วยเดียวกันคือจำนวนใบ ไม่ใช่ dual-axis) ตอบสองคำถามที่คนดูการ์ดนี้ถามจริง: งานเข้าหนักผิดปกติไหม และกองค้างโตขึ้นหรือยุบลง
- ป้ายวันที่ 3 จุด (ต้น/กลาง/ท้าย) — ป้ายใต้ทุกแท่งอ่านไม่ออกที่ความกว้างนี้
- hover ทีละวันบอก `เข้า N · ค้าง M` · legend มีทั้งสองเส้น ตัวตนจึงไม่ได้ฝากไว้กับสีอย่างเดียว
- สีเดิมของการ์ด: แท่งน้ำเงินแบรนด์ · เส้น amber ตัวเดียวกับ "กำลังดำเนินการ"

### Tests / Verification

`DashboardSummaryTest::test_the_volume_series_counts_arrivals_and_rebuilds_the_backlog` — ยอดตั้งต้นจากตั๋วที่เปิดก่อนหน้าต่าง · ตั๋วที่ปิดในช่วงทำให้กองค้างลดลงในวันที่ปิด · **ตั๋วที่เปิดและปิดวันเดียวกันนับเป็นงานเข้าแต่ไม่ค้างข้ามคืน** · วันแรก/วันสุดท้ายของช่วงถูกต้อง · **พิสูจน์ว่าเทสต์จับได้จริงโดยถอดการลบยอดปิดออกจากการเดินวัน แล้วดูให้แดง** ก่อนคืนไฟล์ · ตรวจกับข้อมูลจริงบนเครื่อง (กองค้างไต่จาก 11 → 16 ตามวันที่เปิดตั๋วจริง) · **suite = 1,161 passed / 5,048 assertions** · tsc 0 · eslint 0 · pint · build ผ่าน

**เส้นกริดและแกนค่า** — กราฟรอบแรกไม่มีแกน y เลย เห็นรูปทรงแต่อ่านไม่ออกว่าเส้นค้างอยู่ที่ 10 หรือ 100 · เพิ่มเส้นกริด 3 เส้น (บน/กลาง/ฐาน) พร้อมตัวเลขในช่องซ้าย ระดับสีเท่า `border` เพราะเส้นกริดมีไว้ให้วัด ไม่ได้มีไว้ให้มอง
- **ยอดสเกลปัดขึ้นเป็นเลขที่คนพูดออกเสียงได้** (1 · 2 · 4 · 5 · 10 และพหุคูณสิบ) — ที่ต้องมี 4 เพราะยอดจริง 23 ถ้าปัดเป็น 50 จะทิ้งความสูงของกราฟไปครึ่งหนึ่งและทำให้ทุกแท่งแบนหมด
- **เส้นกลางขึ้นเฉพาะตอนหารสองแล้วลงตัว** — ขีดที่เขียนว่า 2.5 บนกราฟนับจำนวนใบคือเส้นที่วัดอะไรไม่ได้
- **แกนนอนมีป้ายทุกวัน ตรงกับแท่งของตัวเอง** — ใช้โครง flex ชุดเดียวกับแท่ง (gap เท่ากัน · flex-1 เท่ากัน · เยื้องพ้นช่องแกนเท่ากัน) ป้ายจึงอยู่ใต้วันของมันเป๊ะ ไม่ใช่ใกล้ ๆ · เดิมมีสามป้ายกระจาย คนอ่านต้องนับแท่งเอาเองว่าวันอังคารอยู่ไหน
- แสดงเลขวันอย่างเดียว ยกเว้นวันแรกกับวันที่ข้ามเดือน (`9/1`) ซึ่งเป็นจุดเดียวที่เลขวันเปล่า ๆ กำกวม

**ยังไม่ได้ดูบนเบราว์เซอร์** — session หมดอายุอีกครั้ง (เด้งหน้า login)

### Ticket: อัปเดตความคืบหน้าระหว่างทาง + สถานะ Pending (2026-09-08)

เดิม IT มีที่เขียนอยู่สองที่เท่านั้น — บันทึกตอนกดรับเคส กับผลการแก้ไขตอนปิดเคส · ระหว่างนั้นทั้งหมด (สั่งอะไหล่ไปแล้ว · รอผู้แจ้งตอบ · vendor เงียบ) ถูกพูดปากเปล่าและไม่ได้ถูกบันทึกไว้ที่ไหน คนแจ้งจึงเงียบหายไปหลายวัน และคนที่มารับช่วงต่อต้องไล่ถามเอาเอง

**ตาราง `ticket_updates`** — หนึ่งแถวคือหนึ่งบันทึก เรียงเก่าไปใหม่ · เก็บ `author_name` ควบคู่ `user_id` เพราะบันทึกต้องอ่านออกแม้คนเขียนลาออกไปแล้ว (แบบเดียวกับแถวอนุมัติ) · `status_from`/`status_to` เติมเฉพาะตอนบันทึกนั้น**ย้ายสถานะเคสด้วย** ไทม์ไลน์จึงขึ้นป้าย "พักเคส/ทำต่อ" เฉพาะที่มีการเปลี่ยนจริง

**`POST /api/tickets/{ticket}/updates`** — gate เดียวกับปิดเคส (`tickets.resolve` + ต้องเป็นผู้ถือเคส) · รับ `body` (บังคับ ≥5 ตัวอักษร) + `pending` (bool) · `pending` คือ**สถานะที่ขอให้เป็น ไม่ใช่ปุ่มสลับ**: เขียนบันทึกครั้งที่สองระหว่างยังรออะไหล่ตัวเดิม โดยติ๊กค้างไว้ เคสก็ยังพักอยู่ ไม่ถูกดึงกลับมาเงียบ ๆ

**สถานะใหม่ `Pending`** — `Open → InProgress ⇄ Pending → Completed / Canceled`
- **นาฬิกา SLA ไม่หยุด** (ผู้ใช้ตัดสินใจ) — พักคืองานที่หยุด ไม่ใช่เคสที่หยุด คนแจ้งก็ยังรออยู่เหมือนเดิม · คนที่พักต้องเขียนเหตุผลไปพร้อมกันเสมอ เวลาเกิน SLA จึงอ่านออกว่าเพราะอะไร แทนที่จะต้องเดา
- `TicketStatus::live()` / `liveValues()` / `working()` — เดิมมี 17 จุดที่เขียน "open หรือ in_progress" ด้วยมือ ลิสต์ที่เขียนด้วยมือคือลิสต์ที่วันหนึ่งจะถูกเติมสมาชิกใหม่แค่ 16 จุด · กวาดครบทั้ง TicketController · TicketService · TicketSlaAlertService · TicketDigestService · SidebarBadgeService · DashboardSummaryService · RequestService · ServiceRequestResource
- `resolve()` และ `forward()` รับเคสสถานะ Pending ได้แล้ว — ของที่รออยู่มาถึงแล้วก็ปิดได้เลย ไม่ต้องกดกลับมา In progress ก่อน
- คอลัมน์ `tickets.status` เป็น `string` อยู่แล้ว ไม่ต้อง migrate

**แจ้งผู้แจ้งทุกครั้ง** — กระดิ่ง `notif_ticket_owner_updated` (ต่อยอด `TicketOwnerNotification` เดิม เพิ่ม event `updated`) + เมล `ticket.updated` ที่พก**ตัวบันทึกและสถานะปัจจุบัน**ไปด้วย · ตัวแปรใหม่ `{{ticket.update}}` (escape + `nl2br` เหมือน details/resolution) และ `{{ticket.status}}`

**หน้าจอ**
- Drawer รายละเอียดมีแท็บที่สาม **"ความคืบหน้า"** พร้อมจำนวน — ไทม์ไลน์จุด+เส้นภาษาเดียวกับ spine ทางขวา
- แบนเนอร์ใต้หัวเรื่อง: เคสที่พักไว้บอกทุกคนที่เปิดอ่านว่าพักอยู่ **พร้อมเหตุผลจากบันทึกล่าสุด** (เหตุผลคือสาระทั้งหมดของการพัก ไม่ควรต้องเข้าไปหา)
- ปุ่ม **อัปเดต** อยู่ที่ footer และบนแบนเนอร์ (เฉพาะผู้ถือเคส) · ไดอะล็อกมี textarea + ช่อง "พักเคสนี้ไว้" ที่เตือนเรื่องนาฬิกา SLA ตรงจุดที่กำลังจะพัก แทนที่จะให้ไปรู้ตอนมันเกินแล้ว
- โดนัทบน Dashboard เพิ่มชิ้นที่ห้า **สี orange** — วน validator ใหม่: เทียบ amber ได้ ΔE 12.1 (deutan) และ 15.5 (สายตาปกติ) ผ่านทั้งสองเพดาน · เลือกโทนข้างเคียง amber โดยตั้งใจ เพราะ In progress กับ Pending คือช่วงเดียวกันของเคส · ป้ายสถานะยังเป็น amber (ชุดสีป้ายไม่มีขั้น orange) ซึ่งเป็นตระกูลเดียวกันและป้ายมีคำกำกับตัวเองอยู่แล้ว
- การ์ด "สถานะปัจจุบัน" ของหน้า Tickets เพิ่มแถว **พักเคสไว้** (ขึ้นเฉพาะตอนมีค่า) · แยก `backlog_pending` ออกจาก `backlog_in_progress` เพราะตัวเลขบนการ์ดต้องตรงกับฟิลเตอร์ที่มันเปิดให้

### Tests / Verification

`TicketUpdateTest` 14 ตัว — เขียนบันทึกโดยไม่ย้ายสถานะ · พักแล้วบันทึกการย้าย · **พักแล้ว SLA ไม่ขยับ** · บันทึกซ้ำบนเคสที่พักอยู่ไม่ดึงกลับ · ไม่ติ๊กแล้วกลับมาทำต่อ · ปิด/ส่งต่อเคสที่พักได้ · เฉพาะผู้ถือเคส · เคสที่ยังไม่มีคนรับ/ปิดแล้วเขียนไม่ได้ · บังคับกรอกบันทึก · เรียงเก่าไปใหม่ · backlog แยกช่อง · badge งานของฉันนับเคสที่พักด้วย · เพิ่มเทสต์เมล `ticket.updated` และกระดิ่ง `updated` ในไฟล์เดิม
**พิสูจน์ guard ด้วยการถอดออกทีละตัวแล้วดูให้แดง** — guard สถานะของ endpoint ใหม่ · การผ่อนให้ `resolve()` และ `forward()` รับ Pending (ถอดแล้วเทสต์ที่ควรแดงแดงตัวเดียว ตัวอื่นยังเขียว)
**suite = 1,177 passed / 5,117 assertions** · tsc 0 · pint ผ่าน · migration รันบน DB จริงแล้ว · เพิ่มแถว `email_templates` (`ticket.updated`) และ `notification_templates` (`notif_ticket_owner_updated`) บน DB จริงแบบ firstOrCreate ทีละแถว — **ไม่ได้รัน `db:seed`** ซึ่งจะทับเทมเพลตที่แก้ด้วยมือไว้

ตรวจบนเบราว์เซอร์จริง — เปิดเคส TKT-HW-260901-001 กด **อัปเดต** ติ๊กพักเคส: ป้ายสถานะเปลี่ยนเป็น *พักเคสไว้* (amber) · แบนเนอร์พร้อมเหตุผลขึ้นใต้หัวเรื่อง · แท็บ *ความคืบหน้า 1* แสดงบันทึกพร้อมชิป *พักเคส* · spine ขั้นที่ 2 ขึ้น "บันทึกความคืบหน้า 1 ครั้ง" · **SLA ยังเดินต่อ (ยังขึ้นเกิน 4วัน 9ชม. เท่าเดิม)** · KPI หน้า Tickets อ่านว่า `12 รอรับ · 3 กำลังทำ · 1 พักไว้` และการ์ดสถานะปัจจุบันขึ้นแถวพักเคสไว้ · โดนัทหน้า Dashboard ขึ้นชิ้นที่ห้าสีส้ม 1 เคส (6%) · **ลบข้อมูลทดสอบคืนแล้วทั้งหมด** — แถว `ticket_updates` · กระดิ่ง · งานเมลในคิว · และคืนสถานะเคสเป็น In progress ตามเดิม

**ไทม์ไลน์ครบเส้นทาง** — แท็บความคืบหน้าไม่ได้มีแค่บันทึกระหว่างทางแล้ว: **รับเคส** (พร้อมบันทึกแรกของเจ้าหน้าที่) อยู่หัวแถว และ **ปิดเคส** (พร้อมผลการแก้ไข สีเขียว/เทาตามผลลัพธ์) อยู่ท้ายแถว · สองปลายนี้ไม่ได้เป็นแถวใน `ticket_updates` แต่อ่านจาก `responded_at`/`take_note` และ `resolved_at`/`resolution` ของตั๋วเอง — ข้อมูลชุดเดิมที่มีมาก่อนฟีเจอร์นี้ จึงไม่ต้องย้อนสร้างแถวให้ของเก่า และ**เคสที่ปิดไปก่อนหน้านี้ก็อ่านได้ครบเส้นทางเหมือนกัน** · ตัวเลขบนแท็บนับทุกเหตุการณ์ในนั้น ส่วนบรรทัด "บันทึกความคืบหน้า N ครั้ง" ที่ spine ยังนับเฉพาะบันทึกเหมือนเดิม · ข้อความว่างเปลี่ยนไปตามความจริงที่เหลืออยู่กรณีเดียว คือเคสที่ยังไม่มีใครรับ

ตรวจบนเบราว์เซอร์ (อ่านอย่างเดียว ไม่แตะข้อมูล): เคสที่ปิดสำเร็จ TKT-HW-260812-001 อ่านว่า *รับเคสโดย super 13:42 → แก้ไขเสร็จสิ้น 13:49* · เคสที่ยกเลิก TKT-HW-260807-001 ขึ้นกากบาทเทากับกล่องเหตุผลสีเทา และแถวรับเคสที่ไม่มีบันทึกแสดงแค่หัวข้อ · tsc 0 · eslint 0 · build ผ่าน

### Ticket: หยุดนาฬิกา SLA ได้ ถ้าคนพักเคสสั่งให้หยุด (2026-09-09)

รอบก่อนพักเคสแล้วนาฬิกาเดินต่อเสมอ ซึ่งถูกสำหรับ "รอผู้แจ้งตอบ" แต่ไม่ถูกสำหรับ "อะไหล่อยู่กับ vendor และไม่มีใครฝั่งเราขยับได้" · ตอนนี้เลือกได้**เป็นครั้ง ๆ ตอนพัก** ค่าเริ่มต้นคือไม่หยุด (พฤติกรรมเดิม จะได้ไม่มีใครหยุดนาฬิกาโดยไม่ตั้งใจ) และไม่มีสิทธิ์ใหม่ — ใครพักเคสได้ก็เลือกได้ คือผู้ถือเคส

**3 คอลัมน์**
| คอลัมน์ | หน้าที่ |
|---|---|
| `tickets.sla_paused_at` | ไม่ null = นาฬิกาหยุดอยู่ ตั้งแต่เวลานี้ (มี index เพราะทุก query ที่ถามหาเคสเกินกำหนดต้องกรองมันออก) |
| `tickets.sla_paused_minutes` | นาทีทำการที่พักไปแล้วสะสม |
| `ticket_updates.sla_paused` | บันทึกครั้งนี้สั่งหยุดนาฬิกาด้วย — อยู่ที่นี่เพราะสองคอลัมน์บนถูกล้างทันทีที่เคสกลับมาทำต่อ หลังจากนั้นแถวนี้คือหลักฐานเดียวว่าตอนนั้นตัดสินใจอะไรไว้

**"หยุดนาฬิกา" = "เลื่อนเดดไลน์ออกไปเท่ากับเวลาที่หยุด"** — เขียนแบบนี้ทำให้ทุกคนที่อ่านค่าต่อ (ป้าย · รายการ · คำตัดสินทัน/ไม่ทัน) ยังเทียบเวลากับเวลาเหมือนเดิม ไม่ต้องรู้จักการพักเลย · ครึ่งที่ยังหยุดอยู่คำนวณสด (`TicketSla::pausedMinutes`) ไม่ได้เก็บ เดดไลน์ของเคสที่พักอยู่จึงขยับตามนาฬิกาจริง ซึ่งคือหน้าตาของคำว่า "หยุด" เมื่อมองจากข้างนอก
- ตอนกลับมาทำต่อ **และตอนปิดเคสทั้งที่ยังพักอยู่** → ฝากนาทีที่พักเข้า `sla_paused_minutes` แล้วดัน `sla_resolve_due_at` ที่เก็บไว้ออกไปเท่ากัน · ต้องดันคอลัมน์ที่เก็บด้วยเพราะการเรียง/ฟิลเตอร์เกินกำหนด/sweep แจ้งเตือน เทียบกับคอลัมน์นั้นใน SQL — เคสที่พักไปหนึ่งสัปดาห์ต้องไม่กลับมาพร้อมสถานะเกินกำหนดแล้ว · ล้าง `sla_resolve_alert_level` ด้วยเหตุผลเดียวกับที่ `take()` ล้าง
- `TicketSla::resolveDueAt()` บวกเวลาที่พักเข้าไปด้วย ทำให้ **% SLA บน Dashboard ตัดสินด้วยเดดไลน์เดียวกับที่ป้ายบนเคสแสดง** (เดิมสองที่นี้คิดคนละทาง — จุดนี้คือส่วนที่กินแรงจริง ไม่ใช่ตัว migration)
- เคสที่นาฬิกาหยุด **ถูกกันออกจาก** ฟิลเตอร์ `?sla=breached` · ตัวเลข `sla_breached_now` · และ sweep แจ้งเตือน SLA — นาฬิกาที่หยุดอยู่ไม่มีเดดไลน์ให้เลยกำหนด
- ยังไม่แตะ: การเรียง `sla_due` ยังใช้คอลัมน์ที่เก็บไว้ เคสที่พักอยู่จึงลอยขึ้นบนเหมือนใกล้ครบกำหนด — ป้าย SLA ของมันอ่านว่า "หยุด SLA" อยู่แล้ว จึงไม่ได้ทำให้เข้าใจผิด

**หน้าจอ** — ช่อง "หยุดนาฬิกา SLA ด้วย" ซ้อนอยู่ใต้ "พักเคสนี้ไว้" และโผล่เฉพาะตอนติ๊กพัก เพราะเป็นการตัดสินใจที่แคบกว่าและอยู่ในกันและกัน · บรรทัดสีเหลืองใต้กล่องบอกผลของสิ่งที่กำลังจะกดจริง ๆ (เดินต่อ / หยุดแล้วเลื่อนเดดไลน์) · ป้าย SLA เปลี่ยนเป็น **หยุด SLA** แทนการนับถอยหลังที่ตัวเลขไม่ขยับ · ไทม์ไลน์ติดชิป "หยุด SLA" ที่บันทึกซึ่งสั่งหยุด · ทั้งสองช่องเปิดขึ้นมาตามสถานะปัจจุบันของเคส บันทึกครั้งที่สองระหว่างรอเรื่องเดิมจึงยืนยันของเดิม ไม่ใช่เปลี่ยนมันเงียบ ๆ

### Tests / Verification

`TicketUpdateTest` เพิ่มเป็น 20 ตัว — พักเฉย ๆ ไม่หยุดนาฬิกา · สั่งหยุดแล้วบันทึกว่าใครสั่ง · **เดดไลน์ถูกดันออกเท่ากับเวลาที่รอ (นาทีทำการ)** · เคสที่หยุดนาฬิกาไม่โผล่ในรายการเกินกำหนดและไม่ถูกนับใน `sla_breached_now` · ปิดเคสทั้งที่ยังหยุดอยู่ตัดสินด้วยเดดไลน์ที่เลื่อนแล้ว (`met`) · บันทึกครั้งถัดไปเริ่มนาฬิกาใหม่ได้โดยเคสยังพักอยู่ · `pause_sla` บนเคสที่ไม่ได้พักไม่มีผล
**พิสูจน์ด้วยการถอดออกแล้วดูให้แดงทีละตัว** — การดันคอลัมน์เดดไลน์ · การฝากเวลาพักตอนปิดเคส · การกันเคสที่หยุดนาฬิกาออกจากฟิลเตอร์เกินกำหนด
เทสต์เวลาต้องปักเวลาไว้ (`travelTo` เช้าวันจันทร์) เพราะการพักวัดเป็น**นาทีทำการ** — เทสต์ที่บังเอิญรันตอนสองทุ่มจะฝากศูนย์นาทีอย่างถูกต้องทุกครั้ง
**suite = 1,183 passed / 5,147 assertions** · tsc 0 · eslint 0 error · pint · build ผ่าน · migration รันบน DB จริงแล้ว · ตรวจไดอะล็อกบนเบราว์เซอร์แล้วกดยกเลิก **ไม่ได้เขียนข้อมูลใด ๆ** (ยืนยันว่าไม่มีเคสที่นาฬิกาหยุดค้างอยู่)

### ยกเลิก: พักเคส (Pending) และหยุด SLA (2026-09-13)

ถอนสองอย่างนี้ออกทั้งหมดตามที่ตัดสินใจใหม่ — จะตอบโจทย์เดิมด้วยการให้ super admin สร้าง**กฎ SLA เพิ่มได้เองที่หน้า Settings** แทน ซึ่งเก็บการตัดสินใจไว้กับคนที่เป็นเจ้าของเป้าหมาย ไม่ใช่กับคนที่บังเอิญถือเคสอยู่ · **บันทึกความคืบหน้า (แท็บไทม์ไลน์) ยังอยู่ครบ** เพราะนั่นคือโจทย์ตั้งต้น

**DB — ย้อนกลับครบ ไม่มีข้อมูลค้าง** (ตรวจก่อนลงมือ: เคส `pending` 0 · เคสที่หยุดนาฬิกา 0 · นาทีพักสะสม 0)
- `migrate:rollback --step=1` คืน `tickets.sla_paused_at` / `sla_paused_minutes` แล้วลบไฟล์ migration ทิ้ง (ย้อนก่อนลบ ไม่งั้น `down()` หายไปพร้อมไฟล์)
- ตัด `status_from` / `status_to` ออกจาก `ticket_updates` ด้วย migration ชั่วคราว (ไม่ ALTER ด้วยมือ เพราะ migration ติดตามได้) — **บันทึก 3 แถวที่เขียนไว้ยังอยู่ครบ**
- จากนั้น**ยุบประวัติให้เรียบ**: แก้ migration ตัวสร้างตารางให้ไม่สร้างสองคอลัมน์นั้นตั้งแต่แรก · ลบ migration ตัวตัดทิ้ง · ลบแถวของมันออกจากตาราง `migrations` — ไม่เหลือประวัติแบบ "สร้างแล้วลบ" และ fresh install ได้ schema ตรงกับ DB จริงเป๊ะ (ยืนยัน: `migrate:status` ลงท้ายที่ตัวสร้างตาราง · `migrate --pretend` = Nothing to migrate · และ suite ที่สร้าง schema ใหม่ทุกครั้งยังเขียว)
- แถว `email_templates` ของ `ticket.updated` ถูกอัปเดตเอาบรรทัด `{{ticket.status}}` ออก — **ตรวจก่อนเขียนว่าตรงกับมาตรฐานเดิมเป๊ะ** ถ้าโดนแก้ด้วยมือจะข้ามไปให้คนตัดสินใจเอง (ไม่ทับงานใคร)
- คอลัมน์ `tickets.status` เป็น string อยู่แล้ว ไม่ต้องแตะ

**โค้ดที่ถอนออก** — `TicketStatus::Pending` · `addUpdate()` เหลือพารามิเตอร์เดียวคือตัวบันทึก · `stopSlaClock`/`resumeSlaClock` · `TicketSla::pausedMinutes()` และคีย์ `paused` ใน payload · การกันเคสที่หยุดนาฬิกาออกจากฟิลเตอร์เกินกำหนด/sweep/`sla_breached_now` · `backlog_pending` · ชิ้นสีส้มในโดนัท · แถว "พักเคสไว้" บน Dashboard · ช่องพักเคส/หยุด SLA ในไดอะล็อก · ป้าย "หยุด SLA" · คีย์ภาษา 12 คีย์ทั้ง en/th
**ที่เก็บไว้** — `TicketStatus::live()` / `liveValues()` / `working()` เพราะมันคือการตั้งชื่อให้ลิสต์ที่เคยเขียนด้วยมือ 17 จุด และตอนนี้ให้ค่าเท่ากับของเดิมเป๊ะ (live = open + in_progress, working = in_progress) · แถม `SettingsController` ที่คำนวณเดดไลน์ใหม่ตอนแก้ค่า SLA ก็ใช้ `liveValues()` แทนลิสต์ที่เขียนมือไว้เดิม

### Tests / Verification

`TicketUpdateTest` เหลือ 7 ตัว (จาก 20) — เขียนบันทึกโดยเคสและเดดไลน์ไม่ขยับ · เฉพาะผู้ถือเคส · เคสที่ยังไม่มีคนรับ/ปิดแล้วเขียนไม่ได้ · บังคับกรอก · เรียงเก่าไปใหม่ · **บันทึกไม่ถูกส่งมากับ list endpoint** · ปรับเทสต์เมลและกระดิ่งให้ตรงกับ signature ใหม่ · `DashboardSummaryTest` เอา `pending` ออกจาก by_status
**suite = 1,170 passed / 5,093 assertions** · tsc 0 · eslint 0 error · pint · build ผ่าน

### SLA: เป้าหมายเป็นแถวที่เพิ่มได้ และเคสจากคำขอมีเวลาของตัวเอง — หลังบ้าน (2026-09-13)

**ที่มา** — ไปไล่ดูของจริงก่อนออกแบบ แล้วเจอว่าเคสที่เปิดอัตโนมัติจากคำขอเกิดมาแบบ `priority = null` → `resolveHours(null)` ตกไปใช้ medium เงียบ ๆ · เดดไลน์แรกจึงเป็นค่าที่ไม่มีใครเลือก และถูกเขียนทับอีกครั้งตอนมีคนกดรับ · ตัวอย่างจริง RQ-2026-0048 (ขอจอ) ใช้เวลาจริง 46.8 ชม.ทำการ ชนเป้า 25 ชม. → **missed ทั้งที่ไม่มีอะไรผิดพลาด**

รากของปัญหาคือ **`priority` ตอบว่า "ด่วนแค่ไหน" ไม่ใช่ "งานนี้ยาวแค่ไหน"** และคนตั้งมันคือคนกดรับเคส — ส่วนความยาวของงานถูกกำหนดตั้งแต่ตอนเลือกประเภทคำขอแล้ว แต่ไม่มีที่ให้เก็บ

**ตาราง `sla_targets`** แทน JSON ก้อนเดียวใน `app_settings` · หนึ่งแถว = หนึ่งเป้าหมาย: `scope` (`priority` / `request_type`) · `match_value` · `resolve_hours` · `enabled` · unique ที่ (scope, match_value) ให้กฎซ้ำเกิดไม่ได้ตั้งแต่ระดับ DB
- **แถวคือค่าที่ทับ ไม่ใช่ค่าที่จำเป็นต้องมี** — ตารางว่างได้ ทุกเคสยังได้เป้าหมายจาก `defaults()` ในโค้ด ซึ่งเป็นคุณสมบัติเดิมที่ทำให้ระบบไม่มีวันไม่มีค่า SLA
- migration **ยกค่าที่เซฟไว้แล้ว (5/9/25/73) มาเป็นแถวให้อัตโนมัติ** แล้วลบคีย์ `ticket_sla` ทิ้ง — สองแหล่งข้อมูลสำหรับคำตอบเดียวคือจุดที่มันเริ่มไม่ตรงกัน · `down()` เขียนกลับเป็น JSON ให้ด้วย ย้อนแล้วไม่เสียข้อมูล

**ลำดับตายตัวข้อเดียว ไม่มีให้ลาก:** `request_type` → `priority` → `defaults()` (`SlaScope::precedence()`)
request_type ต้องชนะเพราะเคสจากคำขอ**ถูกตั้ง priority เสมอ**ตอนกดรับ ถ้าให้ priority ชนะ กฎประเภทคำขอจะไม่มีวันทำงานเลยสักครั้ง

**`take()`/`assign()` ไม่ทับเดดไลน์ของเคสที่เข้ากฎ request_type** — "จอต้องใช้เวลาจัดหา 3 วัน" ไม่ได้เลิกเป็นความจริงเพราะช่างที่กดรับติ๊กว่าด่วน · priority ยังตัดสินทุกอย่างที่มันเคยตัดสิน แค่ไม่หดเดดไลน์ที่ถูกกำหนดโดยเนื้องาน

**รายละเอียดที่ต้องระวังและจัดการแล้ว**
- `Ticket::serviceRequest()` (ทางกลับของ `service_requests.ticket_id`) + eager load ในหน้า list — ไม่งั้น N+1 หนึ่ง query ต่อแถว · ตรวจแล้วว่าไม่มี endpoint อื่นที่คืน TicketResource เป็นชุด
- `Builder::value()` **ใช้ cast ของโมเดล** เลยคืน enum ไม่ใช่สตริง — ต้องบีบเป็น string ก่อนเทียบกับ `match_value`
- `SlaTarget::booted()` ล้าง memo ทุกครั้งที่มีการบันทึก/ลบ — ปล่อยให้ผู้เรียกจำเองคือสิ่งที่วันหนึ่งจะมีคนลืม แล้วอาการคือหน้า Settings เซฟเลขใหม่แล้วโชว์เลขเก่า
- `PUT /api/settings/sla` รับ `ticket_sla_request` เป็น**ทั้งลิสต์** แถวที่หายไปคือแถวที่ถูกลบ · ไม่ส่งคีย์นี้มาเลย = ไม่แตะกฎเดิม (ฟอร์ม Priority เซฟเดี่ยวได้)
- `TicketResource.sla_target` บอกว่าเป้าหมายของเคสนี้มาจากไหน (`scope` / `value` / `hours`) ไว้ให้หน้าจออธิบายว่าทำไมเคส critical ได้ 3 วัน

### Tests / Verification

`SlaTargetTest` 14 ตัว — ไม่มีกฎ → ค่า default และรายงานว่า "ไม่มีใครเลือก" · กฎ priority ทับ default · **request_type ชนะ priority** · กฎที่ปิดอยู่ถูกข้าม · เคสที่แจ้งเองไม่โดนกฎคำขอ · **กดรับไม่หดเดดไลน์ที่มาจากกฎคำขอ** · กดรับเคสธรรมดายังตั้งเดดไลน์จาก priority เหมือนเดิม · เดดไลน์+คำตัดสินใช้เป้าหมายเดียวกัน · settings เซฟเป็นแถว · แถวที่ถูกตัดออกหายไป · เซฟฟอร์ม priority เดี่ยวไม่แตะกฎคำขอ · ประเภทคำขอที่ไม่รู้จักถูกปฏิเสธ 422 · แก้กฎแล้วเดดไลน์เคสที่ยังไม่ปิดขยับตาม · เคสบอกที่มาของเป้าหมายตัวเองได้
**พิสูจน์ด้วยการถอด guard ออกแล้วดูให้แดง** — เงื่อนไข "กดรับไม่ทับเดดไลน์ของกฎคำขอ" (ถอดแล้วแดงตัวเดียว อีกตัวยังเขียว)
แก้เทสต์เดิม `TicketSlaTest::test_sla_target_is_configurable_in_settings` ให้ตั้งค่าผ่านแถวแทน JSON key ที่เลิกใช้
**suite = 1,184 passed / 5,127 assertions** · pint · migration รันบน DB จริงแล้ว (ค่า 5/9/25/73 ย้ายมาเป็นแถวครบ) · ตรวจบน DB จริงว่า**พฤติกรรมยังเหมือนเดิมทุกเคส** เพราะยังไม่มีกฎ request_type สักข้อ — 12 เคสจากคำขอยังได้ 25 ชม. เท่าเดิม


### SLA: หน้าจอ — ตั้งกฎตามประเภทคำขอ และบอกที่มาของเดดไลน์ (2026-09-13)

**Settings → Tickets & SLA เพิ่มส่วน "เป้าหมายตามประเภทคำขอ"** ใต้ตาราง Priority เดิม
- เป็น**ลิสต์ที่เพิ่มแถวเอง** ไม่ใช่ตารางตายตัว — เพิ่มเฉพาะประเภทที่ความยาวงานต่างจากเป้าหมายตาม Priority · แต่ละแถวมีไอคอน+สีประจำประเภท (ใช้ `REQUEST_TYPE_META` ชุดเดียวกับหน้า Requests) · ช่องชั่วโมง · สวิตช์เปิด/ปิด · ปุ่มลบ
- dropdown เสนอเฉพาะประเภทที่**ยังไม่มีกฎ** — กฎซ้ำจึงสร้างไม่ได้ตั้งแต่หน้าจอ (และ unique index กันไว้อีกชั้น) · ใช้ครบทุกประเภทแล้วจะบอกว่าไม่เหลือให้เพิ่ม
- แถวที่ปิดสวิตช์ขึ้นชื่อแบบขีดฆ่า — ตัวเลขยังอยู่ แค่ไม่ทำงาน
- ส่งทั้งลิสต์ตอนเซฟ แถวที่ถูกลบบนจอจึงหายจาก DB · validate เหมือนแถว Priority (1–8760 ชม. และต้องไม่น้อยกว่าเป้าหมายตอบรับ)

**Drawer ของเคสเพิ่มบรรทัด "เป้าหมาย"** ใต้กำหนดตอบรับ/ปิดเคส — อ่านว่า `72h · ตามประเภทคำขอ (Hardware / peripheral)` หรือ `25h · ตามความสำคัญ` หรือ `24h · ค่าเริ่มต้น` · ถ้าไม่มีบรรทัดนี้ เดดไลน์ 3 วันบนเคส critical จะอ่านเหมือนบั๊ก · `RailRow` เพิ่มโหมด `wrap` เพราะบรรทัดนี้เป็นประโยค ไม่ใช่ timestamp — ตัดท้ายทิ้งแล้วเสียความหมาย

### Tests / Verification

tsc 0 · eslint 0 error · build ผ่าน · **suite = 1,184 passed / 5,127 assertions** (จากรอบหลังบ้าน ไม่มีโค้ด PHP เปลี่ยนในรอบนี้)

ตรวจบนเบราว์เซอร์ครบวงจรด้วยเคสจริง **TKT-HW-260901-001 (ขอจอ)** ซึ่งเป็นเคสที่จุดประเด็นนี้มาแต่แรก:
1. ก่อนตั้งกฎ — SLA อ่านว่า **Missed** (กำหนดปิด 2026-09-04, เป้าหมาย 25 ชม. ตามความสำคัญ)
2. เพิ่มกฎ `Hardware / peripheral = 72 ชม.` แล้วเซฟ
3. เปิดเคสเดิมอีกครั้ง — **Met** · กำหนดปิดขยับเป็น 2026-09-14 09:13 · บรรทัดเป้าหมายอ่านว่า `72h · request type (Hardware / peripheral)`
4. โหลดหน้า Settings ใหม่ — แถวยังอยู่ครบ (72 ชม. เปิดใช้งาน) ยืนยันว่า payload ไป-กลับถูกต้อง
5. กดลบแล้วเซฟ — กฎหายจาก DB · **คืนค่าเดิมครบ** (4 แถว priority, request_type 0 แถว) · ไม่มี error ใน console ตลอดทาง

**ไม่ได้แตะข้อมูลของจริงค้างไว้เลย** — ตรวจซ้ำแล้วว่า `updated_at` ของตั๋วไม่ขยับ (ยังเป็น 2026-09-08) เพราะเคสที่ปิดแล้วถูกแช่ไว้โดยตั้งใจ ไม่เข้าลูปคำนวณเดดไลน์ใหม่

### SLA: รื้อวิธีตั้งค่าใหม่ — จาก "อีกระบบหนึ่ง" เป็น "ข้อยกเว้นของตารางด้านบน" (2026-09-13)

รอบแรกทำเสร็จแล้วผู้ใช้บอกว่า "วิธีการตั้งค่าแปลก" ซึ่งถูก — ตรวจแล้วเจอสามข้อที่เป็นความผิดของการออกแบบ

**1. หน้าเดียวกันถามเรื่องเดียวกัน แต่ใช้วิธีตั้งค่าคนละแบบ** — ฝั่ง Priority เป็นตารางตายตัวกรอกเลข ฝั่งประเภทคำขอเป็นลิสต์ที่ต้องกดเพิ่มเอง มีสวิตช์ มีถังขยะ · ทั้งคู่ตอบคำถามเดียวกันคือ "เคสแบบนี้ปิดภายในกี่ชั่วโมง" แต่ต้องเรียนรู้สองแบบ

**2. `<select>` ถูกใช้เป็นปุ่ม** — เลือกจาก dropdown แล้วมันสร้างแถวใหม่ทันทีแล้วรีเซ็ตตัวเอง คือการกระทำที่ปลอมตัวเป็นช่องกรอก · และตอนยังไม่มีกฎ (สภาพปกติ) ทั้งส่วนเหลือแค่ dropdown ลอย ๆ ไม่บอกว่าถ้าไม่ตั้งจะเกิดอะไรขึ้น

**3. ลำดับความสำคัญของกฎอยู่ในประโยค ไม่ได้อยู่ในเลย์เอาต์** — "ประเภทคำขอชนะ Priority" เป็นกฎสำคัญที่สุดของฟีเจอร์ แต่เขียนเป็นบรรทัดสีฟ้าเล็ก ๆ ส่วนเลย์เอาต์วางสองส่วนเป็นพี่น้องกันเหมือนไม่เกี่ยวข้องกัน

**ที่แก้**
- **หัวข้อเปลี่ยนเป็น "ยกเว้นเคสที่เปิดจากคำขอเหล่านี้"** และย่อหน้าเข้ามาใต้เส้นแนวตั้ง — คำว่า *ยกเว้น* ทำหน้าที่บอกลำดับความสำคัญแทนบรรทัดอธิบาย และเลย์เอาต์เห็นด้วยกับคำนั้น (ตัดบรรทัดสีฟ้าทิ้ง)
- **ปุ่ม "+ เพิ่มข้อยกเว้น"** เพิ่มแถวพร้อม dropdown เลือกประเภท**อยู่ในแถว** — การกระทำเป็นปุ่ม ค่าเป็น dropdown · dropdown ของแต่ละแถวเสนอประเภทที่ว่าง + ประเภทของตัวเอง สองแถวจึงชี้ของเดียวกันไม่ได้
- **ตัดสวิตช์เปิด/ปิดออกจากหน้าจอ** — ผู้ใช้ขอ "ง่าย ๆ" แต่ผมใส่สถานะที่สามเข้ามาโดยไม่มีใครขอ ทั้งที่มีปุ่มลบอยู่แล้ว (คอลัมน์ `enabled` ยังอยู่ใน DB และยังมีเทสต์ — เป็นความสามารถที่ backend รองรับ แค่ไม่โผล่บนจอ)
- **"≈ N วันทำการ" ข้างช่องชั่วโมง ทั้งสองตาราง** — ไม่มีใครคิดเป็น 72 ชั่วโมง ทุกคนคิดเป็นวัน · คิดจาก**เวลาทำการที่ตั้งไว้ด้านล่างในหน้าเดียวกัน** (วันละ 8 ชม. หลังหักพัก) ไม่ใช่หาร 24 เพราะนาฬิกา SLA นับแบบนั้น
- **ข้อความว่างบอกว่าระบบทำงานยังไงตอนนี้** — "ยังไม่มีข้อยกเว้น ทุกเคสใช้เป้าหมายตามความสำคัญด้านบน" แทน dropdown ลอย

### Tests / Verification

tsc 0 · eslint 0 error · build ผ่าน · ไม่มีโค้ด PHP เปลี่ยน (suite เดิม 1,184 passed)

**เจอบั๊กจากการดูจอจริง** — ตัวแปลง "≈ วันทำการ" รอบแรกปัด 5 ชั่วโมง (0.6 วัน) ขึ้นเป็น "≈ 1 วันทำการ" ทำให้ 5 ชม. กับ 9 ชม. อ่านได้เหมือนกัน · แก้เป็นแสดงเฉพาะเมื่อเป้าหมาย ≥ หนึ่งวันทำการเต็ม · ตรวจซ้ำบนจอ: วิกฤต 5 ชม. ไม่มีป้ายวัน · สูง 9 ชม. ≈ 1 วัน · ปานกลาง 25 ชม. ≈ 3 วัน · ต่ำ 73 ชม. ≈ 9 วัน

### Ticket: Priority และ SLA เห็นได้เฉพาะคนที่รับเคสได้ (2026-09-13)

Priority คือการตัดสินใจเรื่องลำดับคิวของคนที่ต้องลงมือทำ ไม่ใช่ข่าวสำหรับคนที่กำลังรอ และผู้แจ้งก็ไม่มีสิทธิ์เลือกมันอยู่แล้ว · ตอนนี้ผูกกับ **Take Case gate (`tickets.resolve`)** ทั้งหมด

**ตัดออกจาก payload ไม่ใช่แค่ซ่อนบนจอ** — `TicketResource::showsPriority()` เป็นที่เดียวที่ตอบคำถามนี้ และ `AssetResource` เรียกใช้ตัวเดียวกันสำหรับตารางเคสซ่อมของทรัพย์สิน · ค่าที่ไม่เคยถูกส่งไปถึงเบราว์เซอร์ ก็อ่านจาก network tab ไม่ได้เช่นกัน

**กันทางอ้อมด้วย** — `?priority=` ถูกเมิน และ `?sort=priority_desc` ตกกลับไปเรียงแบบปกติ สำหรับคนที่ไม่มีสิทธิ์ · ไม่งั้นยังกรอง/เรียงตามของที่มองไม่เห็นได้ทีละคำขอผ่าน URL

**บนหน้าจอ** — คอลัมน์ในตาราง Tickets · ฟิลเตอร์ในป๊อปอัป · ตัวเลือกเรียง "ความสำคัญ" · ตาราง "กิจกรรมล่าสุด" บนแท็บภาพรวม · คอลัมน์ในแท็บเคสซ่อมของทรัพย์สิน — ซ่อนทั้งหมดเมื่อไม่มีสิทธิ์ · ป้ายบนหัว drawer หายไปเองเพราะมันเรนเดอร์จากค่าที่ไม่มีแล้ว · ไดอะล็อกรับเคส/มอบหมายไม่แตะ เพราะเป็นที่**ตั้ง**ค่าและเข้าถึงได้เฉพาะคนมีสิทธิ์อยู่แล้ว
`Ticket.priority` ใน TS กลายเป็น optional ตามความจริงของ payload

### Tests / Verification

`TicketPriorityVisibilityTest` 5 ตัว — ผู้แจ้งไม่ได้รับ `priority` ทั้งในหน้ารายการและหน้ารายละเอียดเคสของตัวเอง · คนที่รับเคสได้ได้รับ · ฟิลเตอร์ `?priority=` ถูกเมิน (คืนครบทุกใบ ไม่ได้กรอง) · `?sort=priority_desc` ตกกลับไปเรียงปกติสำหรับผู้แจ้ง แต่ยังทำงานให้เจ้าหน้าที่ · ตารางเคสซ่อมของทรัพย์สินใช้กฎเดียวกัน
**พิสูจน์ด้วยการถอด gate ออก** (ให้ `showsPriority()` คืน true เสมอ) แล้วดู 4 ใน 5 ตัวแดง
**suite = 1,189 passed / 5,142 assertions** · tsc 0 · eslint 0 error · pint · build ผ่าน

**เพิ่ม: SLA ถูกซ่อนด้วยกฎเดียวกัน** — ตรวจบนจอด้วยบัญชี Standard จริงแล้วเจอว่า Priority หายครบ แต่ผู้แจ้งยังเห็น**คอลัมน์ SLA** อยู่ (ตั๋วของตัวเองขึ้นป้ายแดง "เกิน 27 วัน 9 ชม.") และใน drawer เห็นทั้งกำหนดตอบรับ · กำหนดปิดเคส · และบรรทัดเป้าหมายที่เพิ่งเพิ่มไป

Priority กับนาฬิกา SLA เป็นของชุดเดียวกัน — อันหนึ่งจัดลำดับคิว อีกอันวัดผลงานทีมเทียบเป้าหมาย · ผู้แจ้งไม่ได้เลือกทั้งคู่และทำอะไรกับมันไม่ได้ทั้งคู่ · ป้ายแดงบนตั๋วตัวเองอ่านเหมือนใบประเมินของแผนก IT ไม่ใช่คำตอบว่างานจะเสร็จเมื่อไหร่ · เลยรวมเป็นกฎเดียว `TicketResource::showsDeskInternals()` (เปลี่ยนชื่อจาก `showsPriority`)
- payload ตัด `sla` และ `sla_target` ออกด้วย · บล็อก SLA ทั้งก้อนใน drawer หายเองเพราะเรนเดอร์จาก `view.sla`
- คอลัมน์ SLA · ช่องกรอง SLA · ตัวเลือกเรียง "ใกล้เกิน SLA ก่อน" ซ่อนบนจอ · `?sla=breached` และ `?sort=sla_due` ถูกเมินฝั่งเซิร์ฟเวอร์

`TicketDeskInternalsVisibilityTest` (เปลี่ยนชื่อจาก TicketPriorityVisibilityTest) เป็น 8 ตัว — เพิ่มกรณี SLA: ผู้แจ้งไม่ได้รับ `sla`/`sla_target` · เจ้าหน้าที่ได้รับทั้งคู่ · ฟิลเตอร์เกินกำหนดถูกเมิน · เรียงตาม SLA ตกกลับไปเรียงปกติ
**suite = 1,192 passed / 5,153 assertions** · tsc 0 · eslint 0 error · pint · build ผ่าน

**ตรวจบนจอด้วยบัญชี Standard จริง (ผู้ใช้ล็อกอินให้)** — ตาราง Ticket ของฉันเหลือ วันที่แจ้ง · Ticket no. · หัวข้อ · ผู้แจ้ง · ประเภท · สถานะ · ผู้รับผิดชอบ · drawer เหลือสถานะเคส/ผู้แจ้ง/ผู้รับผิดชอบ/ข้อมูลอื่น ๆ **ไม่มีบล็อก SLA** · ป๊อปอัปตัวกรองเหลือ Status · Category · Sort by และ Sort by เหลือ Newest / Oldest / Recently updated

### Ticket: Detail Drawer — ตัดสิ่งที่พูดซ้ำออก (2026-09-15)

รีวิว UX/UI หน้า drawer รายละเอียดเคสแล้วแก้ 5 จุด — หัวข้อเคยขึ้นสองที่ (ใต้หัวไดอะล็อก และในบล็อก SUBJECT) เหลือที่เดียว · "บันทึกตอนรับเคส" กับ "รายละเอียดการแก้ไข" ย้ายไปอยู่บนไทม์ไลน์ความคืบหน้าอย่างเดียว ไม่แสดงซ้ำเป็นบล็อกแยก · บล็อก "ข้อมูลอื่น ๆ" (วันที่สร้าง/อัปเดต) ที่ราง เอาออกเพราะซ้ำกับหัวไทม์ไลน์ · หัวคอลัมน์ `Ticket no.` ที่ hardcode เปลี่ยนเป็นคีย์ i18n · ความสูงขั้นต่ำของเนื้อหา 480 → 380px เพราะเคสสั้นเหลือช่องว่างค้างครึ่งจอ · คีย์ภาษาที่ไม่มีใครใช้แล้ว 4 ตัวถูกลบออกจากทั้ง en และ th

### Asset: อัปเดตที่ตั้งของทรัพย์สินที่ใช้งานอยู่ (2026-09-15)

พนักงานย้ายโต๊ะแล้วยกเครื่องไปด้วย — เดิมไม่มีทางแก้ `location_id` นอกจากโอนใหม่ ซึ่งจะดันสถานะกลับไป "รอรับมอบ" บันทึกประวัติเป็นการส่งมอบ และยิงแจ้งเตือนหาเจ้าของทั้งที่เจ้าของไม่ได้เปลี่ยน

**`POST /api/assets/bulk-location`** รับ `ids[]` + `location_id` + `note` เส้นเดียวรับใช้ทั้งปุ่มในหน้ารายละเอียดและแถบเลือกหลายรายการ
- **gate เป็น `assets.edit` ไม่ใช่ `assets.transfer`** เพราะเป็นการแก้ข้อมูลของทรัพย์สิน ไม่ใช่การเปลี่ยนมือผู้ถือครอง
- **เขียนแค่ `location_id`** ไม่แตะเจ้าของ · สถานะ · คลัง และไม่ส่งกระดิ่ง/อีเมลใด ๆ — นี่คือเหตุผลที่ใช้ `AssetService::transfer()` ซ้ำไม่ได้ จึงเป็น `AssetService::relocate()` แยกออกมา
- **เฉพาะ `deployed` และ `common`** เท่านั้น · ของในคลัง (ready) ยังไม่มีที่ตั้งให้แก้ · ที่รอกดรับยังไม่ได้ไปถึงไหน · ที่รอรับคืนกับตัดจำหน่ายไม่ต้องแก้ — นอกเหนือจากนี้ 422

**ประวัติ** — เพิ่มชนิด `AssetTransferKind::Relocate` ลงเส้นทางการถือครอง โดยช่อง from/to เก็บ**ชื่อที่ตั้ง**แทนชื่อคน (ไม่งั้นแถวจะอ่านว่า "สมชาย → สมชาย") · แท็บประวัติแสดงแถวนี้พร้อมหมุดและป้าย "ย้ายที่ตั้ง" · `AuditLog` บันทึก "Updated asset location" ทุกครั้ง
แถว `relocate` ถูกกันออกจากกราฟส่งมอบ/รับคืน 12 เดือน และจากหน้า "ประวัติการโอน" รวม — ทั้งสองที่ตอบคำถามว่า "ใครถืออะไร" ซึ่งการย้ายโต๊ะไม่ได้เปลี่ยน (`AssetTransferKind::changesCustody()`)

**บนหน้าจอ** — ปุ่ม "อัปเดตที่ตั้ง" ในท้าย drawer ของทรัพย์สินที่ใช้งานอยู่ และปุ่มที่สามในแถบเลือกหลายรายการของกลุ่ม deployed/common · ไดอะล็อกบอกที่ตั้งปัจจุบัน ให้เลือกที่ตั้งใหม่ ใส่หมายเหตุได้ และมีบรรทัดบอกชัดว่า**ไม่**เปลี่ยนอะไรบ้าง · กลุ่ม deployed/common เลือกติ๊กได้แล้วสำหรับคนที่มี `assets.edit` แม้ไม่มีสิทธิ์เรียกคืน

### Tests / Verification

`AssetRelocateTest` 6 ตัว — ที่ตั้งเปลี่ยนแต่เจ้าของ/สถานะ/คลังคงเดิมและไม่มีการแจ้งเตือนถูกส่ง (`Notification::assertNothingSent` + `Bus::assertNothingDispatched`) · แถวประวัติเป็นที่ตั้ง→ที่ตั้งและโผล่บน `GET /assets/{id}` แต่ไม่โผล่ใน `/assets/transfers` · ของในคลังและของที่รอกดรับถูกปฏิเสธ 422 · ของกลางย้ายได้ · เลือกหลายรายการย้ายครบทุกตัว · คนมีแค่ `assets.view` โดน 403 ส่วนคนมี `assets.edit` ผ่าน
**พิสูจน์ด้วยการถอด guard สถานะออก** แล้วดูตัวที่ยืนยัน 422 แดง
**suite = 1,198 passed / 5,185 assertions** · tsc 0 · pint · build ผ่าน

### SLA: งานซ่อมยาวมีเป้าหมายของตัวเอง — `work_class` และนาฬิกาต่อแถว (2026-09-16)

**ที่มา** — เคส "Network" ไม่ใช่งานชนิดเดียว ตั้งค่า Wi-Fi ตัวหนึ่ง แก้ไดรเวอร์ตัวหนึ่ง ตั้ง VPN ตัวหนึ่ง จบในไม่กี่ชั่วโมง แต่เดินสายใหม่ทั้งชั้นหรือส่งเครื่องซ่อมกับผู้ขายไม่จบแบบนั้น และองค์กรก็วัดสองอย่างนี้แยกกันอยู่แล้วในชีวิตจริง — **30 วันสำหรับงานที่ทำเอง 45 วันเมื่อต้องผ่านผู้ขาย** ก่อนรอบนี้ไม่มีทางบอกความต่างนั้นให้ระบบรู้ งานเดินสายจึงถูกจับเทียบกับเป้าหมาย 8 ชั่วโมงเดิมของ Network แล้วขึ้น "Missed" ทั้งที่ไม่มีอะไรผิดพลาดเลยสักจุด

**scope ที่สามของ SLA: `TicketWorkClass`** (`standard` / `repair_internal` / `repair_vendor`) เพิ่มเข้ามาเป็น `SlaScope::WorkClass` และ**ชนะทั้ง `request_type` และ `priority`** — เหตุผลอยู่ที่ว่าใครเป็นคนตอบ: ประเภทคำขอถูกเลือกโดยคนกรอกฟอร์ม**ก่อน**มีใครไปดูของจริง ส่วน work class ถูกเลือกโดยคนที่ถือเคสอยู่**หลังจาก**เห็นงานแล้ว ข้อมูลที่ใหม่กว่าและแม่นกว่าควรชนะ
สิ่งที่ทำให้วางไว้บนสุดได้อย่างปลอดภัยคือ **`standard` ไม่ match กฎไหนเลย** — มันเป็นค่าเริ่มต้นของทุกเคส ดังนั้น scope นี้จะมีผลเฉพาะตอนที่มีคนตั้งใจจัดประเภทเป็น `repair_internal`/`repair_vendor` จริง ๆ เท่านั้น เคสปกติที่ไม่มีใครไปแตะไม่มีทางถูก `work_class` เปลี่ยนเดดไลน์โดยไม่ตั้งใจ

**นาฬิกาต่อแถว** — แต่ละแถวเป้าหมาย (priority / request type / work class) เลือกได้เองว่านับ **`business`** (เวลาทำการ ข้ามวันหยุด/นอกเวลา/พักเที่ยง) หรือ **`calendar`** (นับทุกวันรวมวันหยุด) `sla_targets.clock` เก็บค่านี้ต่อแถว คำถาม "30 วันคือวันทำงานหรือปฏิทิน" จึงเป็นสิ่งที่**ผู้ดูแลระบบตอบผ่านหน้า Settings** ไม่ใช่โค้ดเดาแทน — งานซ่อมที่ต้องรอผู้ขายเดินทางมักตั้งเป็น `calendar` เพราะวันหยุดของช่างไม่ได้หยุดนับความล่าช้าให้ลูกค้า

**Guard rails — และต่างจาก Pending ที่ถอนไปเมื่อ 2026-09-13 อย่างไร** ฟีเจอร์ Pending เดิมให้คนถือเคสหยุดนาฬิกาได้เองเป็นจำนวนเท่าไหร่ก็ได้ตามใจ ซึ่งคือช่องให้ยืดเดดไลน์ตัวเองแบบไม่มีขอบเขต รอบนี้ให้อำนาจแบบเดียวกันคืนมา (คนถือเคสเป็นคนกำหนด work class) แต่ปิดช่องนั้นด้วยรั้ว 5 ชั้น:
- **ตัวเลขทุกตัวเป็นของ super admin** — เลือกได้แค่จากป้ายที่ตั้งไว้ล่วงหน้าใน Settings → Tickets & SLA คนถือเคสเลือกป้าย ไม่ได้พิมพ์จำนวนวันเอง
- **เหตุผลบังคับ** (`reason`, min 5 ตัวอักษร) และไปต่อท้ายบันทึกความคืบหน้าบนไทม์ไลน์ที่ผู้แจ้งเห็นเหมือนกัน ไม่ใช่ log ที่มองไม่ถึง
- **`AuditLog::record('Classified ticket work', ...)`** ทุกครั้งที่เปลี่ยน พร้อมค่าก่อน→หลัง
- **ไดอะล็อกโชว์เดดไลน์เก่า → ใหม่ก่อนยืนยัน** เดดไลน์ "หลัง" มาจาก `ticket.work_class_forecast` ที่เซิร์ฟเวอร์คำนวณจริงด้วย `TicketSla` ตัวเดียวกับที่ใช้ตั้งเดดไลน์จริง ไม่ใช่ค่าที่ฝั่งจอเดาเอง — ช่างจึงเห็นตัวเลขจริงก่อนกดยืนยัน ไม่มีทางให้ตัวเองได้เพิ่มอีกกี่สัปดาห์โดยไม่รู้ตัว
- gate ที่ endpoint เดียวกับการเขียนบันทึก (`tickets.set_work_class` + ต้องเป็นผู้รับเคสเอง + เคสต้องอยู่สถานะ "กำลังทำ") — ไม่ใช่พารามิเตอร์ของ take/assign ที่จะทำให้ตั้งได้ตั้งแต่ยังไม่เห็นงาน

**แยกตัวเลขสองก้อน** — เป้าหมาย 4 ชั่วโมง (เคสปกติ) กับ 720 ชั่วโมง (งานซ่อมผู้ขาย 30 วัน) ไม่มีทางแชร์เปอร์เซ็นต์เดียวกันได้อย่างมีความหมาย ดังนั้น `GET /api/tickets/summary` คืนสองคู่แยกกัน: `sla_met_pct`/`sla_delta_pts` กับ `repair_kpi_met_pct`/`repair_kpi_delta_pts` (เฉพาะเคสซ่อม) บวก `repair_backlog` (เคสซ่อมที่ยังไม่ปิด ณ ตอนนี้) และ `has_repair_rules` (มีกฎ work_class ที่เปิดอยู่ไหม) เคสแต่ละใบตกกลุ่มไหนตัดสินจาก `work_class` **ปัจจุบัน** ของเคสนั้น

**กฎจริงของ `sla_met_pct` คือ "ตัดเคสที่ถูกจัดประเภทเป็นซ่อมอยู่ตอนนี้ออกเสมอ"** (`TicketController::summary()` ทำ `$resolvedInWindow(...)->reject($isRepair)` แบบไม่มีเงื่อนไข) — **ไม่ได้ผูกกับว่ามีกฎ `has_repair_rules` อยู่หรือไม่** ทั้งสองเรื่องเป็นคนละคำถาม: `has_repair_rules` ตอบว่า "ผู้ดูแลระบบตั้งเป้าหมายไว้หรือยัง" ส่วนเซตที่ถูกตัดออกจาก `sla_met_pct` ตอบว่า "ตอนนี้มีเคสไหนถูกจัดว่าเป็นงานซ่อมบ้าง" — และการจัดประเภทเคสไม่เคยถูกบังคับให้ต้องมีกฎรออยู่ก่อน (`TicketWorkClassModal` เสนอทั้งสามคลาสเสมอ ไม่ว่ามีกฎหรือไม่ ไม่มีกฎก็แค่ขึ้นคำเตือน) ในทางปฏิบัติเซตที่ถูกตัดออกจึงว่างเปล่าจนกว่าจะมีใครเริ่มจัดประเภท ซึ่ง**มักจะ**ตามหลังการสร้างกฎ แต่ไม่มีอะไรบังคับลำดับนั้น — เคสที่ถูกจัดเป็นซ่อมก่อนมีกฎเป็นสถานการณ์ที่เกิดได้จริง

**บนหน้าจอ (รอบนี้)** — การ์ด "ปิด Ticket ทัน SLA" เดิมแคบป้ายเหลือ "ปิดงานปกติทัน SLA" **เฉพาะตอนที่การ์ด KPI งานซ่อมโผล่อยู่ด้วย** เพราะนั่นคือตอนที่ `sla_met_pct` กำลังตัดเคสซ่อมออกจริง ป้ายเดิมต้องพูดความจริงข้อนั้น · การ์ดใหม่ "ปิดงานซ่อมทัน KPI" (ไอคอน `Wrench` ตัวเดียวกับไดอะล็อกจัดประเภทงาน) **ไม่ได้โผล่ตาม `has_repair_rules` เฉย ๆ** — เพราะถ้าทำแบบนั้น เคสที่ถูกจัดเป็นซ่อมก่อนมีกฎจะหายทั้งจากตัวเลข SLA ปกติ (ถูก `reject($isRepair)` ตัดออก) **และ**จากการ์ดเดียวที่จะโชว์มันได้ (การ์ดไม่โผล่เพราะยังไม่มีกฎ) งานซ่อมนั้นจะหายไปจากทั้งสองตัวเลขพร้อมกัน แก้โดยรวมเป็นเงื่อนไขเดียวชื่อ `showsRepairKpi` = มีกฎเปิดอยู่ **หรือ** มีเคสซ่อมที่ยังไม่ปิด (`repair_backlog > 0`) **หรือ** มีเคสซ่อมที่ปิดไปแล้วภายใต้ KPI (`repair_kpi_met_pct != null`) — ต่อเมื่อทั้งสามเป็นเท็จพร้อมกันเท่านั้นถึงจะไม่มีอะไรให้โชว์จริง ๆ และการ์ดกับป้ายบนการ์ด SLA เดิมใช้ตัวแปรตัวเดียวกันนี้ร่วมกัน จึงไม่มีทางเห็นป้าย "ปิดงานปกติทัน SLA" โดยไม่เห็นการ์ด KPI คู่กัน · ใต้ค่าเปอร์เซ็นต์ของการ์ด KPI มีบรรทัด "ยังไม่ปิด N เคส" เสมอ (มาจาก `repair_backlog`) เพราะเป้าหมาย 30 วันต้องรอ 30 วันถึงจะมีเคสซ่อมเคสแรกปิดจริง ช่วงแรกเปอร์เซ็นต์จึงเป็น "—" ยาวหลายสัปดาห์ และ "—" เปล่า ๆ อ่านเหมือนบั๊ก ส่วน "—, ยังไม่ปิด 3 เคส" อ่านว่า "ยังไม่ถึงเวลา" — คอมโพเนนต์การ์ดของหน้านี้ชื่อ `StatCard` ไม่ใช่ `Kpi`, prop คือ `label`/`value`/`icon`/`trend`/`hint` (ไม่มี `hint` แบบสตริงเดี่ยว — `hint` รับ `React.ReactNode` ได้อยู่แล้วเหมือนการ์ด backlog เดิม) จึงใช้ `hint` ตัวนั้นวางบรรทัด backlog แทนที่จะเพิ่ม prop ใหม่

### Tests / Verification

tsc 0 error · build ผ่าน · pint passed · **suite = 1,246 passed / 5,313 assertions** (ครบทั้ง 12 task ของแผนนี้ ไม่มีตัวแดง)
**eslint** — ไม่ได้รันคำสั่งเต็มตามบรีฟ (`npx eslint resources/js --max-warnings=0`) เพราะมันแดงจาก warning เดิม 2 ตัวที่ไม่เกี่ยวกับรอบนี้ (`react-hooks/exhaustive-deps` ในโมดูล stock, ไฟล์ที่ไม่ได้แตะ) รันเฉพาะสองไฟล์ที่แก้ในรอบนี้แทน (`resources/js/modules/ticket/pages/index.tsx`, `resources/js/shared/types/index.ts`) — **0 error / 0 warning**
