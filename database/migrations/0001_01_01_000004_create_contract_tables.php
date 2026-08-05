<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 5/11 — contracts and rentals, their attachments, and the two ledgers
 * that keep expiry alerts from repeating themselves:
 *
 *  contract_alert_logs — one row per reminder threshold already emailed
 *                        (threshold 0 is the sentinel for "it has expired").
 *  contract_bell_logs  — one row per (contract, calendar day) the bell fired.
 *
 * Both are unique on their pair, so a re-run of the daily sweep is a no-op.
 * Assets reference contracts, so this file has to come before the asset one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->unsignedBigInteger('vendor_id')->nullable();
            $table->string('name');
            $table->string('details')->nullable();
            $table->string('type')->default('software');
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('value', 15, 2)->default(0.00);
            $table->decimal('total_value', 15, 2)->nullable();
            $table->string('billing_cycle')->default('yearly');
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('expired_at')->nullable();
            $table->text('cancel_reason')->nullable();
            // Per-contract reminder opt-in: a contract with every flag off never alerts.
            $table->boolean('notify_150')->default(false);
            $table->boolean('notify_120')->default(false);
            $table->boolean('notify_90')->default(false);
            $table->boolean('notify_60')->default(true);
            $table->boolean('notify_45')->default(false);
            $table->boolean('notify_30')->default(true);
            $table->boolean('notify_7')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->foreign('vendor_id')->references('id')->on('vendors')->restrictOnDelete();
        });

        Schema::create('contract_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->string('original_name');
            $table->string('path');
            $table->unsignedBigInteger('size');
            $table->string('mime', 100);
            $table->timestamps();
            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
        });

        Schema::create('contract_alert_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedSmallInteger('threshold');
            $table->timestamp('alerted_at');
            $table->unique(['contract_id', 'threshold']);
            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
        });

        Schema::create('contract_bell_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->date('bell_date');
            $table->unique(['contract_id', 'bell_date']);
            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_bell_logs');
        Schema::dropIfExists('contract_alert_logs');
        Schema::dropIfExists('contract_attachments');
        Schema::dropIfExists('contracts');
    }
};
