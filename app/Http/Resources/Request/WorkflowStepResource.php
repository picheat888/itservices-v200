<?php

namespace App\Http\Resources\Request;

use App\Models\Workflow\WorkflowStep;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One workflow step definition, as the Workflows admin page renders it.
 *
 * @mixin WorkflowStep
 */
class WorkflowStepResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'position' => $this->position,
            'actor_type' => $this->actor_type?->value,
            'label' => $this->label,
            'kind' => $this->kind?->value,
            // The rung's positions — what resolution matches against on a chain step,
            // and what the editor's position picker shows. Empty for owner / it_staff.
            'positions' => $this->whenLoaded('positions', fn () => $this->positions
                ->map(fn ($position) => ['id' => $position->id, 'title' => $position->title])
                ->values(), []),
            // Set only on a department step: which department signs, and the people in it
            // the step names rather than accepting a rung. Several may be named — they are
            // alternates, and whichever signs first settles the step.
            'department_id' => $this->department_id,
            'department_name' => $this->whenLoaded('department', fn () => $this->department?->name),
            'approvers' => $this->whenLoaded('approvers', fn () => $this->approvers
                ->map(fn ($employee) => ['id' => $employee->id, 'name' => $employee->name])
                ->values(), []),
        ];
    }
}
