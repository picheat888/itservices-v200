<?php

namespace Tests\Concerns;

use App\Models\Request\ServiceRequest;

/** Body of an approve or reject call: the step the decider is looking at, as the decision dialog sends it. */
trait DecidesRequests
{
    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    protected function decision(ServiceRequest $request, array $body = []): array
    {
        $approvals = $request->approvals()->orderBy('position');
        $stepId = (clone $approvals)->where('status', 'current')->value('id') ?? (clone $approvals)->orderByDesc('position')->value('id');

        return $body + ['step_id' => $stepId];
    }
}
