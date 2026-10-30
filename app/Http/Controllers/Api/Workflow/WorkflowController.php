<?php

namespace App\Http\Controllers\Api\Workflow;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Request\UpdateWorkflowRequest;
use App\Http\Resources\Request\WorkflowResource;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Workflow\Workflow;
use App\Services\Request\WorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Workflows admin (reads gated by permission:workflows.module, writes by
 * permission:workflows.manage): list the ten definitions, replace a workflow's
 * steps/flags, and preview how a step list resolves along a real employee's
 * reporting line. Editing never touches in-flight requests — they run on their
 * submit-time snapshot.
 */
class WorkflowController extends Controller
{
    public function __construct(private readonly WorkflowService $workflows) {}

    /** The definitions, each with how long its route actually took over the last WorkflowService::MEASURE_DAYS. */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => WorkflowResource::collection($this->workflows->listWithMeasurements()),
            'meta' => ['measure_days' => WorkflowService::MEASURE_DAYS],
        ]);
    }

    public function update(UpdateWorkflowRequest $request, Workflow $workflow): WorkflowResource
    {
        return new WorkflowResource($this->workflows->update($workflow, $request->validated()));
    }

    /** Resolve a (possibly unsaved) step list against a chosen employee so the editor can show who would approve. */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'request_type' => ['required', Rule::enum(RequestType::class)],
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'steps' => ['required', 'array', 'min:1'],
            'steps.*.actor_type' => ['required', Rule::enum(StepActorType::class)],
            'steps.*.label' => ['required', 'string', 'max:120'],
            'steps.*.kind' => ['required', Rule::enum(WorkflowStepKind::class)],
            'steps.*.position_ids' => ['array'],
            'steps.*.position_ids.*' => ['integer', 'exists:positions,id'],
            // A department step resolves by these two; without them it previews as skipped
            'steps.*.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'steps.*.approver_employee_ids' => ['array'],
            'steps.*.approver_employee_ids.*' => ['integer', 'exists:employees,id'],
        ]);

        $employee = Employee::with(['position', 'department'])->findOrFail($data['employee_id']);

        return response()->json([
            'data' => $this->workflows->preview(RequestType::from($data['request_type']), $data['steps'], $employee),
        ]);
    }

    /**
     * The job titles a chain rung can name — the editor's position picker.
     *
     * Read-only peek at Employee-module master data under the workflows.module gate:
     * choosing who approves is a workflow decision, so it must not also require the
     * permission to administer positions.
     */
    public function positionOptions(): JsonResponse
    {
        return response()->json([
            'data' => Position::orderBy('code')->get()->map(fn (Position $position) => [
                'id' => $position->id,
                'title' => $position->title,
            ])->values(),
        ]);
    }

    /**
     * Active employees with a login account — the editor's "test with" picker.
     * Own-module endpoint under the workflows.module gate (read-only peek).
     */
    public function employeeOptions(): JsonResponse
    {
        $employees = Employee::with(['position', 'department'])
            ->where('status', EmployeeStatus::Active->value)
            ->whereHas('user')
            ->orderBy('first_name')
            ->get();

        return response()->json([
            'data' => $employees->map(fn (Employee $e) => [
                'id' => $e->id,
                'code' => $e->code,
                'name' => $e->name,
                'name_th' => $e->name_th,
                'position' => $e->position?->title,
                'department' => $e->department?->name,
                'department_th' => $e->department?->name_th,
            ])->values(),
        ]);
    }
}
