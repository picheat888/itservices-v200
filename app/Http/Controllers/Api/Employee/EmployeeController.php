<?php

namespace App\Http\Controllers\Api\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employee\StoreEmployeeRequest;
use App\Http\Resources\Access\EmployeeAccessResource;
use App\Http\Resources\Employee\ApproverNodeResource;
use App\Http\Resources\Employee\EmployeeResource;
use App\Http\Resources\Employee\OrgChartNodeResource;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Access\AccessService;
use App\Services\Employee\ApprovalChainService;
use App\Services\Employee\EmployeeImportService;
use App\Services\Employee\EmployeeOnboardingService;
use App\Services\Employee\EmployeeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    /**
     * Login-name rules shared by account creation and username changes. English letters only —
     * the name must start with a letter, end with a letter or digit, and may use . _ - in
     * between (the separator set accepted by AD / POSIX logins). The frontend mirrors this
     * pattern for instant feedback; this copy is the authority.
     *
     * @var list<string>
     */
    private const USERNAME_RULES = ['required', 'string', 'max:30', 'regex:/^[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]$/'];

    /**
     * Password policy for admin-set credentials — the complexity set Active Directory and most
     * corporate policies use. The forms mirror it as a live checklist; this copy is the authority.
     */
    private static function passwordRule(): Password
    {
        return Password::min(8)->mixedCase()->numbers()->symbols();
    }

    /**
     * Temporary password used when a reset arrives without one. Takes a character from each
     * required class first so the result always satisfies passwordRule(), then fills and
     * shuffles. Ambiguous glyphs (0/O, 1/l/I) are left out so it survives being read aloud.
     */
    private function generatePassword(int $length = 14): string
    {
        $pools = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?'];
        $combined = implode('', $pools);

        $chars = array_map(fn (string $pool) => $pool[random_int(0, strlen($pool) - 1)], $pools);
        while (count($chars) < $length) {
            $chars[] = $combined[random_int(0, strlen($combined) - 1)];
        }
        shuffle($chars);

        return implode('', $chars);
    }

    /**
     * Fold an incoming username to lower case before it is validated or stored. Logins are
     * case-insensitive, so this keeps "John_Do" from slipping past an existing "john_do" —
     * a guarantee that would otherwise rest on the database collation alone.
     */
    private function normalizeUsername(Request $request): void
    {
        if ($request->has('username')) {
            $request->merge(['username' => Str::lower(trim((string) $request->input('username')))]);
        }
    }

    /**
     * Sign the account out everywhere after its password is reset.
     *
     * Laravel keeps only the user id in the session, so changing the password leaves every
     * existing session working. That matters because the usual reason to reset a password is
     * a suspected takeover — without this, whoever holds the live session simply keeps it,
     * and would meet the forced-change screen able to pick a password of their own.
     */
    private function signOutEverywhere(User $user): void
    {
        // Keyed off the table rather than the configured driver so the behaviour is the same
        // everywhere it is stored — and testable. (Sessions held outside the database, e.g.
        // in Redis, would need their own eviction; this app stores them here.)
        $table = config('session.table', 'sessions');
        if (Schema::hasTable($table)) {
            DB::table($table)->where('user_id', $user->id)->delete();
        }

        // API tokens, for any client that authenticates with one instead of a cookie.
        $user->tokens()->delete();
    }

    public function __construct(
        private readonly EmployeeService $service,
        private readonly EmployeeImportService $importService,
        private readonly EmployeeOnboardingService $onboarding,
    ) {}

    /**
     * Pull the uploaded photo (if any) out of the validated data and replace
     * it with a stored path, deleting the previous file when present.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function handlePhoto(Request $request, array $data, ?string $oldPath = null): array
    {
        unset($data['photo']);
        if ($request->hasFile('photo')) {
            if ($oldPath) {
                Storage::disk('local')->delete($oldPath);
            }
            $data['photo_path'] = $request->file('photo')->store('employees', 'local');
        }

        return $data;
    }

    /**
     * Returns all employees (for dashboard/pickers) or a paginated page
     * with search+department filtering when the ?page query param is present.
     */
    public function index(Request $request): JsonResponse
    {
        // Resigned sink to the bottom; within active, no-account first;
        // then newest employee code first (68xxxx before 52xxxx); then by name.
        $query = Employee::with(['department', 'position', 'section', 'user'])
            ->orderByRaw("status = 'resigned'")
            ->orderByRaw('EXISTS(SELECT 1 FROM users WHERE users.employee_id = employees.id)')
            ->orderByDesc('code')
            ->orderBy('first_name')
            ->orderBy('last_name');

        if ($request->has('page')) {
            abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

            $perPage = max(10, min(100, (int) $request->query('per_page', 20)));

            if ($request->filled('search')) {
                $q = '%'.$request->query('search').'%';
                $query->where(function ($w) use ($q) {
                    $w->where('first_name', 'like', $q)
                        ->orWhere('last_name', 'like', $q)
                        ->orWhere('first_name_th', 'like', $q)
                        ->orWhere('last_name_th', 'like', $q)
                        ->orWhere('code', 'like', $q);
                });
            }

            if ($request->filled('department_id')) {
                $query->where('department_id', (int) $request->query('department_id'));
            }

            // Status filter: active employees, resigned, or active-without-login-account.
            $status = $request->query('status');
            if ($status === 'active') {
                $query->where('status', 'active');
            } elseif ($status === 'resigned') {
                $query->where('status', 'resigned');
            } elseif ($status === 'no_account') {
                $query->where('status', 'active')->whereDoesntHave('user');
            } elseif ($status === 'has_account') {
                $query->where('status', 'active')->whereHas('user');
            }

            $paginator = $query->paginate($perPage);

            return response()->json([
                'data' => EmployeeResource::collection($paginator->items()),
                'meta' => [
                    'total' => $paginator->total(),
                    'per_page' => $paginator->perPage(),
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                ],
            ]);
        }

        return EmployeeResource::collection($query->get())->response();
    }

    /**
     * Returns aggregated dashboard stats without loading all employee records.
     * Includes total count, new-hire count, and the 5 most recent hires.
     * Requires the employees.view_dashboard permission.
     */
    public function summary(): JsonResponse
    {
        abort_unless((bool) request()->user()?->hasPermission('employees.view_dashboard'), 403);

        $total = Employee::count();
        $newHires = Employee::where('joined_at', '>=', '2023-01-01')->count();
        $active = Employee::where('status', EmployeeStatus::Active->value)->count();
        $resigned = Employee::where('status', EmployeeStatus::Resigned->value)->count();
        $resignedThisYear = Employee::where('status', EmployeeStatus::Resigned->value)
            ->whereYear('last_day', now()->year)->count();

        // Active staff still waiting for a login account — mirrors the ?status=no_account filter.
        $noAccount = Employee::where('status', EmployeeStatus::Active->value)
            ->whereDoesntHave('user')->count();

        $recent = Employee::with(['department', 'position', 'section'])
            ->orderByDesc('joined_at')
            ->limit(5)
            ->get();

        // Most recent departures — mirrors "recent hires", ordered by their last working day.
        $recentResignations = Employee::with(['department', 'position', 'section'])
            ->where('status', EmployeeStatus::Resigned->value)
            ->orderByDesc('last_day')
            ->limit(5)
            ->get();

        return response()->json([
            'total' => $total,
            'new_hires' => $newHires,
            'active' => $active,
            'resigned' => $resigned,
            'resigned_this_year' => $resignedThisYear,
            'no_account' => $noAccount,
            'hires_by_month' => $this->hiresByMonth(),
            'recent' => EmployeeResource::collection($recent),
            'recent_resignations' => EmployeeResource::collection($recentResignations),
        ]);
    }

    /**
     * Hire counts for the last 12 months (fixed rolling window, zero-filled) ending at
     * the current month — drives the hiring-trend chart on the dashboard.
     *
     * @return array<int, array{month: string, count: int}>
     */
    private function hiresByMonth(): array
    {
        // Bucket by year-month in PHP (portable across MariaDB / SQLite test DB).
        $counts = [];
        foreach (Employee::whereNotNull('joined_at')->pluck('joined_at') as $d) {
            $ym = Carbon::parse($d)->format('Y-m');
            $counts[$ym] = ($counts[$ym] ?? 0) + 1;
        }

        $end = now()->startOfMonth();
        $start = $end->copy()->subMonths(11);

        $out = [];
        for ($m = $start->copy(); $m->lte($end); $m->addMonth()) {
            $ym = $m->format('Y-m');
            $out[] = ['month' => $ym, 'count' => (int) ($counts[$ym] ?? 0)];
        }

        return $out;
    }

    /**
     * Streams a CSV template (UTF-8 BOM so Excel renders Thai) with the import column
     * headers and one example row. The example is filled from the master data actually
     * present — a real department tag, one of ITS sections, a normal position title and
     * an existing employee code — so the file shows the spelling the import expects
     * instead of names somebody has to guess at.
     */
    public function importTemplate(Request $request): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.import'), 403);

        $headers = EmployeeImportService::COLUMNS;
        $sample = $this->importSampleRow();

        return response()->streamDownload(function () use ($headers, $sample) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM
            fputcsv($out, $headers);
            fputcsv($out, $sample);
            fclose($out);
        }, 'employee-import-template.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Example row for the template: real master-data spellings when the tables are
     * populated, static placeholders on a bare install.
     *
     * @return list<string>
     */
    private function importSampleRow(): array
    {
        $department = Department::orderBy('id')->first();
        $section = $department ? Section::where('department_id', $department->id)->orderBy('id')->first() : null;
        $position = Position::where('allow_special_position', false)->orderBy('id')->first();
        // Someone at the top of the tree is the safest example of a person to report to.
        $manager = Employee::whereNotNull('code')->whereNull('manager_id')->orderBy('id')->first();

        return [
            '',                                        // employee_code — blank lets the system assign EMP-####
            'John',
            'Doe',
            'จอห์น',
            'โด',
            'john.doe@abcd.co.th',
            '+66 81 000 0000',
            $department->tag ?? 'It',
            $section->name ?? 'Support',
            $position->title ?? 'Staff/Officer',
            '2024-01-15',
            $manager->code ?? 'EMP-1001',
        ];
    }

    /**
     * Dry-runs an uploaded CSV: same rules as the real import, nothing written. Returns
     * every row with its resolved department / section / position / manager plus the
     * errors it would raise, so the dialog can show what is about to be saved. A file
     * full of errors is still a 200 — this is a report, not a failed action.
     */
    public function importPreview(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.import'), 403);

        $rows = $this->readImportFile($request);
        if ($rows instanceof JsonResponse) {
            return $rows;
        }

        $result = $this->importService->importRows($rows, dryRun: true);
        $valid = count(array_filter($result['rows'], fn (array $row) => $row['errors'] === []));

        return response()->json([
            'message' => 'success',
            'data' => $result['rows'],
            'errors' => $result['errors'],
            'meta' => [
                'total' => count($result['rows']),
                'valid' => $valid,
                'invalid' => count($result['rows']) - $valid,
                'ignored_columns' => $this->unknownImportColumns($rows),
            ],
        ]);
    }

    /**
     * Bulk-imports employees from an uploaded CSV. Validation is all-or-nothing:
     * any bad row aborts the whole import and returns a 422 with per-row errors.
     */
    public function import(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.import'), 403);

        $rows = $this->readImportFile($request);
        if ($rows instanceof JsonResponse) {
            return $rows;
        }

        $result = $this->importService->importRows($rows);

        if (count($result['errors']) > 0) {
            return response()->json([
                'message' => 'พบข้อผิดพลาด ยังไม่ได้นำเข้าข้อมูล กรุณาแก้ไขแล้วลองใหม่',
                'errors' => $result['errors'],
            ], 422);
        }

        AuditLog::record('Imported employees', $result['imported'].' รายการ');

        return response()->json(['message' => 'success', 'imported' => $result['imported']]);
    }

    /**
     * Validates the upload and parses it, or returns the 422 to send back. Shared by
     * the preview and the real import so both accept exactly the same files.
     *
     * @return array<int, array<string, string>>|JsonResponse
     */
    private function readImportFile(Request $request): array|JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'max:5120']]);
        $file = $request->file('file');
        if (! in_array(strtolower($file->getClientOriginalExtension()), ['csv', 'txt'], true)) {
            return response()->json(['message' => 'รองรับเฉพาะไฟล์ .csv'], 422);
        }

        $rows = $this->readCsv($file->getRealPath());
        if ($rows === null || count($rows) === 0) {
            return response()->json(['message' => 'ไฟล์ว่างหรืออ่านไม่ได้'], 422);
        }

        return $rows;
    }

    /**
     * Columns in the uploaded file that the import has no field for. They are ignored
     * rather than rejected (an HR export carries plenty of payroll columns), but the
     * preview names them so nobody assumes a column was saved when it was not.
     *
     * @param  array<int, array<string, string>>  $rows
     * @return list<string>
     */
    private function unknownImportColumns(array $rows): array
    {
        $known = array_merge(EmployeeImportService::COLUMNS, ['code']); // 'code' = the old template's name
        $present = array_keys($rows[0] ?? []);

        return array_values(array_filter($present, fn ($column) => $column !== '' && ! in_array($column, $known, true)));
    }

    /**
     * Parses a CSV file into an array of associative rows keyed by the (lower-cased)
     * header columns. Strips a UTF-8 BOM and skips fully-blank lines.
     *
     * @return array<int, array<string, string>>|null
     */
    private function readCsv(string $path): ?array
    {
        if (($h = fopen($path, 'r')) === false) {
            return null;
        }

        $header = fgetcsv($h);
        if ($header === false) {
            fclose($h);

            return null;
        }
        $header = array_map(fn ($c) => strtolower(trim((string) $c)), $header);
        if (isset($header[0])) {
            $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]); // strip BOM
        }

        $rows = [];
        while (($data = fgetcsv($h)) !== false) {
            if (count(array_filter($data, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue; // skip blank line
            }
            $row = [];
            foreach ($header as $idx => $col) {
                $row[$col] = $data[$idx] ?? '';
            }
            $rows[] = $row;
        }
        fclose($h);

        return $rows;
    }

    /**
     * Creates the employee, then — for the day-one services ticked on the form —
     * files one service request per service on their behalf.
     *
     * The requests come after the employee is saved and never roll it back: a
     * service whose workflow is closed is reported under `onboarding.failed` so the
     * form can say which one did not go out, while the person stays hired.
     */
    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $data = $this->handlePhoto($request, $request->validated());
        $services = array_values((array) ($data['services'] ?? []));
        $note = $data['onboarding_note'] ?? null;
        unset($data['services'], $data['onboarding_note']);

        $employee = $this->service->create($data, $request->user());
        AuditLog::record('Created employee', "{$employee->name} ({$employee->code})");

        $onboarding = null;
        if ($services !== []) {
            $onboarding = $this->onboarding->fileRequests($employee, $request->user(), $services, $note);
            AuditLog::record('Filed onboarding requests', "{$employee->name} ({$employee->code})", [
                'created' => array_column($onboarding['created'], 'reference'),
                'failed' => array_column($onboarding['failed'], 'service'),
            ]);
        }

        return (new EmployeeResource($employee->load(['department', 'position', 'section'])))
            ->additional(array_filter([
                'message' => 'success',
                'onboarding' => $onboarding,
            ], fn ($value) => $value !== null))
            ->response()->setStatusCode(201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return (new EmployeeResource($employee->load(['department', 'position', 'section'])))->response();
    }

    /**
     * Read-only list of the assets this employee currently holds, for the Employee detail's
     * Assets tab. Gated by employees.view (an Employee-module read) — NOT assets.view — since
     * it only surfaces what the person holds, scoped to that one employee. Mirrors the
     * own-module "peek" pattern used by the asset → contract view.
     *
     * @return array<string, mixed>
     */
    public function assets(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

        $assets = Asset::query()
            ->with(['category', 'model'])
            ->where('owner_employee_id', $employee->id)
            ->orderByDesc('owned_since')
            ->get()
            ->map(fn (Asset $a) => [
                'id' => $a->id,
                'asset_code' => $a->asset_code,
                'tag' => $a->tag,
                'model' => $a->model?->name,
                'type' => $a->category?->name,
                'type_th' => $a->category?->name_th,
                'serial' => $a->serial,
                'status' => $a->status->value,
                'owned_since' => $a->owned_since?->toDateString(),
            ]);

        return response()->json(['data' => $assets]);
    }

    /**
     * Read-only view of the access memberships this employee holds, for the Employee detail's
     * Access tab. Gated by employees.view (an Employee-module read) — NOT access.module — since
     * it only surfaces what this one person can reach. Mirrors the own-module "peek" pattern
     * used by the Assets tab above.
     */
    public function access(Request $request, Employee $employee, AccessService $accessService): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

        $grouped = $accessService->employeeAccess($employee);
        // Let the resource flag rows this employee owns (approver / share owner).
        $grouped['employee_id'] = $employee->id;
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty()
                || $grouped['social_platform']->isNotEmpty() || $grouped['software']->isNotEmpty());

        return (new EmployeeAccessResource($grouped))->response();
    }

    /**
     * Read-only list of the tickets this employee has requested, for the Employee detail's
     * Tickets tab. Gated by employees.view (an Employee-module read) — NOT tickets permissions —
     * same own-module "peek" pattern as the Assets and Access tabs above.
     */
    public function tickets(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

        $tickets = Ticket::query()
            ->where('requester_id', $employee->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Ticket $tk) => [
                'id' => $tk->id,
                'ticket_no' => $tk->ticket_no,
                'subject' => $tk->subject,
                'category' => $tk->category->value,
                'priority' => $tk->priority?->value,
                'status' => $tk->status->value,
                'created_at' => $tk->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $tickets]);
    }

    /**
     * Returns active employees as a flat list of org-chart nodes (resigned
     * excluded). The frontend assembles the reporting forest from manager_id;
     * reports_count is the number of active direct reports.
     * Requires the employees.view_org permission.
     */
    public function orgChart(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.view_org'), 403);

        $employees = Employee::query()
            ->where('status', EmployeeStatus::Active)
            ->with(['position', 'department'])
            ->withCount(['subordinates as reports_count' => fn ($q) => $q->where('status', EmployeeStatus::Active)])
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        return OrgChartNodeResource::collection($employees)->additional(['message' => 'success'])->response();
    }

    /** Returns the employee's approval chain (direct manager first, up to the root of the reporting tree). */
    public function approvalChain(Request $request, Employee $employee, ApprovalChainService $chain): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

        // chainFor() already eager-loads each approver's position + department.
        $approvers = $chain->chainFor($employee);

        return ApproverNodeResource::collection($approvers)->additional(['message' => 'success'])->response();
    }

    public function update(StoreEmployeeRequest $request, Employee $employee): JsonResponse
    {
        // Only a super admin may edit an employee whose login account is a super admin.
        abort_if(
            $employee->isSuperAdmin() && ! $request->user()?->isSuper(),
            403,
            'Only an Administrator can edit an Administrator account.'
        );

        $before = $employee->getOriginal();
        $employee = $this->service->update($employee, $this->handlePhoto($request, $request->validated(), $employee->photo_path));
        AuditLog::record('Updated employee', "{$employee->name} ({$employee->code})", AuditLog::changes($before, $employee));

        return (new EmployeeResource($employee->load(['department', 'position', 'section'])))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageEmployees(), 403);
        AuditLog::record('Deleted employee', "{$employee->name} ({$employee->code})");
        $employee->delete();

        return response()->json(['message' => 'success']);
    }

    /** Resets the linked system account password to the employee's code. Returns the new password. */
    /**
     * Manage an existing login account: change the username and/or reset the password.
     * Field-level permissions — username requires employees.set_credentials, password
     * reset requires employees.reset_password. Replaces the old reset-password endpoint.
     */
    public function updateCredentials(Request $request, Employee $employee): JsonResponse
    {
        $user = $employee->user;
        if (! $user) {
            return response()->json(['message' => 'no_account'], 422);
        }

        $this->normalizeUsername($request);

        $data = $request->validate([
            'username' => ['sometimes', ...self::USERNAME_RULES, Rule::unique('users', 'username')->ignore($user->id)],
            'reset_password' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', self::passwordRule()],
            'force_change' => ['sometimes', 'boolean'],
        ]);

        $changingUsername = array_key_exists('username', $data);
        $resetting = $request->boolean('reset_password');
        abort_unless($changingUsername || $resetting, 422, 'Nothing to update.');

        if ($changingUsername) {
            abort_unless((bool) $request->user()?->hasPermission('employees.set_credentials'), 403);
            $user->update(['username' => $data['username']]);
            // Mirror onto the employee for display/search (same as account creation).
            $employee->update(['username' => $data['username']]);
            AuditLog::record('Changed username', "{$employee->name} ({$employee->code})");
        }

        $newPassword = null;
        if ($resetting) {
            abort_unless((bool) $request->user()?->hasPermission('employees.reset_password'), 403);
            $force = $request->boolean('force_change');
            // No password supplied → generate one. The employee code was the old fallback, but
            // it is public knowledge and fails the very policy this endpoint enforces.
            $newPassword = filled($data['password'] ?? null) ? $data['password'] : $this->generatePassword();
            $user->forceFill([
                'password' => Hash::make($newPassword),
                // null marks the password as "never set by the user" while forcing a change.
                'password_changed_at' => $force ? null : now(),
                'must_change_password' => $force,
            ])->save();
            $this->signOutEverywhere($user);
            AuditLog::record('Reset password', "{$employee->name} ({$employee->code})");
        }

        return response()->json(array_filter(['message' => 'success', 'new_password' => $newPassword]));
    }

    /**
     * Provisions a login account (username + password) for an employee who
     * does not have one yet. Only accessible to users with the
     * employees.set_credentials permission.
     */
    public function credentials(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.set_credentials'), 403);

        if ($employee->user()->exists()) {
            return response()->json(['message' => 'Employee already has a login account.'], 422);
        }

        $this->normalizeUsername($request);

        $data = $request->validate([
            'username' => [...self::USERNAME_RULES, 'unique:users,username'],
            'password' => ['required', 'string', 'confirmed', self::passwordRule()],
            'force_change' => ['sometimes', 'boolean'],
        ]);

        $this->service->createUserWithCredentials($employee, $data['username'], $data['password'], $request->boolean('force_change'));

        AuditLog::record('Created user account', "{$employee->name} ({$employee->code})");

        return response()->json(['message' => 'success'], 201);
    }

    public function resign(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.resign'), 403);

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
            'last_day' => ['nullable', 'date'],
        ]);

        $employee = $this->service->resign($employee, $data['reason'] ?? null, $data['last_day'] ?? null, $request->user());
        AuditLog::record('Recorded resignation', "{$employee->name} ({$employee->code})");

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }

    /**
     * Cancels a resignation by reverting the employee's status back to Active.
     * Requires the employees.cancel_resign permission.
     */
    public function cancelResign(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.cancel_resign'), 403);
        abort_unless($employee->status->value === 'resigned', 422, 'Employee is not resigned.');

        $employee = $this->service->cancelResign($employee);
        AuditLog::record('Cancelled resignation', "{$employee->name} ({$employee->code})");

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }
}
