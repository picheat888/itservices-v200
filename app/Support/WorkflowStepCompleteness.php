<?php

namespace App\Support;

use App\Enums\Request\StepActorType;

/**
 * What a workflow step has to name before it can ever resolve to anybody.
 *
 * One copy of the rule, read in two places: the workflow editor refuses to save a
 * step that breaks it (UpdateWorkflowRequest), and a request is refused at submit
 * while its workflow still holds one (WorkflowResolverService::blockReason). The
 * editor is not the only way steps reach the table — WorkflowSeeder run before the
 * install had positions or departments leaves them empty too, and without the
 * submit-time check such a step would silently skip on every request.
 *
 * Deliberately separate from a step that finds nobody for ONE requester (nobody of
 * that rank in their line): that is a valid org shape and still skips.
 *
 * Step shape: actor_type, position_ids, department_id, approver_employee_ids — the
 * editor payload and WorkflowResolverService's transient steps share it.
 */
final class WorkflowStepCompleteness
{
    /**
     * What is missing from one step, keyed by the step field the error belongs on.
     *
     * @param  array<string, mixed>  $step
     * @return array<string, string> field => English message
     */
    public static function problems(array $step): array
    {
        $actor = StepActorType::tryFrom((string) ($step['actor_type'] ?? ''));
        $problems = [];

        // A chain rung is defined by the positions that may sign it; without any,
        // resolution would climb the reporting line looking for nobody.
        if ($actor === StepActorType::Chain && empty($step['position_ids'])) {
            $problems['position_ids'] = 'Choose at least one position that may approve this step.';
        }

        if ($actor === StepActorType::Department) {
            if (empty($step['department_id'])) {
                $problems['department_id'] = 'Choose the department that approves this step.';
            }

            // And it has to say who in that department: the people who may sign, or the
            // positions it accepts.
            $named = array_filter((array) ($step['approver_employee_ids'] ?? []));
            if ($named === [] && empty($step['position_ids'])) {
                $problems['position_ids'] = 'Name a person in that department, or the positions that may approve.';
            }
        }

        return $problems;
    }

    /**
     * True when every step can resolve to somebody.
     *
     * @param  list<array<string, mixed>>  $steps
     */
    public static function isComplete(array $steps): bool
    {
        foreach ($steps as $step) {
            if (self::problems($step) !== []) {
                return false;
            }
        }

        return true;
    }
}
