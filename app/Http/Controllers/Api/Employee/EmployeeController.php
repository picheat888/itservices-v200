<?php

namespace App\Http\Controllers\Api\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ChainBlockReason;
use App\Enums\Request\RequestType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employee\ResignEmployeeRequest;
use App\Http\Requests\Employee\StoreEmployeeCredentialsRequest;
use App\Http\Requests\Employee\StoreEmployeeRequest;
use App\Http\Requests\Employee\UpdateEmployeeCredentialsRequest;
use App\Http\Resources\Access\EmployeeAccessResource;
use App\Http\Resources\Employee\ApproverNodeResource;
use App\Http\Resources\Employee\EmployeeOptionResource;
use App\Http\Resources\Employee\EmployeeResource;
use App\Http\Resources\Employee\OrgChartNodeResource;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\Workflow\Workflow;
use App\Services\Access\AccessService;
use App\Services\Employee\ApprovalChainService;
use App\Services\Employee\EmployeeActionGuard;
use App\Services\Employee\EmployeeImportService;
use App\Services\Employee\EmployeeOnboardingService;
use App\Services\Employee\EmployeeService;
use App\Services\Request\WorkflowResolverService;
use App\Support\CsvReader;
use App\Support\OverviewPeriod;
use App\Support\RequestSchemas;
use App\Support\SearchTerms;
use App\Support\SuperAdmins;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    /** A day-one service whose workflow is missing or off; sits beside the ChainBlockReason codes. */
    private const WORKFLOW_INACTIVE = 'workflow_inactive';

    public function __construct(
        private readonly EmployeeService $service,
        private readonly EmployeeImportService $importService,
        private readonly EmployeeOnboardingService $onboarding,
        private readonly EmployeeActionGuard $guard,
    ) {}

    /**
     * Swaps an uploaded photo for its stored path, deleting the previous file.
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

    /** Directory page: search (name, code, email, username), department and status filters. */
    public function index(Request $request): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        $query = $this->service->inDirectoryOrder(Employee::with(['department', 'position', 'section', 'user.role']));
        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));

        SearchTerms::apply($query, $request->query('search'), [
            ...SearchTerms::personName(), 'code', 'email', 'username',
            SearchTerms::related('user', ['username']),
        ]);

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

    /** Slim rows for pickers, open to any signed-in user, no personal fields. */
    public function options(Request $request): JsonResponse
    {
        $params = $request->validate([
            'search' => ['nullable', 'string'],
            'limit' => ['nullable', 'integer'],
            'status' => ['nullable', 'string'],
            'match' => ['nullable', 'string'],
            'ids' => ['nullable'],
            'exclude' => ['nullable'],
        ]);
        $idList = fn (mixed $value): array => collect(is_array($value) ? $value : explode(',', (string) $value))
            ->filter(fn ($v) => is_numeric($v))->map(fn ($v) => (int) $v)->unique()->take(2000)->values()->all();

        $filters = [
            'search' => $params['search'] ?? null,
            'limit' => (int) ($params['limit'] ?? 20),
            'status' => $params['status'] ?? null,
            'match' => $params['match'] ?? null,
            'exclude' => $idList($params['exclude'] ?? []),
        ];
        if ($request->has('ids')) {
            $filters['ids'] = $idList($params['ids'] ?? []);
        }

        return EmployeeOptionResource::collection($this->service->pickerList($filters))->response();
    }

    /** Overview stats: headcount as of now; hires, resignations and the hiring chart follow the period. */
    public function summary(Request $request): JsonResponse
    {
        $this->guard->canViewOverview($request->user())->authorize();
        $period = OverviewPeriod::fromRequest($request)->onDates();
        $resignedQuery = fn () => Employee::where('status', EmployeeStatus::Resigned->value);

        // Active staff still waiting for a login account — mirrors the ?status=no_account filter.
        $noAccount = Employee::where('status', EmployeeStatus::Active->value)
            ->whereDoesntHave('user')->count();

        $recent = $period->apply(Employee::with(['department', 'position', 'section']), 'joined_at')
            ->orderByDesc('joined_at')
            ->limit(5)
            ->get();

        $recentResignations = $period->apply($resignedQuery()->with(['department', 'position', 'section']), 'last_day')
            ->orderByDesc('last_day')
            ->limit(5)
            ->get();

        $joined = Employee::whereNotNull('joined_at')->pluck('joined_at')->map(fn ($d) => Carbon::parse($d));

        return response()->json([
            'total' => Employee::count(),
            'new_hires' => $period->apply(Employee::query(), 'joined_at')->count(),
            'active' => Employee::where('status', EmployeeStatus::Active->value)->count(),
            'resigned' => $resignedQuery()->count(),
            'resigned_in_period' => $period->apply($resignedQuery(), 'last_day')->count(),
            'no_account' => $noAccount,
            'hires_trend' => $period->countInto($joined, $joined->min()),
            'recent' => EmployeeResource::collection($recent),
            'recent_resignations' => EmployeeResource::collection($recentResignations),
        ]);
    }

    /** CSV template (UTF-8 BOM for Excel) with one example row from the real master data. */
    public function importTemplate(Request $request): StreamedResponse
    {
        $this->guard->canImport($request->user())->authorize();

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

    /** Every spelling the import accepts for department, section and position, as a CSV to open beside the template. */
    public function importReference(Request $request): StreamedResponse
    {
        $this->guard->canImport($request->user())->authorize();

        $departments = Department::orderBy('name')->get();
        $sections = Section::with('department')->orderBy('name')->get();
        $positions = Position::orderBy('title')->get();

        $rows = [];
        foreach ($departments as $department) {
            $rows[] = ['department', $department->name, '', $this->alsoAccepted([
                $department->tag, $department->code, $department->name_th,
            ])];
        }
        foreach ($sections as $section) {
            // A section name resolves only inside its own department
            $rows[] = ['section', $section->name, $section->department?->name ?? '', $this->alsoAccepted([
                $section->code, $section->name_th,
            ])];
        }
        foreach ($positions as $position) {
            $rows[] = ['position', $position->title, '', $this->alsoAccepted([$position->code])];
        }

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM, so Excel reads the Thai names
            fputcsv($out, ['column', 'value', 'in_department', 'also_accepted']);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, 'employee-valid-values.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** The other spellings of one record, as one cell: "IT | DEP-0003 | ฝ่ายไอที". */
    private function alsoAccepted(array $aliases): string
    {
        return implode(' | ', array_filter(array_map('trim', array_map('strval', $aliases))));
    }

    /**
     * The template's example row: real master-data spellings, placeholders on a bare install.
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

    /** Dry-runs an uploaded CSV with the import's rules; a file full of errors is still a 200 report. */
    public function importPreview(Request $request): JsonResponse
    {
        $this->guard->canImport($request->user())->authorize();

        $rows = $this->readImportFile($request);
        if ($rows instanceof JsonResponse) {
            return $rows;
        }

        $result = $this->importService->importRows($rows, dryRun: true);
        $valid = count(array_filter($result['rows'], fn (array $row) => $row['errors'] === []));
        $total = count($result['rows']);

        // Counts cover the whole file; the listing is capped, bad rows first
        $listed = collect($result['rows'])
            ->sortBy(fn (array $row) => $row['errors'] === [] ? 1 : 0)
            ->take(EmployeeImportService::PREVIEW_LIMIT)
            ->sortBy('row')
            ->values()
            ->all();

        return response()->json([
            'message' => 'success',
            'data' => $listed,
            'errors' => $result['errors'],
            'meta' => [
                'total' => $total,
                'valid' => $valid,
                'invalid' => $total - $valid,
                'shown' => count($listed),
                'ignored_columns' => $this->unknownImportColumns($rows),
            ],
        ]);
    }

    /** Bulk-imports employees from a CSV, all or nothing: any bad row is a 422 with per-row errors. */
    public function import(Request $request): JsonResponse
    {
        $this->guard->canImport($request->user())->authorize();

        $rows = $this->readImportFile($request);
        if ($rows instanceof JsonResponse) {
            return $rows;
        }

        try {
            $result = $this->importService->importRows($rows);
        } catch (UniqueConstraintViolationException) {
            // Someone saved a clashing employee between the preview and this run
            return response()->json([
                'message' => 'มีข้อมูลพนักงานถูกเปลี่ยนแปลงระหว่างตรวจไฟล์ (รหัสหรืออีเมลซ้ำ) ยังไม่ได้นำเข้า กรุณาตรวจไฟล์อีกครั้งแล้วลองใหม่',
                'errors' => [],
            ], 422);
        }

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
     * Validates and parses the upload, or returns the 422 to send; the preview and the import share it.
     *
     * @return array<int, array<string, string>>|JsonResponse
     */
    private function readImportFile(Request $request): array|JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'max:'.CsvReader::MAX_SIZE_KB]]);

        if (! CsvReader::hasAcceptedExtension($request->file('file'))) {
            return response()->json(['message' => 'รองรับเฉพาะไฟล์ .csv'], 422);
        }

        $rows = CsvReader::read($request->file('file')->getRealPath());
        if ($rows === null || count($rows) === 0) {
            return response()->json(['message' => 'ไฟล์ว่างหรืออ่านไม่ได้'], 422);
        }

        return $rows;
    }

    /**
     * Columns the import has no field for: ignored, but named in the preview.
     *
     * @param  array<int, array<string, string>>  $rows
     * @return list<string>
     */
    private function unknownImportColumns(array $rows): array
    {
        // 'code' = the old name of the employee_code column, still accepted.
        return CsvReader::unknownColumns($rows, array_merge(EmployeeImportService::COLUMNS, ['code']));
    }

    /** The detail each day-one service asks for on Step 3, gated by employees.add (cross-module peek). */
    public function onboardingServices(Request $request): JsonResponse
    {
        $this->guard->canAdd($request->user())->authorize();

        $services = array_map(fn (string $service) => [
            'service' => $service,
            'fields' => RequestSchemas::for(RequestType::from($service)),
        ], EmployeeOnboardingService::SERVICES);

        return response()->json(['data' => $services, 'message' => 'success']);
    }

    /** Whether the day-one requests could be filed for the person on the form; advisory, submit checks again. */
    public function onboardingPrecheck(Request $request, WorkflowResolverService $resolver, ApprovalChainService $chain): JsonResponse
    {
        $this->guard->canAdd($request->user())->authorize();

        $data = $request->validate([
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
        ]);

        $prospect = new Employee([
            'manager_id' => $data['manager_id'] ?? null,
            'position_id' => $data['position_id'] ?? null,
        ]);

        /** @var array<string, string> $codes service => block code */
        $codes = [];
        foreach (EmployeeOnboardingService::SERVICES as $service) {
            $workflow = Workflow::where('request_type', $service)->first();
            $code = $workflow === null || ! $workflow->active
                ? self::WORKFLOW_INACTIVE
                : $resolver->blockReason($workflow, $prospect)?->value;

            if ($code !== null) {
                $codes[$service] = $code;
            }
        }

        // One banner for all three services: a fixable reporting line beats a closed workflow
        $reason = collect([
            ChainBlockReason::ApproverResigned->value,
            ChainBlockReason::NoManager->value,
            self::WORKFLOW_INACTIVE,
            ChainBlockReason::WorkflowIncomplete->value,
        ])->first(fn (string $candidate) => in_array($candidate, $codes, true));

        // Named only for the resigned case, which is useless without whose record to fix
        $resigned = $reason === ChainBlockReason::ApproverResigned->value
            ? $chain->chainFor($prospect)->filter(fn (Employee $manager) => $manager->status === EmployeeStatus::Resigned)->values()
            : collect();

        return response()->json([
            'can_request' => $codes === [],
            'reason' => $reason,
            'blocked_services' => array_keys($codes),
            'resigned_in_chain' => ApproverNodeResource::collection($resigned),
            'message' => 'success',
        ]);
    }

    /** Creates the employee, then files the ticked day-one requests; a failed request never undoes the hire. */
    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $data = $this->handlePhoto($request, $request->validated());
        // Keyed by service, each carrying the fields Step 3 collected for it.
        $services = (array) ($data['services'] ?? []);
        $note = $data['onboarding_note'] ?? null;
        unset($data['services'], $data['onboarding_note']);

        $employee = $this->service->create($data);
        AuditLog::record('Created employee', "{$employee->name} ({$employee->code})", subject: $employee);

        $onboarding = null;
        if ($services !== []) {
            $onboarding = $this->onboarding->fileRequests($employee, $request->user(), $services, $note);
            AuditLog::record('Filed onboarding requests', "{$employee->name} ({$employee->code})", [
                'created' => array_column($onboarding['created'], 'reference'),
                'failed' => array_column($onboarding['failed'], 'service'),
            ], subject: $employee);
        }

        return (new EmployeeResource($employee->load(['department', 'position', 'section'])))
            ->additional(array_filter([
                'message' => 'success',
                'onboarding' => $onboarding,
            ], fn ($value) => $value !== null))
            ->response()->setStatusCode(201);
    }

    /** One employee's full record: the Employee module's detail view, or your own profile. */
    public function show(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canShow($request->user(), $employee)->authorize();

        $employee->load(['department', 'position', 'section', 'manager', 'creator.employee', 'updater.employee'])
            ->loadCount('activeSubordinates as direct_reports_count');

        return (new EmployeeResource($employee))->response();
    }

    /** Assets the employee holds, for the detail's Assets tab (employees.view peek). */
    public function assets(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

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

    /** Access memberships the employee holds, for the detail's Access tab (employees.view peek). */
    public function access(Request $request, Employee $employee, AccessService $accessService): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        $grouped = $accessService->employeeAccess($employee);
        // Let the resource flag rows this employee owns (approver / share owner).
        $grouped['employee_id'] = $employee->id;
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty()
                || $grouped['social_platform']->isNotEmpty() || $grouped['software']->isNotEmpty());

        return (new EmployeeAccessResource($grouped))->response();
    }

    /** Tickets the employee raised, for the detail's Tickets tab (employees.view peek). */
    public function tickets(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

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

    /** Requests the employee owns (employee_id or their own user_id), for the detail's Requests tab. */
    public function requests(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        $userId = $employee->user()->value('id');

        $requests = ServiceRequest::query()
            ->where(function ($query) use ($employee, $userId) {
                $query->where('employee_id', $employee->id);

                if ($userId !== null) {
                    $query->orWhere('user_id', $userId);
                }
            })
            // Onboarding requests share a second; id breaks the tie
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ServiceRequest $sr) => [
                'id' => $sr->id,
                'reference' => $sr->reference,
                'type' => $sr->type->value,
                'origin' => $sr->origin->value,
                'status' => $sr->status->value,
                'created_at' => $sr->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $requests]);
    }

    /** Working employees as flat org-chart nodes; the SPA builds the tree from manager_id. */
    public function orgChart(Request $request): JsonResponse
    {
        $this->guard->canViewOrgChart($request->user())->authorize();

        $employees = Employee::query()
            ->where('status', EmployeeStatus::Active)
            ->with(['position', 'section', 'department'])
            ->withCount('activeSubordinates as reports_count')
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        return OrgChartNodeResource::collection($employees)->additional(['message' => 'success'])->response();
    }

    /** Returns the employee's approval chain (direct manager first, up to the root of the reporting tree). */
    public function approvalChain(Request $request, Employee $employee, ApprovalChainService $chain): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        // chainFor() already eager-loads each approver's position + department.
        $approvers = $chain->chainFor($employee);

        return ApproverNodeResource::collection($approvers)->additional(['message' => 'success'])->response();
    }

    public function update(StoreEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $before = $employee->getOriginal();
        $employee = $this->service->update($employee, $this->handlePhoto($request, $request->validated(), $employee->photo_path));
        AuditLog::record('Updated employee', "{$employee->name} ({$employee->code})", AuditLog::changes($before, $employee), subject: $employee);

        return (new EmployeeResource($employee->load(['department', 'position', 'section'])))->additional(['message' => 'success'])->response();
    }

    /** Renames an existing login (employees.set_credentials) and/or resets its password (employees.reset_password). */
    public function updateCredentials(UpdateEmployeeCredentialsRequest $request, Employee $employee): JsonResponse
    {
        if ($request->renaming()) {
            $this->service->changeUsername($employee, $request->validated('username'));
            AuditLog::record('Changed username', "{$employee->name} ({$employee->code})", subject: $employee);
        }

        $newPassword = null;
        if ($request->resetting()) {
            $newPassword = $this->service->resetPassword($employee, $request->validated('password'), $request->boolean('force_change'));
            AuditLog::record('Reset password', "{$employee->name} ({$employee->code})", subject: $employee);
        }

        return response()->json(array_filter(['message' => 'success', 'new_password' => $newPassword]));
    }

    /** Provisions a login account for an employee who has none yet (employees.set_credentials). */
    public function credentials(StoreEmployeeCredentialsRequest $request, Employee $employee): JsonResponse
    {
        $data = $request->validated();
        $this->service->createUserWithCredentials($employee, $data['username'], $data['password'], $request->boolean('force_change'));

        AuditLog::record('Created user account', "{$employee->name} ({$employee->code})", subject: $employee);

        return response()->json(['message' => 'success'], 201);
    }

    public function resign(ResignEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $data = $request->validated();
        $employee = $this->service->resign($employee, $data['reason'] ?? null, $data['last_day'] ?? null);
        AuditLog::record('Recorded resignation', "{$employee->name} ({$employee->code})", subject: $employee);

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }

    /** Deletes an employee entered by mistake, with their login; a departure is resign, not this. */
    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canDelete($request->user(), $employee)->authorize();

        // Refused while anything refers to them, see EmployeeService::deletionBlockers
        $blockers = $this->service->deletionBlockers($employee);
        if ($blockers) {
            return response()->json(['message' => 'has_activity', 'blockers' => $blockers], 422);
        }

        // Read before the row is gone
        $label = "{$employee->name} ({$employee->code})";
        $deletedAccount = $employee->user?->username;

        SuperAdmins::keepAtLeastOne(function () use ($employee, $label, $deletedAccount) {
            $this->service->delete($employee);
            // Audit names the login that went with them
            AuditLog::recordDeleted('Deleted employee', $label, $employee, $deletedAccount ? ['facts' => ['login_account' => $deletedAccount]] : null);
        });

        return response()->json(['message' => 'success']);
    }

    /** Cancels a resignation by reverting the employee's status back to Active. */
    public function cancelResign(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canCancelResign($request->user(), $employee)->authorize();

        $employee = $this->service->cancelResign($employee);
        AuditLog::record('Cancelled resignation', "{$employee->name} ({$employee->code})", subject: $employee);

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }
}
