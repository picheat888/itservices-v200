# Inaba IT Service Desk

ระบบ **IT Service Desk** สำหรับจัดการงาน IT ภายในองค์กร (Inaba Foods)
พัฒนาด้วย **Laravel 12 + React 19 (SPA) + TypeScript + Tailwind CSS v4**

> สถานะปัจจุบัน: **Phase-1 (Foundation) เสร็จสมบูรณ์** — โครงระบบพร้อมต่อยอดเป็น 11 โมดูล

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

## Phase-3 — Permission Module + Login (เสร็จแล้ว)

### Login
- รับ **Email หรือ Username** ช่องเดียว + password (เพิ่ม `username` unique ใน `users`); `LoginRequest` ตรวจว่าเป็นอีเมลหรือ username แล้ว `Auth::attempt` ตามนั้น
- **Demo accounts** (password: `password`, ล็อกอินด้วย username หรืออีเมลก็ได้, คลิกเลือกได้ในหน้า login):
  | กลุ่ม | username | email |
  |------|----------|-------|
  | Super Admin | `super` | super@inaba.co.th |
  | IT Technician | `it` | it@inaba.co.th |
  | HR Officer | `hr` | hr@inaba.co.th |
  | Employee | `user` | user@inaba.co.th |

### RBAC (Roles & Permissions)
- **Catalog** สิทธิ์ 6 โมดูล × 5 การกระทำ = 30 keys (`App\Support\Permissions`); ตาราง `role_permissions` (role/permission/allowed)
- `User::permissions()` / `hasPermission()` — Super = สิทธิ์เต็มเสมอ (bypass); role อื่นอ่านจาก DB
- หน้า **Permissions → Roles**: เลือก role → matrix toggle 6 การ์ดโมดูล + Save (persist, super ล็อก); ปรับแล้ว**คุมการเข้าถึงจริง** (nav/route อิง permission)
- ค่าเริ่มต้นตาม 4 กลุ่ม: Super=ทั้งหมด · IT=22 · HR=7 (Employee เต็ม + ticket/request ตัวเอง) · Employee=3 (ticket/request ตัวเอง + แก้โปรไฟล์)
- **Nav/เข้าถึง** อิง permission แทน role hardcode (เช่น Employee เห็นแค่ Dashboard/Tickets/Requests)

### Audit log
- ตาราง `audit_logs` + `AuditLog::record()`; log การ login/logout + แก้สิทธิ์ (ขยายไปโมดูลอื่นได้); หน้า **Permissions → Audit log** แสดงตารางจริง (เวลา/ผู้ใช้/การกระทำ/เป้าหมาย)
- **Groups** tab: Coming Soon

**ไฟล์เพิ่ม**: `app/Support/Permissions.php` · `app/Models/{RolePermission,AuditLog}.php` · `app/Http/Controllers/Api/{RolePermission,AuditLog}Controller.php` · `resources/js/services/permissionApi.ts` · `hooks/use-permissions.ts` · `lib/permission-labels.ts` · `pages/permissions/index.tsx`

**ตรวจสอบ**: `tsc`/`eslint`/`build` ✅ · API (curl): login by username, matrix get/update (persist+revert) ✅ · เบราว์เซอร์: matrix, audit log จริง, nav จำกัดสิทธิ์ของ Employee ✅

---

## Phase-3.12 — Permission Role Template + Employee Credential Control (เสร็จแล้ว)

### Permission Keys ใหม่ (Employee module)
- เพิ่ม 3 keys ใน `App\Support\Permissions`: `employees.reset_password` · `employees.resign` · `employees.set_credentials`
- รวมเป็น 33 permission keys; IT/Super ได้ทั้ง 3 key ค่าเริ่มต้น
- Controller enforce permission จริง: `resetPassword` / `resign` / `credentials` ใน `EmployeeController`

### Group Roles (Role Template)
- ตาราง `group_roles` + `group_role_employee` (pivot); `GroupRole` model + `GroupRoleController`
- แท็บ **Permissions → Groups**: สร้าง/แก้/ลบ group, เลือก role template, กำหนดสมาชิก (พนักงาน), ตั้ง default group
- **Auto-sync User.role**: เมื่อพนักงานเข้า/ออก group → `users.role` อัปเดตอัตโนมัติ (store/update/destroy)
- Default group: พนักงานใหม่ถูกเพิ่มเข้า group นี้โดยอัตโนมัติเมื่อ Add Employee

