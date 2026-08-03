<?php

namespace App\Http\Resources\Request;

use App\Models\Workflow\Workflow;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A workflow definition with its ordered steps (Workflows admin page).
 *
 * @mixin Workflow
 */
class WorkflowResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'request_type' => $this->request_type?->value,
            'name' => $this->name,
            'active' => $this->active,
            'auto_ticket' => $this->auto_ticket,
            'steps' => WorkflowStepResource::collection($this->whenLoaded('steps')),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
