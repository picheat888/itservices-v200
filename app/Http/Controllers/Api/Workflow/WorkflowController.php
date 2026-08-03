<?php

namespace App\Http\Controllers\Api\Workflow;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Request\UpdateWorkflowRequest;
use App\Http\Resources\Request\WorkflowResource;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Workflow\Workflow;
use App\Services\Request\WorkflowResolverService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Workflows admin (routes carry permission:workflows.manage): list the ten
 * definitions, replace a workflow's steps/flags, and preview how a step list
 * resolves along a real employee's reporting line. Editing never touches
 * in-flight requests — they run on their submit-time snapshot.
 */
class WorkflowController extends Controller
{
    public function index(): JsonResponse
    {
        $workflows = Workflow::with('steps')->orderBy('request_type')->get();

        return response()->json(['data' => WorkflowResource::collection($workflows)]);
    }

    public function update(UpdateWorkflowRequest $request, Workflow $workflow): WorkflowResource
    {
        $data = $request->validated();
        $before = $workflow->only(['name', 'active', 'auto_ticket']);

        DB::transaction(function () use ($workflow, $data) {
            $workflow->update(collect($data)->only(['name', 'active', 'auto_ticket'])->all());

            $workflow->steps()->delete();
            foreach (array_values($data['steps']) as $index => $step) {
                $workflow->steps()->create([
                    'position' => $index + 1,
                    'actor_type' => $step['actor_type'],
                    'label' => $step['label'],
                    'kind' => $step['kind'],
                    'sla_days' => $step['sla_days'],
                ]);
            }
        });

        AuditLog::record('Updated workflow', $workflow->name, [
            'workflow_id' => $workflow->id,
            'before' => $before,
            'after' => $workflow->only(['name', 'active', 'auto_ticket']),
            'steps' => count($data['steps']),
        ]);

        return new WorkflowResource($workflow->refresh()->load('steps'));
    }

    /**
     * Resolve a (possibly unsaved) step list against a chosen employee so the
     * editor can show who would actually approve. Owner steps resolve at
     * submit time from the picked resource, so here they preview as-is.
     */
    public function preview(Request $request, WorkflowResolverService $resolver): JsonResponse
    {
        $data = $request->validate([
            'request_type' => ['required', Rule::enum(RequestType::class)],
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'steps' => ['required', 'array', 'min:1'],
            'steps.*.actor_type' => ['required', Rule::enum(StepActorType::class)],
            'steps.*.label' => ['required', 'string', 'max:120'],
            'steps.*.kind' => ['required', Rule::enum(WorkflowStepKind::class)],
            'steps.*.sla_days' => ['required', 'numeric', 'min:0', 'max:365'],
        ]);

        $employee = Employee::with(['position', 'department'])->findOrFail($data['employee_id']);
        $rows = $resolver->resolveSteps(RequestType::from($data['request_type']), $data['steps'], $employee);

        // Enrich resolved approvers with their position/department for display.
        $approvers = Employee::with('position')
            ->whereIn('id', $rows->pluck('approver_employee_id')->filter()->unique())
            ->get()->keyBy('id');

        return response()->json([
            'data' => [
                'employee' => [
                    'id' => $employee->id,
                    'name' => $employee->name,
                    'position' => $employee->position?->title,
                    'department' => $employee->department?->name,
                ],
                'rows' => $rows->map(function (array $row) use ($approvers) {
                    $approver = $row['approver_employee_id'] !== null
                        ? $approvers->get($row['approver_employee_id'])
                        : null;

                    return [...$row, 'approver_position' => $approver?->position?->title];
                })->values(),
            ],
        ]);
    }

    /**
     * Active employees with a login account — the editor's "test with" picker.
     * Own-module endpoint under the workflows.manage gate (read-only peek).
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
                'position' => $e->position?->title,
                'department' => $e->department?->name,
            ])->values(),
        ]);
    }
}
