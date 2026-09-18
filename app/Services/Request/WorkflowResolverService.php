<?php

namespace App\Services\Request;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\ChainBlockReason;
use App\Enums\Request\RequestType;
use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Employee;
use App\Models\Workflow\Workflow;
use App\Services\Employee\ApprovalChainService;
use Illuminate\Support\Collection;

/**
 * Turns a workflow definition into the concrete, frozen approval rows of one
 * request at submit time:
 *
 *  - chain steps resolve positionally along the requester's manager line (active
 *    employees, whether or not their login exists yet — a step assigned to
 *    somebody without an account WAITS for it rather than being handed upward,
 *    because passing it over their head would record an approval they never
 *    gave); a line shorter than the number of chain steps lets the LAST manager
 *    cover the remaining ones (merged into a single row); no manager at all
 *    collapses every chain step into one skipped row, since there is nobody to
 *    wait for
 *  - owner steps resolve to the owner_employee_id of the Access resource the
 *    requester picked; unresolvable (no resource / no owner / owner is the
 *    requester / owner has left) becomes skipped with the reason in note
 *  - it_staff steps carry no person — they are the requests.fulfill queue
 *
 * Also powers the workflow editor's "test with employee" preview via
 * resolveSteps() on transient (unsaved) steps.
 */
class WorkflowResolverService
{
    public function __construct(private readonly ApprovalChainService $chainService) {}

    /**
     * @param  array<string, mixed>  $fields
     * @return Collection<int, array<string, mixed>>
     */
    public function resolve(Workflow $workflow, Employee $requester, array $fields): Collection
    {
        return $this->resolveSteps(
            $workflow->request_type,
            $this->stepsOf($workflow),
            $requester,
            $fields,
        );
    }

    /**
     * Why this workflow cannot be routed for this requester, or null when it can.
     *
     * Asked BEFORE a request is created (see RequestService), because the two answers
     * below are broken data rather than valid org shapes: skipping the steps would
     * hand the request a clean run through approvals nobody gave. A rung that finds
     * nobody for any other reason — no one of that rank in the line at all — is a
     * skip, not a block, and is not reported here.
     *
     * @param  list<array<string, mixed>>|null  $steps  defaults to the workflow's own
     */
    public function blockReason(Workflow $workflow, Employee $requester, ?array $steps = null): ?ChainBlockReason
    {
        $steps ??= $this->stepsOf($workflow);
        $chainSteps = array_values(array_filter(
            $steps,
            fn (array $step) => StepActorType::from((string) $step['actor_type']) === StepActorType::Chain,
        ));

        // A workflow with no chain steps (IT-only) routes for anybody.
        if ($chainSteps === []) {
            return null;
        }

        $line = $this->chainService->chainFor($requester);
        $usable = $line->filter(fn (Employee $manager) => $this->canHoldAStep($manager))->values();

        if ($usable->isEmpty()) {
            // Somebody who legitimately has nobody above them still submits; their
            // chain steps skip, exactly as before.
            if ($requester->position?->allow_special_position) {
                return null;
            }

            // A line that exists but is entirely made up of people who have left reads
            // as resigned, not as "no manager set" — that is what HR has to fix.
            return $line->isEmpty() ? ChainBlockReason::NoManager : ChainBlockReason::ApproverResigned;
        }

        // A rung that would have resolved to somebody who has since left: compare the
        // full line against the usable one. Finding a holder only among the departed is
        // the case HR has to fix; finding none in either is a rung nobody holds, which
        // is allowed to skip.
        $usableIndex = 0;
        foreach ($chainSteps as $step) {
            $positionIds = $step['position_ids'] ?? [];
            $inUsable = $this->findHolder($usable, $usableIndex, $positionIds);
            if ($inUsable !== null) {
                $usableIndex = $inUsable[0] + 1;

                continue;
            }

            if ($this->findHolder($line, 0, $positionIds) !== null) {
                return ChainBlockReason::ApproverResigned;
            }
        }

        return null;
    }

    /**
     * The workflow's steps in the transient shape resolveSteps() takes.
     *
     * @return list<array<string, mixed>>
     */
    private function stepsOf(Workflow $workflow): array
    {
        return $workflow->steps()->with('positions')->get()->map(fn ($s) => [
            'actor_type' => $s->actor_type->value,
            'label' => $s->label,
            'kind' => $s->kind->value,
            'position_ids' => $s->positions->pluck('id')->all(),
            'department_id' => $s->department_id,
            'approver_employee_id' => $s->approver_employee_id,
        ])->all();
    }

