# Inaba IT Service Desk

ระบบ **IT Service Desk** สำหรับจัดการงาน IT ภายในองค์กร (Inaba Foods) ครอบคลุมพนักงาน แจ้งปัญหา คำขออนุมัติ ทรัพย์สิน สัญญา คลังอะไหล่ สิทธิ์การเข้าถึง แจ้งเตือน และรายงาน
พัฒนาด้วย **Laravel 12 + React 19 (SPA) + TypeScript + Tailwind CSS v4** รองรับจอตั้งแต่ iPad mini (768 × 1024) ขึ้นไป และโหมดมืด

เหตุผลของการแก้แต่ละครั้งอยู่ใน commit message ส่วนบันทึกการพัฒนาแบบละเอียดเก็บไว้ที่ `history-project.md` ในเครื่องผู้พัฒนา (ไม่อยู่ใน git)

---

## 1. ความสามารถหลัก

| โมดูล | ทำอะไร |
|---|---|
| Dashboard | ภาพรวมงานตามสิทธิ์ของผู้ใช้ |
| Employee | พนักงาน แผนก หน่วยงาน ตำแหน่ง ผังองค์กร นำเข้า CSV บัญชีเข้าใช้งาน |
| Ticket | แจ้งปัญหา IT มอบหมาย ติดตาม SLA สถานะ เปิด → กำลังดำเนินการ → เสร็จสิ้น หรือยกเลิก |
| Request + Workflow | คำขอบริการ IT หลายประเภท อนุมัติตามสายบังคับบัญชา สร้าง Ticket ให้เมื่ออนุมัติครบ |
| Assets | ทรัพย์สิน IT รับมอบ โอนย้าย รับคืน คืนผู้ให้เช่า ตัดจำหน่าย ประกัน |
| Contract & Rental | สัญญาและการเช่า มูลค่าตามงวด แจ้งเตือนก่อนหมดอายุ |
| Stock | คลังอะไหล่แยกตามคลัง รับเข้า คืน ย้ายคลัง เบิกผ่านคำขอ นับสต็อก แจ้งเตือน Min/Max |
| Access | ทะเบียนสิทธิ์ อีเมลกลุ่ม แชร์ไฟล์ บัญชี Social และ License ซอฟต์แวร์ |
| Permission | บทบาท กลุ่มบทบาท สิทธิ์รายโมดูล บันทึกการเข้าสู่ระบบ |
| Notifications | แจ้งเตือนในระบบตามเหตุการณ์ (กระดิ่ง) |
| Email Notifications | อีเมลตามเหตุการณ์ผ่าน Queue แม่แบบอีเมลแก้ได้ในระบบ |
| Reports | รายงานพร้อม Export Excel/PDF และตั้งเวลาส่งอีเมล |
| Settings | ข้อมูลหลัก การแสดงผล ความปลอดภัย SMTP SLA |

---

## 2. เทคโนโลยีและสิ่งที่ต้องติดตั้ง

| ส่วน | ที่ใช้ |
|---|---|
| Backend | PHP 8.2+, Laravel 12, Laravel Sanctum (cookie-based SPA), Laravel Queue (database driver) |
| Frontend | React 19, TypeScript, Vite 6, react-router-dom, TanStack React Query, Zustand, Tailwind CSS v4 + Radix UI |
| Database | MariaDB (เครื่อง dev ใช้ MariaDB 12.3) หรือ MySQL |
| Export | maatwebsite/excel (Excel), barryvdh/laravel-dompdf (PDF) |
| อื่น ๆ | geoip2 (ระบุตำแหน่งในบันทึกการเข้าสู่ระบบ) |

ต้องมี PHP 8.2 ขึ้นไป, Composer, Node.js 20 ขึ้นไป (เครื่อง dev ใช้ Node 24) และ MariaDB หรือ MySQL

---

## 3. ติดตั้งและรันบนเครื่อง dev

```bash
# 1. ติดตั้ง dependencies
composer install
npm install

# 2. สร้าง .env แล้วตั้งค่า DB_* ให้ตรงกับเครื่อง
cp .env.example .env
php artisan key:generate

# 3. สร้างตาราง และข้อมูลตั้งต้นของระบบ
php artisan migrate
php artisan db:seed            # ถามชื่อ อีเมล รหัสผ่านของผู้ดูแล (username: admin) ต้องเปลี่ยนรหัสตอนเข้าครั้งแรก
php artisan storage:link       # ให้รูปพนักงานและโลโก้แสดงได้

# 4. รันทุกอย่างพร้อมกัน (เว็บ + queue 2 ตัว + Vite + scheduler)
composer run dev               # Vite แบบ HMR (มีตัว watch service worker เพิ่มอีก 1 ตัว)
# หรือ
composer run demo              # vite build --watch ใช้ตอนเปิดจาก iPad หรือเครื่องอื่น (มีตัว watch service worker ด้วย)
```

