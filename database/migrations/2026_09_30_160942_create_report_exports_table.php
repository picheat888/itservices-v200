<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Report exports built on the queue ("ไฟล์ Export ของฉัน" on the Report Center).
 *
 * A row is created when someone asks for a file (queued), the GenerateReportExport job builds
 * it (running → ready | failed), and reports:prune-exports removes the file and the row once
 * `expires_at` passes (7 days). `filters` / `columns` are the validated request, so a retry
 * builds the same file. The file lives on the private `local` disk under file_path.
 */
return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('report_exports');
    }
};
