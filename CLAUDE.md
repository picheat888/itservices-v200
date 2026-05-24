# CLAUDE.md — Service Desk System

## Project Overview

ระบบ **IT Service Desk** สำหรับจัดการงาน IT ภายในองค์กร พัฒนาด้วย Laravel + React + Tailwind CSS

### โมดูลหลัก
| # | Module | คำอธิบาย |
|---|--------|----------|
| 1 | Employee | จัดการข้อมูลพนักงาน แผนก ตำแหน่ง |
| 2 | Ticket | แจ้งปัญหา IT ติดตามสถานะ มอบหมายงาน |
| 3 | Request (Workflow) | คำขออนุมัติ เช่น ขอซื้อของ ขอใช้สิทธิ์ |
| 4 | Assets Management | จัดการทรัพย์สิน IT เช่น คอม, อุปกรณ์ |
| 5 | Contract & Rental | สัญญา, การเช่า พร้อมวันหมดอายุ |
| 6 | Stock Management | คลังอะไหล่ รับเข้า-เบิกออก |
| 7 | Permission Management | สิทธิ์ผู้ใช้ Role/Permission |
| 8 | Notifications System | แจ้งเตือนในระบบหน้าเว็บตามเหตุการณ์ |
| 9 | Email Notifications | แจ้งเตือนทางอีเมลตามเหตุการณ์ |
| 10 | Report / Export | รายงาน Export Excel/PDF |
| 11 | Settings | ตั้งค่าระบบ |


## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | PHP, Laravel |
| Frontend | React , TypeScript |
| Styling | Tailwind CSS |
| Database | MySQL |
| Auth | Laravel Sanctum |
| State | Zustand หรือ React Query |
| Form | React Hook Form + Zod |
| Table | TanStack Table |
| HTTP Client | Axios |
| Queue | Laravel Queue (database driver) |
| Mail | Laravel Mail + Mailable classes |


## Folder Structure

```
project-root/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── Api/                  # API Controllers แยกตามโมดูล
│   │   │       ├── TicketController.php
│   │   │       ├── AssetController.php
│   │   │       └── ...
│   │   ├── Requests/                 # Form Request Validation
│   │   └── Resources/                # API Resource (JSON transform)
│   ├── Models/                       # Eloquent Models
│   ├── Services/                     # Business Logic (1 service ต่อ 1 โมดูล)
│   │   ├── TicketService.php
│   │   └── WorkflowService.php
│   ├── Notifications/                # Laravel Notifications
│   └── Enums/                        # PHP Enums เช่น TicketStatus
│
├── database/
│   ├── migrations/
│   └── seeders/
│
├── resources/
│   └── js/                           # React Frontend
│       ├── components/
│       │   ├── ui/                   # Shared UI (Button, Modal, Table)
│       │   └── [module]/             # Components แยกตามโมดูล
│       ├── pages/
│       │   └── [module]/             # Pages แยกตามโมดูล
│       ├── hooks/                    # Custom React Hooks
│       ├── services/                 # API calls (axios)
│       ├── stores/                   # Zustand stores
│       └── types/                    # TypeScript types/interfaces
│
├── routes/
│   ├── api.php                       # API routes ทั้งหมด
│   └── web.php
│
└── tests/
    ├── Feature/
    └── Unit/
```

## Coding Rules
- แยก component ให้เล็กและอ่านง่าย
- เขียน Code ให้อ่านง่ายมากกว่าสั้นเกินไป
- ห้ามลบ Code เดิมถ้าไม่เข้าใจหน้าที่ของมัน


### PHP / Laravel

```php
// ✅ ใช้ Service class สำหรับ business logic
class TicketService
{
    public function create(array $data, User $requester): Ticket
    {
        // logic อยู่ที่นี่
    }
}

// ✅ Controller บาง — รับ request, เรียก service, return resource
class TicketController extends Controller
{
    public function store(StoreTicketRequest $request, TicketService $service)
    {
        $ticket = $service->create($request->validated(), $request->user());
        return new TicketResource($ticket);
    }
}

// ✅ ใช้ Form Request แทนการ validate ใน controller
// ✅ ใช้ API Resource แทนการ return model ตรงๆ
// ✅ ใช้ PHP Enum สำหรับ status/type
enum TicketStatus: string
{
    case Open     = 'open';
    case InProgress = 'in_progress';
    case Resolved = 'resolved';
    case Closed   = 'closed';
}
```

- **ห้าม** เขียน business logic ใน Controller
- **ห้าม** query ใน Blade หรือ Component โดยตรง
- ใช้ **snake_case** สำหรับ database columns
- ใช้ **camelCase** สำหรับ method names
- ทุก API ต้อง return response ผ่าน **ApiResource** หรือ format มาตรฐาน

### React / TypeScript

