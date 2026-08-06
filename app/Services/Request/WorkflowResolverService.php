<?php

namespace App\Services\Request;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
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
            $workflow->steps()->get()->map(fn ($s) => [
                'actor_type' => $s->actor_type->value,
                'label' => $s->label,
                'kind' => $s->kind->value,
                'sla_days' => (float) $s->sla_days,
            ])->all(),
            $requester,
            $fields,
        );
    }

    /**
     * Resolve a transient list of steps (each: actor_type, label, kind, sla_days).
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
        $chainIndex = 0;
        $skippedChainLabels = [];

        foreach ($steps as $step) {
            $actorType = StepActorType::from((string) $step['actor_type']);
            $kind = WorkflowStepKind::from((string) $step['kind']);
            $base = [
                'actor_type' => $actorType->value,
                'kind' => $kind->value,
                'label' => (string) $step['label'],
                'sla_days' => (float) ($step['sla_days'] ?? 1),
                'approver_employee_id' => null,
                'approver_name' => null,
                'status' => ApprovalStatus::Waiting->value,
                'note' => null,
                'skip_reason' => null,
            ];

            if ($actorType === StepActorType::ItStaff) {
                $rows->push($base);

                continue;
            }

            if ($actorType === StepActorType::Chain) {
                if ($chain->isEmpty()) {
                    // Collected into ONE skipped row after the loop keeps the
                    // trail readable (no three identical "no manager" rows).
                    $skippedChainLabels[] = $base['label'];

                    continue;
                }
                $manager = $chain->get(min($chainIndex, $chain->count() - 1));
                $chainIndex++;
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
                'sla_days' => null,
                'approver_employee_id' => null,
                'approver_name' => null,
                'status' => ApprovalStatus::Skipped->value,
                'note' => null,
                'skip_reason' => ApprovalSkipReason::NoManager->value,
            ]);
        }

        return $this->mergeAndNumber($rows);
    }

    /**
     * Collapse consecutive rows that resolved to the same person and kind into
     * one row (labels joined, largest SLA wins — one decision, one clock),
     * then renumber positions 1..n. Asking one human to press Approve three times
     * in a row is not three approvals.
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
                    $merged[$lastIndex]['sla_days'] = max((float) $last['sla_days'], (float) $row['sla_days']);

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
