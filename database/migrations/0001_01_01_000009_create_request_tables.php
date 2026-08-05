<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 10/11 — service requests and the approval engine.
 *
 * A workflow is the template (one per request type, ordered steps); when a request
 * is submitted the steps are copied into request_approvals as a snapshot, so
 * editing a workflow later never rewrites the trail of a request already in
 * flight. That snapshot is why the approval row carries its own label, sla_days
 * and resolved approver rather than reading them back through workflow_steps.
 *
 * service_requests keeps FKs to whatever the chosen type points at (a software, a
 * social platform, an email group, a file share, a managed choice) plus a `fields`
 * JSON blob for the rest of the form. request_option_id is RESTRICT on delete: a
 * choice a request asked for must not be deletable out from under it.
 *
 * This file comes last of the domain files because it references nearly all of them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflows', function (Blueprint $table) {
            $table->id();
            $table->string('request_type', 30)->unique();
            $table->string('name', 120);
            $table->boolean('active')->default(true);
            $table->boolean('auto_ticket')->default(false);
            $table->timestamps();
        });

        Schema::create('workflow_steps', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('workflow_id');
            $table->unsignedTinyInteger('position');
            $table->string('actor_type', 20);
            $table->string('label', 120);
            $table->string('kind', 20);
            $table->decimal('sla_days', 5, 2)->default(1.00);
            $table->timestamps();
            $table->unique(['workflow_id', 'position']);
            $table->foreign('workflow_id')->references('id')->on('workflows')->cascadeOnDelete();
        });

        Schema::create('request_options', function (Blueprint $table) {
            $table->id();
            $table->string('request_type', 30);
            $table->string('field_key', 40);
            $table->string('label_en', 120);
            $table->string('label_th', 120)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            // Retiring a choice is what this is for: it stops being offered while
            // every request that already chose it keeps its reference.
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->index(['request_type', 'field_key']);
            $table->unique(['request_type', 'field_key', 'label_en']);
        });

        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 30)->nullable()->unique();
            $table->string('type', 30);
            $table->unsignedBigInteger('workflow_id')->nullable();
            $table->boolean('auto_ticket')->default(false);
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('employee_id')->nullable();
            // Requester and department are snapshotted as text so an old request
            // still reads correctly after a transfer or a name change.
            $table->string('requester_name', 160);
            $table->string('department_name', 160)->nullable();
            $table->string('title', 200);
            $table->text('reason');
            $table->string('priority', 10)->default('medium');
            $table->string('estimated_value', 120)->nullable();
            $table->longText('fields')->nullable();
            $table->unsignedBigInteger('location_id')->nullable();
            $table->unsignedBigInteger('software_id')->nullable();
            $table->unsignedBigInteger('social_platform_id')->nullable();
            $table->unsignedBigInteger('email_group_id')->nullable();
            $table->unsignedBigInteger('file_share_id')->nullable();
            $table->unsignedBigInteger('request_option_id')->nullable();
            $table->string('status', 20)->default('pending');
            $table->unsignedBigInteger('ticket_id')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('rejected_at')->nullable();
            $table->dateTime('fulfilled_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->timestamps();
            $table->index('type');
            $table->index('status');
            $table->index(['status', 'type']);
            $table->index('employee_id');
            $table->foreign('workflow_id')->references('id')->on('workflows')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('employee_id')->references('id')->on('employees')->nullOnDelete();
            $table->foreign('location_id')->references('id')->on('locations')->nullOnDelete();
            $table->foreign('software_id')->references('id')->on('softwares')->nullOnDelete();
            $table->foreign('social_platform_id')->references('id')->on('social_platforms')->nullOnDelete();
            $table->foreign('email_group_id')->references('id')->on('email_groups')->nullOnDelete();
            $table->foreign('file_share_id')->references('id')->on('file_shares')->nullOnDelete();
            $table->foreign('request_option_id')->references('id')->on('request_options')->restrictOnDelete();
            $table->foreign('ticket_id')->references('id')->on('tickets')->nullOnDelete();
        });

        Schema::create('request_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_request_id');
            $table->unsignedTinyInteger('position');
            $table->string('actor_type', 20);
            $table->string('kind', 20);
            $table->string('label', 160);
            $table->decimal('sla_days', 5, 2)->nullable();
            $table->unsignedBigInteger('approver_employee_id')->nullable();
            $table->string('approver_name', 160)->nullable();
            $table->string('status', 20)->default('waiting');
            $table->text('note')->nullable();
            $table->unsignedBigInteger('acted_by_user_id')->nullable();
            $table->string('acted_by_name', 160)->nullable();
            $table->dateTime('became_current_at')->nullable();
            $table->dateTime('due_at')->nullable();
            $table->dateTime('acted_at')->nullable();
            $table->timestamps();
            // Drives "what is waiting on me": the approver's own pending rows.
            $table->index(['approver_employee_id', 'status']);
            $table->unique(['service_request_id', 'position']);
            $table->foreign('service_request_id')->references('id')->on('service_requests')->cascadeOnDelete();
            $table->foreign('approver_employee_id')->references('id')->on('employees')->nullOnDelete();
            $table->foreign('acted_by_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_approvals');
        Schema::dropIfExists('service_requests');
        Schema::dropIfExists('request_options');
        Schema::dropIfExists('workflow_steps');
        Schema::dropIfExists('workflows');
    }
};