### Two-path Credential Flow
- **Path A (มีอีเมล)**: Add Employee → สร้าง User อัตโนมัติ (username=code, password=code) → แจ้ง IT ว่า "credentials ready"
- **Path B (ไม่มีอีเมล)**: Add Employee → แจ้ง IT ว่า "ต้องตั้ง username/password เอง" → IT เปิด employee view drawer → กรอก credentials → POST `/api/employees/{id}/credentials`
- View drawer แสดง badge "Has login account" และ CredentialsSection (form ตั้ง username/password) เฉพาะผู้มีสิทธิ์ `employees.set_credentials` + employee ยังไม่มีบัญชี

### Notifications
- ตาราง `notifications` (Laravel standard); `NewEmployeeNotification` (database + mail, queued)
- `NotificationController`: GET `/notifications` (30 รายการล่าสุด + unread count) · PUT `/notifications/{id}/read` · PUT `/notifications/read-all`
- **Bell icon** บน topbar: แสดง unread count (poll ทุก 60 วินาที จาก API จริง)
- **Notifications dropdown**: แสดงรายการจริง, คลิก → mark read + navigate ไปหน้า employees พร้อม highlight พนักงาน; ไอคอน amber = ต้องตั้ง credentials เอง, brand = พร้อมใช้

### Settings Bug Fixes (Pre-phase)
- **Reset Logo deferred**: กด Reset → preview ว่าง แต่ API call จริงรอจนกด Save
- **Re-upload หลัง Reset**: ล้าง `inputRef.current.value` หลัง Reset เพื่อให้เลือกไฟล์เดิมได้อีก
- **Settings tab hash persistence**: URL hash `#branding` / `#company` / etc. คงค่าหลัง reload

**ไฟล์เพิ่ม/แก้**: `app/Support/Permissions.php` · `app/Models/{GroupRole,Employee}.php` · `app/Services/EmployeeService.php` · `app/Http/Controllers/Api/{GroupRole,Employee,Notification}Controller.php` · `app/Notifications/NewEmployeeNotification.php` · `resources/js/services/notificationApi.ts` · `hooks/use-notifications.ts` · `components/shell/notifications-dropdown.tsx` · `components/shell/topbar.tsx` · `components/employees/employee-view-drawer.tsx` · `pages/employees/index.tsx` · `pages/settings/index.tsx` · `lib/i18n.ts` (33 keys ใหม่)

**ตรวจสอบ**: `tsc --noEmit` ✅ · routes ✅ · migration ✅

> **ปรับภายหลัง (credential flow):** ยกเลิกการสร้าง User อัตโนมัติ + default password = รหัสพนักงาน — ตอนนี้ผู้มีสิทธิ์ `employees.set_credentials` เป็นผู้ตั้ง Username/Password ผ่าน **Dialog** (เปิดจากเมนู Action ใน Employee list เมื่อ `has_account=false` หรือจาก view drawer); Employee list แสดง badge "มีบัญชีแล้ว/ยังไม่มีบัญชี"; `users.email` เปลี่ยนเป็น nullable เพื่อรองรับบัญชีแบบ username-only

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
| 1 | Employee Management (พนักงาน / ตำแหน่ง / แผนก) | ✅ Phase-2 |
| 2 | Ticket System (เปิด/รับ/อัปเดตเคส) | ⏳ รอ |
| 3 | Request Workflow (คำขออนุมัติ) | ⏳ รอ |
| 4 | Asset Management (ทรัพย์สิน / โอนย้าย / รับคืน) | ⏳ รอ |
| 5 | Contract & Rental (สัญญา + แจ้งเตือนหมดอายุ) | ⏳ รอ |
| 6 | Stock Management (คลังอะไหล่) | ⏳ รอ |
| 7 | Permission Management | ✅ Phase-3 (Roles+matrix, Audit log · Groups Coming Soon) |
| 8 | Notifications System (in-app) | 🟡 Bell + dropdown + event พนักงานใหม่ · per-kind tabs รอโมดูล |
| 9 | Email Notifications | ✅ Phase-4 (template library + SMTP + queued send) |
| 10 | Report / Export | ⏳ รอ |
| 11 | Settings | 🟡 Display/Branding/Company/Locations/Email เสร็จ · ส่วนอื่นรอโมดูล |

---

## คำสั่งที่ใช้บ่อย

```bash
php artisan migrate:fresh --seed   # reset + seed ใหม่
php artisan optimize:clear         # ล้าง cache ทั้งหมด
php artisan route:list             # ดู routes ทั้งหมด
npm run build                      # build frontend
npm run lint                       # eslint --fix
```
