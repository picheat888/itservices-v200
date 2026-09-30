<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reports sent by email on a schedule (Report Center Phase 6).
 *
 * One row per schedule somebody set from a report page: which report, the file format, the
 * screen's filters (date filters are replaced by the rolling period when it runs — see
 * App\Models\Report\ReportSchedule), how often and at what hour, and who receives it (any
 * email addresses). reports:send-scheduled picks up rows whose `next_run_at` has passed.
 */
return new class extends Migration
{
    public function up(): void
    {
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
    }
};
