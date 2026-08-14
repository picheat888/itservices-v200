<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keeps the message that was actually sent, so the delivery log can show it.
 *
 * Only the rendered body is stored — the paragraphs with their variables already filled in,
 * which is the part that differs from one send to the next. The branded frame around it
 * (header, button, footer) is identical on every email and roughly thirty times the size of
 * the message itself, so it is re-applied from the same Blade layout when somebody opens a
 * log entry rather than being copied into every row.
 *
 * Rows written before this migration keep a null body; the screen says so rather than
 * showing an empty frame.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_logs', function (Blueprint $table) {
            $table->text('body_html')->nullable()->after('subject');
        });
    }

    public function down(): void
    {
        Schema::table('email_logs', function (Blueprint $table) {
            $table->dropColumn('body_html');
        });
    }
};