เปิดเบราว์เซอร์ที่ http://localhost:8000

ข้อมูลตั้งต้น (`db:seed`) มีแค่การตั้งค่าระบบ บทบาท แม่แบบอีเมลและแจ้งเตือน Workflow มาตรฐาน และบัญชีผู้ดูแล 1 บัญชี ไม่มีข้อมูลตัวอย่าง ถ้าต้องการข้อมูลอ้างอิงของบริษัท รันเพิ่มได้

```bash
php artisan db:seed --class=EmployeeDepartmentSeeder   # แผนก
php artisan db:seed --class=EmployeePositionSeeder     # ตำแหน่ง
php artisan db:seed --class=EmployeeSectionSeeder      # หน่วยงาน (รันหลังแผนก)
php artisan db:seed --class=MasterDataSeeder           # ยี่ห้อ หมวด คลัง หน่วย ประเภทประกัน
php artisan geoip:update                               # ฐานข้อมูลตำแหน่งจาก IP (ไม่บังคับ)
```

---

## 4. การตั้งค่า

- **`.env`** ค่าหลักคือ `APP_URL`, `DB_*`, `QUEUE_CONNECTION=database` และ `LOG_STACK=source` (log แยกโฟลเดอร์รายวันใน `storage/logs/`)
- **อีเมล** ค่า SMTP จริงเก็บในตาราง `mail_settings` ผู้ดูแลตั้งได้ในหน้า Settings ส่วน `MAIL_*` ใน `.env` เป็นค่าสำรองเมื่อยังไม่ได้ตั้ง ระบบส่งอีเมลผ่าน Queue เสมอ
- **Scheduler** ต้องรัน `php artisan schedule:work` (รวมอยู่ใน `composer run dev` แล้ว) สำหรับแจ้งเตือนสัญญาใกล้หมดอายุ แจ้งเตือนคลัง แจ้งเตือน SLA ของ Ticket สรุปรายสัปดาห์ รายงานตั้งเวลา และการล้าง log
- **Queue** ใช้ 2 คิว คือคิวปกติ และคิว `reports` สำหรับ Export ขนาดใหญ่ ต้องรัน queue worker ด้วย ไม่งั้นไม่มี push ออก
- **Web Push (แจ้งเตือนผ่านเบราว์เซอร์ตอนปิดหน้าเว็บ)** ใช้แพ็กเกจ `laravel-notification-channels/webpush` (ไม่ต้องใช้ gmp ใช้ bcmath openssl curl mbstring)
  - สร้างคีย์ด้วย `php artisan webpush:vapid` แล้วตั้ง `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` และ `VAPID_SUBJECT` (ต้องตั้ง เช่น `mailto:it@company.com`) ใน `.env`
  - migration ใหม่ `push_subscriptions` (สร้างตาราง และขยายความยาว endpoint) ต้องรัน `php artisan migrate`
  - ต้องใช้ HTTPS (Cloudflare) บน iPad ต้องเพิ่มเว็บลงหน้าจอโฮม (iPadOS 16.4 ขึ้นไป) ถึงจะเปิดรับ push ได้
  - Service worker อยู่ที่ `/sw.js` (build จาก `vite.sw.config.js` ไป `storage/app/sw/sw.js` แล้ว Laravel ส่งไฟล์นี้ ตั้งที่อื่นได้ด้วย config `webpush.service_worker_path`) Cloudflare ต้องไม่ cache `/sw.js` (ต้นทางส่ง no-cache แล้ว ถ้ามีกฎ cache ไฟล์ JS ให้เพิ่มกฎ bypass cache สำหรับ `/sw.js`)
- **เสียงแจ้งเตือน** ผู้ดูแลเลือกเสียงและเปิดปิดได้ที่ Settings > เสียง ใช้สิทธิ์ `settings.sound` role ที่มีอยู่แล้วต้องติ๊กให้เองในหน้า Permission

---

## 5. คำสั่งที่ใช้บ่อยและการรันเทส

```bash
php artisan test --compact     # เทส PHP (PHPUnit บน sqlite ในหน่วยความจำ)
npm run test:js                # เทส frontend (node --test)
npx tsc --noEmit               # ตรวจ TypeScript
npm run lint                   # eslint --fix
npm run format                 # prettier
vendor/bin/pint --dirty        # จัดรูปแบบไฟล์ PHP ที่แก้
php artisan route:list         # ดู routes
npm run build                  # build frontend สำหรับ production (รวม service worker ด้วย)
```

