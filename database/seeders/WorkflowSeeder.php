<?php

namespace Database\Seeders;

use App\Enums\Request\StepActorType;
use App\Models\Employee\Position;
use App\Models\Workflow\Workflow;
use App\Support\DefaultWorkflows;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

/**
 * Establishes one default workflow per request type, matching on request_type. The
 * steps of a workflow that already exists are never rewritten — they are
 * admin-edited data.
 *
 * Chain steps get their positions attached here, so a fresh install routes by
 * position from the first request. Run EmployeePositionSeeder first: a title this install
 * does not have simply is not attached, and the Workflows page can fix it.
 *
 * The one thing re-seeding does touch on an existing workflow is a chain rung with
 * NO position at all — an install from before position routing, which would resolve
 * to nobody. A rung an administrator has already set is left alone.
 */
class WorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $positionIdByTitle = Position::pluck('id', 'title');

        foreach (DefaultWorkflows::all() as $type => $definition) {
            $existing = Workflow::with('steps.positions')->where('request_type', $type)->first();
            if ($existing !== null) {
                $this->fillMissingPositions($existing, $definition['steps'], $positionIdByTitle);

                continue;
            }

            $workflow = Workflow::create([
                'request_type' => $type,
                'name' => $definition['name'],
                'active' => true,
                'auto_ticket' => $definition['auto_ticket'],
            ]);

            foreach ($definition['steps'] as $index => $step) {
                $created = $workflow->steps()->create([
                    'position' => $index + 1,
                    'actor_type' => $step['actor_type'],
                    'label' => $step['label'],
                    'kind' => $step['kind'],
                ]);

                $positionIds = collect($step['positions'] ?? [])
                    ->map(fn (string $title) => $positionIdByTitle[$title] ?? null)
                    ->filter()->values()->all();
                if ($positionIds !== []) {
                    $created->positions()->sync($positionIds);
                }
            }
        }

        $this->command?->info('Workflows: '.Workflow::query()->count().' routes.');
    }

    /**
     * Gives chain rungs of an existing workflow the positions they are missing.
     *
     * Installs that had workflows before routing became position-based have steps
     * with no rung attached — and so would resolve to nobody. Matching on the step
     * label, only steps that currently hold NO position are touched: a rung an
     * administrator has already set stays exactly as they set it.
     *
     * @param  list<array<string, mixed>>  $defaults
     * @param  Collection<string, int>  $positionIdByTitle
     */
    private function fillMissingPositions(Workflow $workflow, array $defaults, $positionIdByTitle): void
    {
        $titlesByLabel = collect($defaults)
            ->filter(fn (array $step) => ($step['positions'] ?? []) !== [])
            ->mapWithKeys(fn (array $step) => [$step['label'] => $step['positions']]);

        foreach ($workflow->steps as $step) {
            if ($step->actor_type !== StepActorType::Chain || $step->positions->isNotEmpty()) {
                continue;
            }

            $ids = collect($titlesByLabel[$step->label] ?? [])
                ->map(fn (string $title) => $positionIdByTitle[$title] ?? null)
                ->filter()->values()->all();
            if ($ids !== []) {
                $step->positions()->sync($ids);
                $this->command?->info("  filled positions for \"{$step->label}\" on {$workflow->name}");
            }
        }
    }
}
