# Inaba IT Service Desk

ระบบ **IT Service Desk** สำหรับจัดการงาน IT ภายในองค์กร (Inaba Foods)
พัฒนาด้วย **Laravel 12 + React 19 (SPA) + TypeScript + Tailwind CSS v4**

> สถานะปัจจุบัน: **ถึง Phase-11** — Foundation + Employee + Settings + Permission (+ Admin protection) + Email + Contract & Rental (+ expiry alerts) + Master Data lookups + Stock/Inventory (Items + Min/Max alerts + Dashboard + RBAC + Movements + Request workflow) + **Assets Management (Inventory + Dashboard + Transfer/Accept/Return + Bulk + Asset→Stock + Contract link)**

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
| 3 | Request Workflow (คำขออนุมัติ) | ⏳ รอ |
| 4 | Asset Management (ทรัพย์สิน / โอนย้าย / รับคืน) | ⏳ รอ |
| 5 | Contract & Rental (สัญญา + แจ้งเตือนหมดอายุ) | ✅ Phase-6 (CRUD + dashboard/timeline + expiring filter + renew) · Phase-7 (expiry alerts: bell + email + scheduled command) · attachments/linked-assets Coming soon |
| 6 | Stock Management (คลังอะไหล่) | 🟡 Phase-9 (Master Data lookups + Stock Items + Min/Max alerts + Dashboard + RBAC) · Movements/Requests/Audit/Notifications รอเฟสถัดไป |
| 7 | Permission Management | ✅ Phase-3 (Roles+matrix, Groups, Audit log) · Phase-7 (Administrator protection: กัน non-super แก้ admin/role group/escalation) |
| 8 | Notifications System (in-app) | 🟡 Bell + dropdown + tabs ตามโมดูล + ปิดทีละรายการ + event พนักงานใหม่ (Phase-5) + contract expiry (Phase-7, แท็บ Contracts live) · trigger ticket/request/asset รอ |
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
| 11 | **RBAC Permission** | ✅ เสร็จ | module `stock` 11 สิทธิ์ บังคับใช้จริงที่ controller ทุกตัว (view/request/approve/fulfill/receive/transfer/return/manage_items/delete live) · หน้า Permissions แสดง stock ในกลุ่ม Workspace · manage_warehouse/audit ยัง coming soon |
| 12 | **Notification** (email + bell) | ⏳ รอเฟสถัดไป | ใช้โครง Notification เดิม (เหมือน contract expiry) ยังไม่ผูก event ของ stock (low-stock / request submitted / approved / fulfilled) |

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
- **ยังไม่ทำ (เฟสถัดไป):** ไฟล์แนบตั๋ว (PNG/JPG/PDF ≤20MB) และ SLA/Avg-response จริง (ตอนนี้ dashboard ใช้ค่าจริงเฉพาะ counts/by-category)

---

## คำสั่งที่ใช้บ่อย

```bash
php artisan migrate:fresh --seed   # reset + seed ใหม่
php artisan optimize:clear         # ล้าง cache ทั้งหมด
php artisan route:list             # ดู routes ทั้งหมด
npm run build                      # build frontend
npm run lint                       # eslint --fix
```
