<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Room for a workflow step that asks a department to sign, rather than the requester's
 * own manager line.
 *
 * A chain step walks up from the requester and matches on position. That cannot express
 * "QC signs this": QC is not above the person asking. So a step gains a department, and
 * either a named person in it or — using the positions it already has — whoever in that
 * department holds one of them.
 *
 * `request_approvals` gets its own copy of the criteria rather than a pointer back to the
 * step. A request that has been submitted must not change meaning when somebody edits the
 * workflow afterwards, which is the same reason the table already stores `approver_name`
 * instead of reading the name off the employee row each time.
 *
 * Every column is nullable and nothing is backfilled: existing steps and existing requests
 * are untouched, and no route becomes a department route without being told to.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('actor_type')
                ->constrained('departments')->nullOnDelete();
            // Set when the step names one person; null means "whoever holds the positions".
            $table->foreignId('approver_employee_id')->nullable()->after('department_id')
                ->constrained('employees')->nullOnDelete();
        });

        Schema::table('request_approvals', function (Blueprint $table) {
            $table->unsignedBigInteger('approver_department_id')->nullable()->after('approver_name');
            // The accepted position ids, frozen at submit time. Stored as JSON because it is
            // read as a whole and never joined against — the snapshot, not a relationship.
            $table->json('approver_position_ids')->nullable()->after('approver_department_id');
        });
    }

    public function down(): void
    {
        Schema::table('workflow_steps', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
            $table->dropConstrainedForeignId('approver_employee_id');
        });

        Schema::table('request_approvals', function (Blueprint $table) {
            $table->dropColumn(['approver_department_id', 'approver_position_ids']);
        });
    }
};
