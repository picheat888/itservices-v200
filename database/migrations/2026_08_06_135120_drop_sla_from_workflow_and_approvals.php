<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the configured SLA from the approval engine.
 *
 * A workflow step used to carry `sla_days`, which a request froze onto its approval
 * row and turned into a `due_at` deadline. Nobody set those numbers from experience —
 * they were seeded guesses — and the module already reports how long approvals
 * actually take, measured from the requests themselves (submitted → decided). Keeping
 * a target nobody chose meant "overdue" flags derived from a guess.
 *
 * What replaces it: nothing configured. `became_current_at` / `acted_at` /
 * `created_at` / `approved_at` remain, which is everything needed to measure the real
 * thing after the fact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->dropColumn('sla_days');
        });

        Schema::table('request_approvals', function (Blueprint $table) {
            // due_at existed only to hold "became_current_at + sla_days".
            $table->dropColumn(['sla_days', 'due_at']);
        });
    }

    public function down(): void
    {
        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->decimal('sla_days', 5, 2)->default(1.00);
        });

        Schema::table('request_approvals', function (Blueprint $table) {
            $table->decimal('sla_days', 5, 2)->nullable();
            $table->dateTime('due_at')->nullable();
        });
    }
};
