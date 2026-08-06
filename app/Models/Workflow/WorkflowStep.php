<?php

namespace App\Models\Workflow;

use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Position;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * One ordered step of a workflow: who acts (actor_type + display label), what they
 * do (kind), and — for chain steps — which positions may sign it.
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

    /**
     * The positions allowed to sign this step — one rung of the ladder, which may
     * accept several titles (Asst. Supervisor / Supervisor / Senior Supervisor).
     * Empty for owner and it_staff steps, which resolve by other means.
     *
     * @return BelongsToMany<Position, $this>
     */
    public function positions(): BelongsToMany
    {
        return $this->belongsToMany(Position::class, 'workflow_step_positions');
    }
}
