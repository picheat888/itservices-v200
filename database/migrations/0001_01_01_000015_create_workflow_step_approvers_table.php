<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 16/17 — the people a department step names, as a list.
 *
 * A step that names one person could have been a column, but naming a deputy alongside
 * them is the common case — so a route does not stall while somebody is on leave — and
 * the alternative (naming positions, in workflow_step_positions) says something else
 * entirely: it opens the step to everybody in the department at that level, including
 * people the route never meant to ask.
 *
 * Whoever signs first closes the step; this is a list of who MAY, not a set of
 * signatures that must all be collected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_step_approvers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_step_id')->constrained()->cascadeOnDelete();
            // restrictOnDelete, not cascade: a person cascading out of here would quietly leave the
            // step with nobody to ask. EmployeeService::deletionBlockers() reports this as a
            // blocker first, so the refusal reads as a reason rather than a database error.
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->unique(['workflow_step_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_step_approvers');
    }
};
