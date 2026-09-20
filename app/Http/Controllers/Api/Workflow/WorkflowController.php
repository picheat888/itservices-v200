<?php

namespace App\Http\Controllers\Api\Workflow;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Request\UpdateWorkflowRequest;
use App\Http\Resources\Request\WorkflowResource;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Request\ServiceRequest;
use App\Models\Workflow\Workflow;
use App\Services\Request\WorkflowResolverService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
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
    /** How far back the measured decision times look. */
    private const MEASURE_DAYS = 30;

    /**
     * The definitions, each carrying how long its route ACTUALLY took lately.
     *
     * A step no longer declares an SLA, so the number on the page is measured
     * instead: submitted → decided, over the requests that finished in the last
     * MEASURE_DAYS. The window is what keeps this cheap — one bounded query
     * rather than a scan of every request ever filed — and the page states it, so
     * a figure that moves week to week is not mistaken for a target.
     */
    public function index(): JsonResponse
    {
        // Ordered by how RequestType declares its cases, not by the column. Sorting on the
        // string put Computer next to Email and Hardware after Fileshare — alphabetical order
        // of an internal key, which tells a reader nothing. Sorted in PHP because the list is
        // one row per request type, so there is nothing to gain from doing it in SQL.
        $order = array_flip(array_column(RequestType::cases(), 'value'));
        $workflows = Workflow::with(['steps.positions', 'steps.approvers'])->get()
            ->sortBy(fn (Workflow $workflow) => $order[$workflow->request_type->value] ?? PHP_INT_MAX)
            ->values();

        return response()->json([
            'data' => WorkflowResource::collection($workflows->each(
                fn (Workflow $workflow) => $workflow->setAttribute('measured', $this->measuredDecisionTimes()->get($workflow->id)),
            )),
            'meta' => ['measure_days' => self::MEASURE_DAYS],
        ]);
    }

    /**
     * Average days from submit to decision per workflow, plus how many requests
     * that average rests on. Averaged in PHP (like the request dashboard's cycle
     * figure) so the maths does not depend on the database's date functions.
     *
     * @return Collection<int, array{avg_days: float, requests: int}>
     */
    private function measuredDecisionTimes(): Collection
    {
        return once(fn () => ServiceRequest::query()
            ->whereNotNull('workflow_id')
            ->whereIn('status', [RequestStatus::Approved->value, RequestStatus::Rejected->value, RequestStatus::Fulfilled->value])
            ->where('created_at', '>=', now()->subDays(self::MEASURE_DAYS))
            ->get(['workflow_id', 'created_at', 'approved_at', 'rejected_at'])
            ->groupBy('workflow_id')
            ->map(function ($requests) {
                $spans = $requests
                    ->map(fn (ServiceRequest $r) => ($r->approved_at ?? $r->rejected_at)?->diffInMinutes($r->created_at, true))
                    ->filter(fn ($minutes) => $minutes !== null);

                return $spans->isEmpty() ? null : [
                    'avg_days' => round($spans->avg() / 1440, 1),
                    'requests' => $spans->count(),
                ];
            })
            ->filter());
    }

    public function update(UpdateWorkflowRequest $request, Workflow $workflow): WorkflowResource
    {
        $data = $request->validated();
        $before = $workflow->only(['name', 'active', 'auto_ticket']);

        DB::transaction(function () use ($workflow, $data) {
            $workflow->update(collect($data)->only(['name', 'active', 'auto_ticket'])->all());

            $workflow->steps()->delete();
            foreach (array_values($data['steps']) as $index => $step) {
                $created = $workflow->steps()->create([
                    'position' => $index + 1,
                    'actor_type' => $step['actor_type'],
                    'label' => $step['label'],
                    'kind' => $step['kind'],
                    'department_id' => $step['actor_type'] === StepActorType::Department->value ? ($step['department_id'] ?? null) : null,
                ]);

                // Chain rungs and department groups both sign by position; the pivot rows go
                // with the step. A department step naming people carries no positions.
                if (in_array($step['actor_type'], [StepActorType::Chain->value, StepActorType::Department->value], true)) {
                    $created->positions()->sync($step['position_ids'] ?? []);
                }

                // The people a department step names, in the order the editor listed them —
                // the first is who the route means to ask, the rest are alternates.
                if ($step['actor_type'] === StepActorType::Department->value) {
                    $created->approvers()->sync(array_values($step['approver_employee_ids'] ?? []));
                }
            }
        });

        AuditLog::record('Updated workflow', $workflow->name, [
            'workflow_id' => $workflow->id,
            'before' => $before,
            'after' => $workflow->only(['name', 'active', 'auto_ticket']),
            'steps' => count($data['steps']),
        ]);

        return new WorkflowResource($workflow->refresh()->load(['steps.positions', 'steps.approvers']));
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
            'steps.*.position_ids' => ['array'],
            'steps.*.position_ids.*' => ['integer', 'exists:positions,id'],
            // A department step resolves by these two, so the preview has to be given them
            // — without them every department step previewed as skipped, which is not what
            // the route being edited actually does.
            'steps.*.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'steps.*.approver_employee_ids' => ['array'],
            'steps.*.approver_employee_ids.*' => ['integer', 'exists:employees,id'],
        ]);

        $employee = Employee::with(['position', 'department'])->findOrFail($data['employee_id']);
        $rows = $resolver->resolveSteps(RequestType::from($data['request_type']), $data['steps'], $employee);

        // Enrich resolved approvers with their position/department for display.
        $approvers = Employee::with('position')
            ->whereIn('id', $rows->pluck('approver_employee_id')->filter()->unique())
            ->get()->keyBy('id');

        // The people a group row is open to, so the preview says who may sign rather than
        // leaving the line blank on the one shape that names nobody in particular.
        // get()->pluck(), never pluck() on the query: `name` is composed from first_name and
        // last_name by an accessor, so asking the database for a `name` column is an error.
        $candidates = Employee::whereIn('id', $rows->pluck('approver_employee_ids')->filter()->flatten()->unique())
            ->get()->pluck('name', 'id');

        return response()->json([
            'data' => [
                'employee' => [
                    'id' => $employee->id,
                    'name' => $employee->name,
                    'position' => $employee->position?->title,
                    'department' => $employee->department?->name,
                ],
                'rows' => $rows->map(function (array $row) use ($approvers, $candidates) {
                    $approver = $row['approver_employee_id'] !== null
                        ? $approvers->get($row['approver_employee_id'])
                        : null;

                    return [...$row,
                        'approver_position' => $approver?->position?->title,
                        'approver_candidates' => collect($row['approver_employee_ids'] ?? [])
                            ->map(fn (int $id) => $candidates->get($id))
                            ->filter()->values(),
                    ];
                })->values(),
            ],
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
                'position' => $e->position?->title,
                'department' => $e->department?->name,
            ])->values(),
        ]);
    }
}
