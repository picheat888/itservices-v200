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

===

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

The Laravel Boost guidelines are specifically curated by Laravel maintainers for this application. These guidelines should be followed closely to ensure the best experience when building Laravel applications.

## Foundational Context

This application is a Laravel application and its main Laravel ecosystems package & versions are below. You are an expert with them all. Ensure you abide by these specific packages & versions.

- php - 8.2
- laravel/framework (LARAVEL) - v12
- laravel/prompts (PROMPTS) - v0
- laravel/sanctum (SANCTUM) - v4
- laravel/boost (BOOST) - v2
- laravel/mcp (MCP) - v0
- laravel/pail (PAIL) - v1
- laravel/pint (PINT) - v1
- laravel/sail (SAIL) - v1
- phpunit/phpunit (PHPUNIT) - v11
- react (REACT) - v19
- tailwindcss (TAILWINDCSS) - v4
- eslint (ESLINT) - v9
- prettier (PRETTIER) - v3

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If the user doesn't see a frontend change reflected in the UI, it could mean they need to run `npm run build`, `npm run dev`, or `composer run dev`. Ask them.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

## Replies

- Be concise in your explanations - focus on what's important rather than explaining obvious details.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Always use `search-docs` before making code changes. Do not skip this step. It returns version-specific docs based on installed packages automatically.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.

=== tests rules ===

# Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed. Use `php artisan test --compact` with a specific filename or filter.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

## Vite Error

- If you receive an "Illuminate\Foundation\ViteException: Unable to locate file in Vite manifest" error, you can run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

=== laravel/v12 rules ===

# Laravel 12

- CRITICAL: ALWAYS use `search-docs` tool for version-specific Laravel documentation and updated code examples.
- Since Laravel 11, Laravel has a new streamlined file structure which this project uses.

## Laravel 12 Structure

- In Laravel 12, middleware are no longer registered in `app/Http/Kernel.php`.
- Middleware are configured declaratively in `bootstrap/app.php` using `Application::configure()->withMiddleware()`.
- `bootstrap/app.php` is the file to register middleware, exceptions, and routing files.
- `bootstrap/providers.php` contains application specific service providers.
- The `app/Console/Kernel.php` file no longer exists; use `bootstrap/app.php` or `routes/console.php` for console configuration.
- Console commands in `app/Console/Commands/` are automatically available and do not require manual registration.

## Database

- When modifying a column, the migration must include all of the attributes that were previously defined on the column. Otherwise, they will be dropped and lost.
- Laravel 12 allows limiting eagerly loaded records natively, without external packages: `$query->latest()->limit(10);`.

### Models

- Casts can and likely should be set in a `casts()` method on a model rather than the `$casts` property. Follow existing conventions from other models.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== phpunit/core rules ===

# PHPUnit

- This application uses PHPUnit for testing. All tests must be written as PHPUnit classes. Use `php artisan make:test --phpunit {name}` to create a new test.
- If you see a test using "Pest", convert it to PHPUnit.
- Every time a test has been updated, run that singular test.
- When the tests relating to your feature are passing, ask the user if they would like to also run the entire test suite to make sure everything is still passing.
- Tests should cover all happy paths, failure paths, and edge cases.
- You must not remove any tests or test files from the tests directory without approval. These are not temporary or helper files; these are core to the application.

## Running Tests

- Run the minimal number of tests, using an appropriate filter, before finalizing.
- To run all tests: `php artisan test --compact`.
- To run all tests in a file: `php artisan test --compact tests/Feature/ExampleTest.php`.
- To filter on a particular test name: `php artisan test --compact --filter=testName` (recommended after making a change to a related file).

</laravel-boost-guidelines>
