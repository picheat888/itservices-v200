<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The resolved, frozen approval chain of one service request — created at
 * submit from the workflow definition. The row with status=current is the
 * pointer to the step being waited on. approver_employee_id is null for
 * it_staff queue rows (anyone holding requests.fulfill acts on them).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('request_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_request_id')->constrained('service_requests')->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->string('actor_type', 20); // chain | owner | it_staff
            $table->string('kind', 20); // approval | fulfillment
            $table->string('label', 160); // merged display, e.g. "Manager · Vice President"
            $table->decimal('sla_days', 5, 2)->nullable();
            $table->foreignId('approver_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('approver_name', 160)->nullable();
            $table->string('status', 20)->default('waiting'); // waiting | current | approved | rejected | skipped
            $table->text('note')->nullable(); // decision remark, or the skip reason
            $table->foreignId('acted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('acted_by_name', 160)->nullable();
            $table->dateTime('became_current_at')->nullable();
            $table->dateTime('due_at')->nullable();
            $table->dateTime('acted_at')->nullable();
            $table->timestamps();
            $table->unique(['service_request_id', 'position']);
            $table->index(['approver_employee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_approvals');
    }
};
