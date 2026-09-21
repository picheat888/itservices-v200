<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 12/17 — ties each chain step to the positions allowed to sign it.
 *
 * The step labels always read like position names ("Supervisor / Head",
 * "Manager / Asst. Manager"), but resolution took the Nth manager above the
 * requester whoever they were — so a Staff member's "Supervisor / Head" step went
 * to their Leader. From here a step names real positions and the resolver climbs
 * the reporting line until it finds a holder.
 *
 * A pivot rather than a column because one level accepts several titles (Asst.
 * Supervisor / Supervisor / Senior Supervisor are one rung), and by id rather
 * than by title so renaming a position cannot orphan a workflow.
 *
 * Existing steps are backfilled from their labels; anything unrecognised is left
 * without positions, which the resolver treats as "no holder found" rather than
 * silently reverting to counting managers.
 */
return new class extends Migration
{
    /** Label written by DefaultWorkflows => the position titles that rung accepts. */
    private const BACKFILL = [
        'Supervisor / Head' => ['Asst. Supervisor', 'Supervisor', 'Senior Supervisor'],
        'Manager / Asst. Manager' => ['Asst. Manager', 'Manager', 'Senior Manager'],
        'Department Manager' => ['Asst. Manager', 'Manager', 'Senior Manager'],
        'Vice President' => ['Vice President', 'Director'],
    ];

    public function up(): void
    {
        Schema::create('workflow_step_positions', function (Blueprint $table) {
            $table->unsignedBigInteger('workflow_step_id');
            $table->unsignedBigInteger('position_id');

            $table->primary(['workflow_step_id', 'position_id']);
            $table->index('position_id');
            $table->foreign('workflow_step_id')->references('id')->on('workflow_steps')->cascadeOnDelete();
            // A position in use by a workflow must not vanish under it.
            $table->foreign('position_id')->references('id')->on('positions')->restrictOnDelete();
        });

        $positionIdByTitle = DB::table('positions')->pluck('id', 'title');

        foreach (self::BACKFILL as $label => $titles) {
            $ids = collect($titles)->map(fn ($title) => $positionIdByTitle[$title] ?? null)->filter()->values();
            if ($ids->isEmpty()) {
                continue; // positions not seeded on this install
            }

            $stepIds = DB::table('workflow_steps')->where('actor_type', 'chain')->where('label', $label)->pluck('id');
            foreach ($stepIds as $stepId) {
                foreach ($ids as $positionId) {
                    DB::table('workflow_step_positions')->insertOrIgnore([
                        'workflow_step_id' => $stepId,
                        'position_id' => $positionId,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_step_positions');
    }
};