    /**
     * Resolve a transient list of steps (each: actor_type, label, kind, position_ids).
     *
     * @param  list<array<string, mixed>>  $steps
     * @param  array<string, mixed>  $fields
     * @return Collection<int, array<string, mixed>>
     */
    public function resolveSteps(RequestType $type, array $steps, Employee $requester, array $fields = []): Collection
    {
        $chain = $this->chainService->chainFor($requester)
            ->filter(fn (Employee $manager) => $this->canHoldAStep($manager))
            ->values();

        $rows = collect();
        // How far up the line the previous step reached: a rung is never filled by
        // somebody below the person who already signed a lower one.
        $chainIndex = 0;
        $skippedChainLabels = [];

        foreach ($steps as $step) {
            $actorType = StepActorType::from((string) $step['actor_type']);
            $kind = WorkflowStepKind::from((string) $step['kind']);
            $base = [
                'actor_type' => $actorType->value,
                'kind' => $kind->value,
                'label' => (string) $step['label'],
                'approver_employee_id' => null,
                'approver_name' => null,
                'approver_department_id' => null,
                'approver_position_ids' => null,
                'status' => ApprovalStatus::Waiting->value,
                'note' => null,
                'skip_reason' => null,
            ];

            if ($actorType === StepActorType::ItStaff) {
                $rows->push($base);

                continue;
            }

            if ($actorType === StepActorType::Department) {
                $rows->push($this->resolveDepartmentStep($base, $step, $requester));

                continue;
            }

            if ($actorType === StepActorType::Chain) {
                if ($chain->isEmpty()) {
                    // Collected into ONE skipped row after the loop keeps the
                    // trail readable (no three identical "no manager" rows).
                    $skippedChainLabels[] = $base['label'];

                    continue;
                }

                $found = $this->findHolder($chain, $chainIndex, $step['position_ids'] ?? []);
                if ($found === null) {
                    // Nobody above the requester holds this rung — a Supervisor's own
                    // request has no Supervisor over it. The rung is skipped and the
                    // next one still resolves; it is not handed to a non-holder.
                    $rows->push([...$base,
                        'status' => ApprovalStatus::Skipped->value,
                        'skip_reason' => ApprovalSkipReason::NoMatchingPosition->value,
                    ]);

                    continue;
                }

                [$index, $manager] = $found;
                $chainIndex = $index + 1;
                $rows->push([...$base,
                    'approver_employee_id' => $manager->id,
                    'approver_name' => $manager->name,
                ]);

                continue;
            }

            // Owner step.
            $owner = $this->resolveOwner($type, $fields);
            if ($owner === null) {
                $rows->push([...$base,
                    'status' => ApprovalStatus::Skipped->value,
                    'skip_reason' => ApprovalSkipReason::NoResourceOwner->value,
                ]);
            } elseif ($owner->id === $requester->id) {
                $rows->push([...$base,
                    'status' => ApprovalStatus::Skipped->value,
                    'skip_reason' => ApprovalSkipReason::RequesterIsOwner->value,
                ]);
            } else {
                $rows->push([...$base,
                    'approver_employee_id' => $owner->id,
                    'approver_name' => $owner->name,
                ]);
            }
        }

        if ($skippedChainLabels !== []) {
            // The requester has no eligible manager: surface one skipped row in
            // place of the whole chain, positioned before everything else.
            $rows->prepend([
                'actor_type' => StepActorType::Chain->value,
                'kind' => WorkflowStepKind::Approval->value,
                'label' => implode(' · ', $skippedChainLabels),
                'approver_employee_id' => null,
                'approver_name' => null,
                'status' => ApprovalStatus::Skipped->value,
                'note' => null,
                'skip_reason' => ApprovalSkipReason::NoManager->value,
            ]);
        }

        return $this->mergeAndNumber($this->guaranteeAnApprover($rows, $chain));
    }

    /**
     * A department step, frozen into one row.
     *
     * Two shapes: a step that names one person resolves to them, and behaves like any
     * other single-approver row. A step that names positions instead is left open to the
     * whole group — the criteria are copied onto the row so the request keeps the rule it
     * was submitted under even if the workflow is edited later.
     *
     * The requester is excluded either way: a department step that lands on the person who
     * asked would let them sign their own request, which is the one thing every route here
     * is built to prevent.
     *
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $step
     * @return array<string, mixed>
     */
    private function resolveDepartmentStep(array $base, array $step, Employee $requester): array
    {
        $skipped = [...$base,
            'status' => ApprovalStatus::Skipped->value,
            'skip_reason' => ApprovalSkipReason::NoDepartmentApprover->value,
        ];

        $departmentId = $step['department_id'] ?? null;
        if ($departmentId === null) {
            return $skipped;
        }

        // Named person: one row, one approver, exactly like a chain rung that found a holder.
        $namedId = $step['approver_employee_id'] ?? null;
        if ($namedId !== null) {
            $named = Employee::find($namedId);

            return $named !== null && $named->id !== $requester->id && $this->canHoldAStep($named)
                ? [...$base, 'approver_employee_id' => $named->id, 'approver_name' => $named->name]
                : $skipped;
        }

        $positionIds = array_map('intval', array_values($step['position_ids'] ?? []));
        if ($positionIds === []) {
            return $skipped; // a group naming no position accepts nobody
        }

        $eligible = Employee::where('department_id', $departmentId)
            ->whereIn('position_id', $positionIds)
            ->where('id', '!=', $requester->id)
            ->get()
            ->filter(fn (Employee $e) => $this->canHoldAStep($e));

        if ($eligible->isEmpty()) {
            return $skipped;
        }

        return [...$base,
            'approver_department_id' => (int) $departmentId,
            'approver_position_ids' => $positionIds,
        ];
    }