> **ห้ามล้าง cache ช่วงเวลาทำงานบนเครื่องจริง** (`cache:clear`, `optimize:clear` หรือ deploy ที่ล้าง cache) นาฬิกาเวลาไม่ใช้งานของทุกคนเก็บใน cache นาฬิกาที่หายนับว่าหมดเวลา ทุกคนที่ไม่ได้ติ๊ก "จดจำฉันไว้" จะถูกออกจากระบบพร้อมกัน ให้ deploy นอกเวลาทำงาน หรือใช้ `config:cache` / `route:cache` / `view:cache` แทนการล้างทั้งหมด

---

## 6. โครงสร้างโปรเจกต์

```
app/                         # จัดกลุ่มตามโดเมนใต้ App\<Layer>\<Domain>\
├── Console/Commands/        # คำสั่งตั้งเวลา (แจ้งเตือน สรุปรายสัปดาห์ รายงาน ล้าง log)
├── Enums/<Domain>/
├── Http/Controllers/Api/<Domain>/, Requests/<Domain>/, Resources/<Domain>/, Middleware/
├── Models/<Domain>/         # User.php และ AuditLog.php อยู่ระดับบน
├── Services/<Domain>/       # business logic (1 service = 1 หน้าที่)
├── Jobs/, Mail/, Notifications/
└── Support/                 # ของกลางข้ามโดเมน
database/migrations/, database/seeders/
resources/
├── css/app.css              # Tailwind entry และสีของธีม
├── js/
│   ├── app/                 # App.tsx, router, layout (app-shell, sidebar, topbar)
│   ├── modules/<module>/    # 1 โฟลเดอร์ = 1 ฟีเจอร์: components, pages, hooks, api, types.ts, index.ts
│   ├── shared/              # ui, components, hooks, lib, types ที่ใช้ข้ามโมดูล
│   ├── lang/<locale>/       # i18n แยกภาษา (en, th) แยกไฟล์ตามโมดูล
│   └── stores/              # Zustand
└── views/                   # Blade เฉพาะฝั่ง server: app.blade.php, emails, errors, pdf
routes/api.php, routes/web.php, routes/console.php
tests/Feature/, tests/Unit/, tests/js/
```

---

## 7. การ deploy

คู่มือ deploy อยู่ในโฟลเดอร์ `docs/` บนเครื่อง dev (ไม่ได้เก็บใน git)

- `DEPLOY-ubuntu-nginx-with-cert-v2.txt` Ubuntu + Nginx พร้อม SSL
- `DEPLOY-ubuntu-nginx-no-cert.txt` Ubuntu + Nginx ไม่มี SSL
- `DOCKER-demo-install.txt` ติดตั้งแบบ Docker สำหรับเดโม

บนเครื่องจริงต้องรัน queue worker และ scheduler ตลอดเวลา และ deploy นอกเวลาทำงาน (ดูข้อควรระวังเรื่อง cache ในข้อ 5)

---

## 8. แนวทางการพัฒนา

- **Backend** แยกไฟล์ตามโดเมน ห้ามเขียน business logic ใน Controller ห้าม query ใน Blade ทุก API ตอบผ่าน API Resource หรือรูปแบบมาตรฐาน `{ data, message }` / `{ data, meta }` / `{ message, errors }` การ validate ทำที่ Laravel เสมอ
- **Frontend** 1 โมดูล = 1 โฟลเดอร์ โมดูลอื่นเรียกผ่าน `index.ts` ของโมดูลเท่านั้น `shared/` ห้ามพึ่ง `modules/` component ไม่เรียก axios เอง ให้ผ่าน `api/` ของโมดูล ใช้ React Query สำหรับข้อมูลจาก server และ Zustand สำหรับสถานะหน้าจอ
- **ข้อความบนจอ** อยู่ใน `resources/js/lang/` ทั้งหมด ห้ามเขียนข้อความในคอมโพเนนต์โดยตรง
- **สไตล์** ใช้ Tailwind class เท่านั้น ไม่ใช้ inline style
- **ทุกการแก้ต้องมีเทส** และรันเทสที่เกี่ยวข้องก่อน commit
- **Commit** ข้อความเป็นภาษาอังกฤษ บอกสิ่งที่แก้และเหตุผล แล้วบันทึกต่อท้าย `history-project.md` ในเครื่อง

---

## 9. License

ระบบใช้ภายในองค์กร ยังไม่ได้กำหนด license (`composer.json` ยังเป็น MIT ตามโครงตั้งต้นของ Laravel)
