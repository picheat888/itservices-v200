<?php

namespace App\Models\Workflow;

use App\Enums\Request\StepActorType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * One ordered step of a workflow: who acts (actor_type + display label), what they
 * do (kind), and — for chain and department steps — which positions may sign it.
 */
class WorkflowStep extends Model
{
    protected $fillable = ['workflow_id', 'position', 'actor_type', 'label', 'kind', 'department_id'];

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
     * The department asked to sign a `department` step; null on every other kind.
     *
     * @return BelongsTo<Department, $this>
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /**
     * The people a department step names, when it names any. Empty means the step accepts
     * anybody in the department holding one of its positions.
     *
     * Several may be named — a manager and their deputy, say — and then whoever signs
     * first settles the step. It is a list of alternates, never a list of signatures to
     * collect: one decision moves the request on.
     *
     * @return BelongsToMany<Employee, $this>
     */
    public function approvers(): BelongsToMany
    {
        // Ordered by the pivot's own key, which is the order the editor sent them in: the
        // first name is who the route means to ask, and the editor shows them back that way.
        return $this->belongsToMany(Employee::class, 'workflow_step_approvers')
            ->orderBy('workflow_step_approvers.id');
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
