<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A department step may name SEVERAL people, not just one.
 *
 * The single `workflow_steps.approver_employee_id` could only ever say "this one person
 * signs". Naming a deputy alongside them — the common case, so a route does not stall
 * while somebody is on leave — had no way to be expressed, and the alternative (naming
 * positions) says something different: it opens the step to everybody in the department
 * at that level, including people the route never meant to ask.
 *
 * So the one column becomes a list, held in its own table the way step positions already
 * are. Existing steps are backfilled into it before the column goes, so a route that
 * names one person keeps naming exactly them.
 *
 * `request_approvals` gets the matching snapshot column. A submitted request must not
 * change meaning when the workflow is edited afterwards — the same reason the row already
 * freezes `approver_name` and `approver_position_ids` rather than reading them live.
 * It is written ONLY when two or more people are named: one named person still resolves
 * to `approver_employee_id`, so the overwhelmingly common row keeps its old shape and
 * everything reading it keeps working unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_step_approvers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_step_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->unique(['workflow_step_id', 'employee_id']);
        });

        // Carry every step that names somebody into the new table before the column goes.
        DB::table('workflow_steps')
            ->whereNotNull('approver_employee_id')
            ->orderBy('id')
            ->each(fn ($step) => DB::table('workflow_step_approvers')->insert([
                'workflow_step_id' => $step->id,
                'employee_id' => $step->approver_employee_id,
            ]));

        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approver_employee_id');
        });

        Schema::table('request_approvals', function (Blueprint $table) {
            // The named people, frozen at submit. JSON for the same reason
            // `approver_position_ids` is: it is read as a whole and never joined against.
            $table->json('approver_employee_ids')->nullable()->after('approver_position_ids');
        });
    }

    public function down(): void
    {
        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->foreignId('approver_employee_id')->nullable()->after('department_id')
                ->constrained('employees')->nullOnDelete();
        });

        // Only the first name of each step survives going back — the column holds one.
        DB::table('workflow_step_approvers')->orderBy('id')->each(function ($row) {
            DB::table('workflow_steps')
                ->where('id', $row->workflow_step_id)
                ->whereNull('approver_employee_id')
                ->update(['approver_employee_id' => $row->employee_id]);
        });

        Schema::dropIfExists('workflow_step_approvers');

        Schema::table('request_approvals', function (Blueprint $table) {
            $table->dropColumn('approver_employee_ids');
        });
    }
};
