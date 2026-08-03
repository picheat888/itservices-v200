<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * IT service requests (Request module). Reference prefix RQ- (REQ- belongs to
 * stock requests). requester/department names and auto_ticket are snapshots
 * taken at submit — a request is a historical document that must not change
 * when employees move or the workflow is edited later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 30)->nullable()->unique();
            $table->string('type', 30)->index();
            $table->foreignId('workflow_id')->nullable()->constrained('workflows')->nullOnDelete();
            $table->boolean('auto_ticket')->default(false);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('requester_name', 160);
            $table->string('department_name', 160)->nullable();
            $table->string('title', 200);
            $table->text('reason');
            $table->string('priority', 10)->default('medium');
            $table->string('estimated_value', 120)->nullable();
            $table->json('fields')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->foreignId('ticket_id')->nullable()->constrained('tickets')->nullOnDelete();
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('rejected_at')->nullable();
            $table->dateTime('fulfilled_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'type']);
            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_requests');
    }
};