    /**
     * The first person at or above $from in the line whose position this rung
     * accepts, with their index — or null when the line holds nobody suitable.
     *
     * @param  Collection<int, Employee>  $chain
     * @param  list<int>|array<int, mixed>  $positionIds
     * @return array{0: int, 1: Employee}|null
     */
    private function findHolder(Collection $chain, int $from, array $positionIds): ?array
    {
        $accepted = array_map('intval', array_values($positionIds));
        if ($accepted === []) {
            return null; // a rung naming no position accepts nobody
        }

        for ($i = $from; $i < $chain->count(); $i++) {
            $manager = $chain->get($i);
            if ($manager->position_id !== null && in_array((int) $manager->position_id, $accepted, true)) {
                return [$i, $manager];
            }
        }

        return null;
    }

    /**
     * Safety net: a request must not settle itself. When the line has people in it
     * but no rung found a holder — an org chart whose titles do not line up with the
     * workflow — the highest person in the line signs the last chain rung instead of
     * every approval being skipped and the request finalising unapproved.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @param  Collection<int, Employee>  $chain
     * @return Collection<int, array<string, mixed>>
     */
    private function guaranteeAnApprover(Collection $rows, Collection $chain): Collection
    {
        if ($chain->isEmpty()) {
            return $rows; // nobody to fall back to; the no-manager row already says so
        }

        $chainRows = $rows->filter(fn (array $row) => $row['actor_type'] === StepActorType::Chain->value);
        if ($chainRows->isEmpty() || $chainRows->contains(fn (array $row) => $row['approver_employee_id'] !== null)) {
            return $rows;
        }

        $top = $chain->last();
        $lastKey = $chainRows->keys()->last();

        return $rows->map(fn (array $row, int|string $key) => $key === $lastKey
            ? [...$row,
                'approver_employee_id' => $top->id,
                'approver_name' => $top->name,
                'status' => ApprovalStatus::Waiting->value,
                'skip_reason' => null,
            ]
            : $row);
    }

    /**
     * Collapse consecutive rows that resolved to the same person and kind into
     * one row (labels joined), then renumber positions 1..n. Asking one human to
     * press Approve three times in a row is not three approvals.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function mergeAndNumber(Collection $rows): Collection
    {
        $merged = [];
        foreach ($rows as $row) {
            $lastIndex = count($merged) - 1;
            if ($lastIndex >= 0) {
                $last = $merged[$lastIndex];
                if ($last['approver_employee_id'] !== null
                    && $last['approver_employee_id'] === $row['approver_employee_id']
                    && $last['kind'] === $row['kind']) {
                    // The joined label is the explanation: it lists every step this one
                    // decision covers ("Supervisor / Head · Manager · Vice President").
                    // Restating that in prose only added an English sentence to a row
                    // that already said it, so `note` stays free for skip reasons and
                    // for whatever the approver actually writes.
                    $merged[$lastIndex]['label'] = $last['label'].' · '.$row['label'];

                    continue;
                }
            }
            $merged[] = $row;
        }

        return collect($merged)->values()->map(fn (array $row, int $i) => [...$row, 'position' => $i + 1]);
    }

    /**
     * Whose step this may be. An account that has not been provisioned yet is NOT a
     * disqualification: the approval is that person's to give, so the step is
     * assigned to them and waits until they can sign in. Somebody who has left the
     * company is passed over — they are never coming back to act on it.
     *
     * Deliberately the RAW status, not Employee::hasLeft(): the moment a resignation is
     * recorded, requests must route to whoever replaces them, even though that person can
     * still sign in until their last day (which is what hasLeft() governs). The two rules
     * differ on purpose — a resignation in hand is a signal to re-route the approval, and
     * a notice period is not a reason to take the system away from somebody still working.
     */
    private function canHoldAStep(?Employee $employee): bool
    {
        return $employee !== null && $employee->status === EmployeeStatus::Active;
    }

    // NOTE: "this approver has no login yet" is deliberately NOT written onto the
    // row. The row is a snapshot and that fact is not: the moment HR provisions the
    // account, a frozen note would be a lie. RequestApprovalResource reports it live
    // as `awaiting_account` instead.

    /** The owner of the Access resource referenced by the submitted fields, if usable. */
    private function resolveOwner(RequestType $type, array $fields): ?Employee
    {
        $sourceKey = $type->ownerSource();
        $resourceId = $sourceKey !== null ? ($fields[$sourceKey] ?? null) : null;
        if (! $resourceId) {
            return null;
        }

        $resource = match ($sourceKey) {
            'email_group_id' => EmailGroup::find($resourceId),
            'file_share_id' => FileShare::find($resourceId),
            default => null,
        };

        $owner = $resource?->owner;

        return $this->canHoldAStep($owner) ? $owner : null;
    }
}
