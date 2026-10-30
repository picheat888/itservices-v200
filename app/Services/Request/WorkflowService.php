<?php

namespace App\Services\Request;

use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Workflow\Workflow;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Workflow admin behind WorkflowController: the list with measured decision times, replacing a workflow's
 * steps, and previewing how a step list resolves for one employee. In-flight requests keep their snapshot.
 */
class WorkflowService
{
    /** How far back the measured decision times look. */
    public const MEASURE_DAYS = 30;

    public function __construct(private readonly WorkflowResolverService $resolver) {}

    /**
     * Every workflow in RequestType's order, each carrying `measured` (how long its route actually took lately).
     *
     * @return Collection<int, Workflow>
     */
    public function listWithMeasurements(): Collection
    {
        // RequestType's case order, not the column's alphabetical order; one row per type, so sorted in PHP
        $order = array_flip(array_column(RequestType::cases(), 'value'));
        $measured = $this->measuredDecisionTimes();

        return Workflow::with(['steps.positions', 'steps.approvers', 'updater.employee'])->get()
            ->sortBy(fn (Workflow $workflow) => $order[$workflow->request_type->value] ?? PHP_INT_MAX)
            ->values()
            ->each(fn (Workflow $workflow) => $workflow->setAttribute('measured', $measured->get($workflow->id)));
    }

    /**
     * Average days from submit to decision per workflow over the last MEASURE_DAYS, plus how many requests
     * that average rests on. Averaged in PHP so the maths does not depend on the database's date functions.
     *
     * @return Collection<int, array{avg_days: float, requests: int}>
     */
    public function measuredDecisionTimes(): Collection
    {
        return ServiceRequest::query()
            ->whereNotNull('workflow_id')
            ->whereIn('status', [RequestStatus::Approved->value, RequestStatus::Rejected->value, RequestStatus::Completed->value])
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
            ->filter();
    }

    /**
     * Replace the workflow's flags and steps, then record the change.
     *
     * @param  array<string, mixed>  $data  validated by UpdateWorkflowRequest
     */
    public function update(Workflow $workflow, array $data): Workflow
    {
        $before = $workflow->only(['name', 'active', 'auto_ticket']);

        DB::transaction(function () use ($workflow, $data) {
            $workflow->update(collect($data)->only(['name', 'active', 'auto_ticket'])->all());
            // A steps-only save leaves the row clean; touch() moves updated_at and updated_by anyway
            $workflow->touch();

            $workflow->steps()->delete();
            foreach (array_values($data['steps']) as $index => $step) {
                $created = $workflow->steps()->create([
                    'position' => $index + 1,
                    'actor_type' => $step['actor_type'],
                    'label' => $step['label'],
                    'kind' => $step['kind'],
                    'department_id' => $step['actor_type'] === StepActorType::Department->value ? ($step['department_id'] ?? null) : null,
                ]);

                // Chain rungs and department groups sign by position; a department step naming people carries none
                if (in_array($step['actor_type'], [StepActorType::Chain->value, StepActorType::Department->value], true)) {
                    $created->positions()->sync($step['position_ids'] ?? []);
                }

                // The people a department step names, in the editor's order: the first is who the route means to ask
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
        ], subject: $workflow);

        return $workflow->refresh()->load(['steps.positions', 'steps.approvers', 'updater.employee']);
    }

    /**
     * Resolve a (possibly unsaved) step list against one employee, with each approver's position and the
     * people a group row is open to. Owner steps resolve at submit time from the picked resource.
     *
     * @param  list<array<string, mixed>>  $steps
     * @return array{employee: array<string, mixed>, rows: Collection<int, array<string, mixed>>}
     */
    public function preview(RequestType $type, array $steps, Employee $employee): array
    {
        $employee->loadMissing(['position', 'department']);
        $rows = $this->resolver->resolveSteps($type, $steps, $employee);

        $approvers = Employee::with('position')
            ->whereIn('id', $rows->pluck('approver_employee_id')->filter()->unique())
            ->get()->keyBy('id');

        // get()->pluck(), never pluck() on the query: `name` is an accessor, not a column
        $candidateModels = Employee::whereIn('id', $rows->pluck('approver_employee_ids')->filter()->flatten()->unique())->get();
        $candidates = $candidateModels->pluck('name', 'id');
        $candidatesTh = $candidateModels->pluck('name_th', 'id');

        return [
            'employee' => [
                'id' => $employee->id,
                'name' => $employee->name,
                'position' => $employee->position?->title,
                'department' => $employee->department?->name,
            ],
            'rows' => $rows->map(function (array $row) use ($approvers, $candidates, $candidatesTh) {
                $approver = $row['approver_employee_id'] !== null
                    ? $approvers->get($row['approver_employee_id'])
                    : null;

                return [...$row,
                    'approver_name_th' => $approver?->name_th,
                    'approver_position' => $approver?->position?->title,
                    'approver_candidates' => collect($row['approver_employee_ids'] ?? [])
                        ->map(fn (int $id) => $candidates->get($id))
                        ->filter()->values(),
                    'approver_candidates_th' => collect($row['approver_employee_ids'] ?? [])
                        ->filter(fn (int $id) => $candidates->get($id))
                        ->map(fn (int $id) => $candidatesTh->get($id))->values(),
                ];
            })->values(),
        ];
    }
}
