<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 18/18 — the Report Center.
 *
 * report_pins: the reports a person pinned to the top of the Report Center.
 *
 * report_exports: files built on the queue ("ไฟล์ส่งออกของฉัน"). A row is created when someone
 * asks for a file (queued), the GenerateReportExport job builds it (running → ready | failed), and
 * reports:prune-exports removes the file and the row once `expires_at` passes (7 days).
 * `filters` / `columns` are the validated request, so a retry builds the same file. The file lives
 * on the private `local` disk under file_path.
 *
 * report_schedules: reports sent by email on a schedule — which report, the file format, the
 * screen's filters (date filters are replaced by the rolling period when it runs — see
 * App\Models\Report\ReportSchedule), how often and at what hour, and who receives it (any email
 * addresses). reports:send-scheduled picks up rows whose `next_run_at` has passed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_pins', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('report_key', 64);
            $table->timestamps();
            $table->unique(['user_id', 'report_key']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('report_exports', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('report_key', 64);
            $table->string('format', 8);
            $table->json('filters')->nullable();
            $table->json('columns')->nullable();
            $table->string('status', 16)->default('queued');
            $table->string('file_name')->nullable();
            $table->string('file_path')->nullable();
            $table->unsignedInteger('rows_count')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('error', 64)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
            $table->index('expires_at');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('report_schedules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('report_key', 64);
            $table->string('format', 8);
            $table->json('filters')->nullable();
            $table->json('columns')->nullable();
            $table->string('frequency', 16);
            $table->unsignedTinyInteger('send_hour')->default(7);
            $table->json('recipients');
            $table->boolean('active')->default(true);
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_status', 16)->nullable();
            $table->string('last_error', 64)->nullable();
            $table->timestamps();
            $table->index(['active', 'next_run_at']);
            $table->index('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_schedules');
        Schema::dropIfExists('report_exports');
        Schema::dropIfExists('report_pins');
    }
};
