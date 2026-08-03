<?php

namespace App\Models\Workflow;

use App\Enums\Request\RequestType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Approval workflow definition — one per request type. Steps are read at
 * submit time only; every in-flight request works from its own frozen copy
 * (request_approvals), so editing a workflow never touches running requests.
 */
class Workflow extends Model
{
    protected $fillable = ['request_type', 'name', 'active', 'auto_ticket'];

    protected function casts(): array
    {
        return [
            'request_type' => RequestType::class,
            'active' => 'boolean',
            'auto_ticket' => 'boolean',
        ];
    }

    /** @return HasMany<WorkflowStep, $this> */
    public function steps(): HasMany
    {
        return $this->hasMany(WorkflowStep::class)->orderBy('position');
    }
}
