<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Models\User;
use App\Services\EmployeeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class EmployeeController extends Controller
{
    public function __construct(private readonly EmployeeService $service) {}

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
                Storage::disk('public')->delete($oldPath);
            }
            $data['photo_path'] = $request->file('photo')->store('employees', 'public');
        }

        return $data;
    }

    /**
     * Returns all employees (for dashboard/pickers) or a paginated page
     * with search+department filtering when the ?page query param is present.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Employee::with(['department', 'position'])->orderBy('name');

        if ($request->has('page')) {
            $perPage = max(10, min(100, (int) $request->query('per_page', 20)));

            if ($request->filled('search')) {
                $q = '%' . $request->query('search') . '%';
                $query->where(function ($w) use ($q) {
                    $w->where('name', 'like', $q)
                        ->orWhere('name_th', 'like', $q)
                        ->orWhere('code', 'like', $q);
                });
            }

            if ($request->filled('department_id')) {
                $query->where('department_id', (int) $request->query('department_id'));
            }

            $paginator = $query->paginate($perPage);

            return response()->json([
                'data' => EmployeeResource::collection($paginator->items()),
                'meta' => [
                    'total'        => $paginator->total(),
                    'per_page'     => $paginator->perPage(),
                    'current_page' => $paginator->currentPage(),
                    'last_page'    => $paginator->lastPage(),
                ],
            ]);
        }

        return EmployeeResource::collection($query->get())->response();
    }

    /**
     * Returns aggregated dashboard stats without loading all employee records.
     * Includes total count, new-hire count, and the 5 most recent hires.
     */
    public function summary(): JsonResponse
    {
        $total    = Employee::count();
        $newHires = Employee::where('joined_at', '>=', '2023-01-01')->count();
        $recent   = Employee::with(['department', 'position'])
            ->orderByDesc('joined_at')
            ->limit(5)
            ->get();

        return response()->json([
            'total'     => $total,
            'new_hires' => $newHires,
            'recent'    => EmployeeResource::collection($recent),
        ]);
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $employee = $this->service->create($this->handlePhoto($request, $request->validated()));
        \App\Models\AuditLog::record('Created employee', "{$employee->name} ({$employee->code})");

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return (new EmployeeResource($employee->load(['department', 'position'])))->response();
    }

    public function update(StoreEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $employee = $this->service->update($employee, $this->handlePhoto($request, $request->validated(), $employee->photo_path));
        \App\Models\AuditLog::record('Updated employee', "{$employee->name} ({$employee->code})");

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageEmployees(), 403);
        \App\Models\AuditLog::record('Deleted employee', "{$employee->name} ({$employee->code})");
        $employee->delete();

        return response()->json(['message' => 'success']);
    }

    /** Resets the linked system account password to the employee's code. Returns the new password. */
    public function resetPassword(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.reset_password'), 403);

        // Find the user account by matching email or username
        $user = User::where('email', $employee->email)
            ->orWhere('username', $employee->username)
            ->first();

        if (! $user) {
            return response()->json(['message' => 'no_account'], 422);
        }

        $newPassword = $employee->code; // Reset to employee code
        $user->update(['password' => Hash::make($newPassword)]);

        \App\Models\AuditLog::record('Reset password', "{$employee->name} ({$employee->code})");

        return response()->json(['message' => 'success', 'new_password' => $newPassword]);
    }

    /**
     * Provisions a login account (username + password) for an employee who
     * does not have one yet. Only accessible to users with the
     * employees.set_credentials permission.
     */
    public function credentials(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.set_credentials'), 403);

        $alreadyHasAccount = User::where('email', $employee->email)
            ->when($employee->username, fn ($q) => $q->orWhere('username', $employee->username))
            ->exists();

        if ($alreadyHasAccount) {
            return response()->json(['message' => 'Employee already has a login account.'], 422);
        }

        $data = $request->validate([
            'username' => ['required', 'string', 'max:255', 'unique:users,username'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $this->service->createUserWithCredentials($employee, $data['username'], $data['password']);

        \App\Models\AuditLog::record('Created user account', "{$employee->name} ({$employee->code})");

        return response()->json(['message' => 'success'], 201);
    }

    public function resign(Request $request, Employee $employee): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.resign'), 403);

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
            'last_day' => ['nullable', 'date'],
        ]);

        $employee = $this->service->resign($employee, $data['reason'] ?? null, $data['last_day'] ?? null);
        \App\Models\AuditLog::record('Recorded resignation', "{$employee->name} ({$employee->code})");

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
        \App\Models\AuditLog::record('Cancelled resignation', "{$employee->name} ({$employee->code})");

        return (new EmployeeResource($employee))->additional(['message' => 'success'])->response();
    }
}