```tsx
// ✅ แยก type ไว้ใน types/
interface Ticket {
  id: number;
  subject: string;
  status: TicketStatus;
  assignee?: User;
}

// ✅ ใช้ custom hook สำหรับ fetch data
function useTickets() {
  return useQuery({ queryKey: ['tickets'], queryFn: ticketApi.getAll });
}

// ✅ Component ไม่เรียก axios โดยตรง — ผ่าน services/ เสมอ
// services/ticketApi.ts
export const ticketApi = {
  getAll: () => axios.get('/api/tickets').then(r => r.data),
  create: (data: CreateTicketDto) => axios.post('/api/tickets', data),
};
```

- **ห้าม** inline style — ใช้ Tailwind class เท่านั้น
- ใช้ **TypeScript** ทุกไฟล์ (.tsx / .ts)
- แยก **component**, **page**, **hook**, **service** ให้ชัดเจน
- ชื่อ Component ใช้ **PascalCase**

### API Response Format (มาตรฐาน)

```json
// Success
{ "data": { ... }, "message": "success" }

// List
{ "data": [ ... ], "meta": { "total": 100, "per_page": 15 } }

// Error
{ "message": "Validation failed", "errors": { "field": ["..."] } }
```

## Commands

```bash
# === Development ===
php artisan serve              # Start Laravel server
npm run dev                    # Start Vite (React)

# === Database ===
php artisan migrate            # Run migrations
php artisan migrate:fresh --seed  # Reset + seed ทุกอย่าง
php artisan db:seed --class=DemoSeeder  # Seed เฉพาะตัว

# === Code Generation ===
php artisan make:model Asset -mfsr     # Model + migration + factory + seeder + resource
php artisan make:controller Api/AssetController --api
php artisan make:request StoreAssetRequest
php artisan make:resource AssetResource

# === Queue / Mail ===
php artisan queue:work         # Start queue worker
php artisan queue:listen       # Listen (dev)

# === Testing ===
php artisan test               # Run all tests
php artisan test --filter TicketTest

# === Cache ===
php artisan optimize:clear     # Clear all cache (config, route, view)
```


### เพิ่มโมดูลใหม่

1. **Migration** → สร้างตารางใน `database/migrations/`
2. **Model** → สร้าง Eloquent Model พร้อม `$fillable`, relationships
3. **Service** → สร้าง `app/Services/XxxService.php` สำหรับ logic
4. **Form Request** → สร้าง validation rules ใน `app/Http/Requests/`
5. **API Resource** → สร้าง JSON transform ใน `app/Http/Resources/`
6. **Controller** → สร้างใน `app/Http/Controllers/Api/`
7. **Route** → เพิ่มใน `routes/api.php` ภายใต้ middleware `auth:sanctum`
8. **Frontend Types** → เพิ่ม interface ใน `resources/js/types/`
9. **API Service** → เพิ่ม axios calls ใน `resources/js/services/`
10. **Component + Page** → สร้าง UI ใน `resources/js/pages/[module]/`

### Ticket Workflow (สถานะ)
```
Open → In Progress → Pending → Resolved → Closed
              ↘ Cancelled
```

### Request Workflow (Approval)
```
Draft → Submitted → [Approver 1] → [Approver 2] → Approved / Rejected
```

## Notes สำหรับ Claude

- โปรเจกนี้ใช้ Laravel + React 
- Auth ใช้ Sanctum แบบ cookie-based SPA
- ถ้าไม่ระบุให้ใช้ React Query สำหรับ server state และ Zustand สำหรับ UI state
- การ validate ทำที่ Laravel เสมอ (React validate เฉพาะ UX)
- Email ส่งผ่าน Queue ไม่ส่งตรงใน request cycle
- Mail config เก็บใน database (table: `mail_settings`) ไม่ใช่ `.env` — ผู้ดูแลระบบตั้งค่าได้เองผ่านหน้า Settings (SMTP host, port, username, password, from address, encryption)
- ก่อนส่งเมลทุกครั้ง ระบบต้อง override config ด้วย `Config::set('mail.*', ...)` โดยดึงค่าจาก `mail_settings` ไม่ใช่อ่านจาก `.env` โดยตรง
- `.env` เก็บแค่ค่า fallback เผื่อกรณี `mail_settings` ยังไม่ได้ตั้งค่า
- Export ใช้ Laravel Excel (maatwebsite/excel)
- ก่อนแก้ไขแก้โค้ดต้องอ่านไฟล์ที่เกี่ยวข้องก่อน
- อธิบายแผนการแก้แบบสั้น ๆ ก่อนแ้ไข
- แก้ไขเฉพาะไฟล์ที่จำเป็น
- Comment ทุก Fuction ที่สร้าง เพื่อระบุว่าใช้งานอะไรบ้าง
- ตรวจสอบว่า Code ไม่กระทบกับการทำงานของส่วนอื่น

- สรุปสิ่งที่แก้ไขหลังทำเสร็จ และเขียนลงไฟล์ Readme.md ไว้ด้วย ถ้าเป็น Phase ย่อย x.xx-x.xx รอสรุปทีเดียว   