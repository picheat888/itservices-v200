<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 8/17 — the IT help desk.
 *
 * The two SLA clocks are stored as due timestamps rather than recomputed on read,
 * so a change to the working-hours setting cannot silently move the target on
 * tickets already open. The *_alert_level columns record how far each clock has
 * been escalated, which is what stops the ten-minute sweep re-alerting the same
 * stage. A ticket points at an asset only when the case is about one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_no')->unique();
            $table->string('subject');
            $table->text('description');
            $table->string('category');
            $table->string('priority')->nullable();
            // What KIND of work this is, which is what picks the resolution clock: a
            // vendor repair runs on calendar time, standard work on business hours.
            $table->string('work_class', 32)->default('standard');
            $table->string('status')->default('open');
            $table->unsignedBigInteger('requester_id');
            $table->unsignedBigInteger('assignee_id')->nullable();
            $table->string('callback_phone')->nullable();
            $table->unsignedBigInteger('related_asset_id')->nullable();
            $table->text('take_note')->nullable();
            $table->text('resolution')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->dateTime('sla_response_due_at')->nullable();
            $table->dateTime('sla_resolve_due_at')->nullable();
            $table->string('sla_response_alert_level', 10)->nullable();
            $table->string('sla_resolve_alert_level', 10)->nullable();
            $table->timestamps();
            $table->index(['category'], 'tickets_category_idx');
            $table->index(['status'], 'tickets_status_idx');
            // restrictOnDelete: a ticket is the requester's history, not a row that belongs to
            // them. EmployeeService::deletionBlockers() already refuses this delete with a reason;
            // this is the net under it.
            $table->foreign('requester_id')->references('id')->on('employees')->restrictOnDelete();
            $table->foreign('assignee_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('related_asset_id')->references('id')->on('assets')->nullOnDelete();
        });

        Schema::create('ticket_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('ticket_id');
            $table->string('original_name');
            $table->string('path');
            $table->unsignedBigInteger('size');
            $table->string('mime', 100);
            $table->timestamps();
            $table->foreign('ticket_id')->references('id')->on('tickets')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_attachments');
        Schema::dropIfExists('tickets');
    }
};
