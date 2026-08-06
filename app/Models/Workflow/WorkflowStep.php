<?php

namespace App\Models\Workflow;

use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One ordered step of a workflow: who acts (actor_type + display label),
 * what they do (kind), and the SLA allowance in days.
 */
class WorkflowStep extends Model
{
    protected $fillable = ['workflow_id', 'position', 'actor_type', 'label', 'kind'];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'actor_type' => StepActorType::class,
            'kind' => WorkflowStepKind::class,
        ];
    }

    /** @return BelongsTo<Workflow, $this> */
    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }
}
