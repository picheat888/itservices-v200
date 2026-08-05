<?php

namespace Database\Seeders;

use App\Models\Workflow\Workflow;
use App\Support\DefaultWorkflows;
use Illuminate\Database\Seeder;

/**
 * Establishes one default workflow per request type. Matches on request_type ONLY:
 * a workflow that already exists is left completely untouched (steps are
 * admin-edited data — re-seeding must never clobber them).
 */
class WorkflowSeeder extends Seeder
{
    public function run(): void
    {
        foreach (DefaultWorkflows::all() as $type => $definition) {
            if (Workflow::where('request_type', $type)->exists()) {
                continue;
            }

            $workflow = Workflow::create([
                'request_type' => $type,
                'name' => $definition['name'],
                'active' => true,
                'auto_ticket' => $definition['auto_ticket'],
            ]);

            foreach ($definition['steps'] as $index => $step) {
                $workflow->steps()->create([
                    'position' => $index + 1,
                    'actor_type' => $step['actor_type'],
                    'label' => $step['label'],
                    'kind' => $step['kind'],
                    'sla_days' => $step['sla_days'],
                ]);
            }
        }
    }
}
