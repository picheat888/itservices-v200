<?php

namespace App\Http\Controllers\Api\Employee;

use App\Enums\Employee\EmployeeStatus;
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
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Services\Employee\ApprovalChainService;
use App\Services\Employee\EmployeeActionGuard;
use App\Services\Employee\EmployeeImportService;
use App\Services\Employee\EmployeeListService;
use App\Services\Employee\EmployeeOnboardingService;
use App\Services\Employee\EmployeeService;
use App\Services\Employee\EmployeeSummaryService;
use App\Support\CsvReader;
use App\Support\OverviewPeriod;
use App\Support\PerPage;
use App\Support\RequestSchemas;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    public function __construct(
        private readonly EmployeeService $service,
        private readonly EmployeeImportService $importService,
        private readonly EmployeeOnboardingService $onboarding,
        private readonly EmployeeActionGuard $guard,
        private readonly EmployeeListService $lists,
    ) {}

    /**
     * Swaps an uploaded photo for its stored path, deleting the previous file.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function handlePhoto(Request $request, array $data, ?string $oldPath = null): array
    {
        return $this->service->withStoredPhoto($data, $request->hasFile('photo') ? $request->file('photo') : null, $oldPath);
    }

    /** Directory page: search (name, code, email, username), department and status filters. */
    public function index(Request $request): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        $paginator = $this->lists->page([
            'search' => $request->query('search'),
            'department_id' => $request->filled('department_id') ? (int) $request->query('department_id') : null,
            'status' => $request->query('status'),
            'per_page' => PerPage::from($request),
        ]);

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
    public function summary(Request $request, EmployeeSummaryService $summaries): JsonResponse
    {
        $this->guard->canViewOverview($request->user())->authorize();

        $summary = $summaries->summary(OverviewPeriod::fromRequest($request)->onDates());
        $summary['recent'] = EmployeeResource::collection($summary['recent']);
        $summary['recent_resignations'] = EmployeeResource::collection($summary['recent_resignations']);

        return response()->json($summary);
    }

    /** CSV template (UTF-8 BOM for Excel) with one example row from the real master data. */
    public function importTemplate(Request $request): StreamedResponse
    {
        $this->guard->canImport($request->user())->authorize();

        $headers = EmployeeImportService::COLUMNS;
        $sample = $this->importService->sampleRow();

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

        $rows = $this->importService->referenceRows();

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

    /** Dry-runs an uploaded CSV with the import's rules; a file full of errors is still a 200 report. */
    public function importPreview(Request $request): JsonResponse
    {
        $this->guard->canImport($request->user())->authorize();

        $rows = $this->readImportFile($request);
        if ($rows instanceof JsonResponse) {
            return $rows;
        }

        return response()->json(['message' => 'success', ...$this->importService->preview($rows)]);
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
    public function onboardingPrecheck(Request $request): JsonResponse
    {
        $this->guard->canAdd($request->user())->authorize();

        $data = $request->validate([
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
        ]);

        $check = $this->onboarding->precheck(
            isset($data['manager_id']) ? (int) $data['manager_id'] : null,
            isset($data['position_id']) ? (int) $data['position_id'] : null,
        );
        $check['resigned_in_chain'] = ApproverNodeResource::collection($check['resigned_in_chain']);

        return response()->json([...$check, 'message' => 'success']);
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

        return response()->json(['data' => $this->lists->assets($employee)]);
    }

    /** Access memberships the employee holds, for the detail's Access tab (employees.view peek). */
    public function access(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        return (new EmployeeAccessResource($this->lists->access($employee)))->response();
    }

    /** Tickets the employee raised, for the detail's Tickets tab (employees.view peek). */
    public function tickets(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        return response()->json(['data' => $this->lists->tickets($employee)]);
    }

    /** Requests the employee owns (employee_id or their own user_id), for the detail's Requests tab. */
    public function requests(Request $request, Employee $employee): JsonResponse
    {
        $this->guard->canView($request->user())->authorize();

        return response()->json(['data' => $this->lists->requests($employee)]);
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
        $newPassword = $this->service->updateLogin(
            $employee,
            $request->renaming() ? $request->validated('username') : null,
            $request->resetting(),
            $request->validated('password'),
            $request->boolean('force_change'),
        );

        if ($request->renaming()) {
            AuditLog::record('Changed username', "{$employee->name} ({$employee->code})", subject: $employee);
        }
        if ($request->resetting()) {
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

        $blockers = $this->service->deleteUnlessUsed($employee);
        if ($blockers) {
            return response()->json(['message' => 'has_activity', 'blockers' => $blockers], 422);
        }

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
