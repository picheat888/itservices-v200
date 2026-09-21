<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 11/17 — admin-managed configuration, none of which belongs in .env.
 *
 *  app_settings    — loose key/value for branding, company details, SLA and
 *                    asset options edited in Settings.
 *  mail_settings   — the SMTP credentials (singleton row id=1, password encrypted
 *                    at rest). Every send overrides config('mail.*') from here;
 *                    .env is only the fallback when this is left unconfigured.
 *  email_templates — one editable template per event key, with an enabled flag and
 *                    a cadence, plus last_sent_at for the Notifications screen.
 *  email_logs      — one row per delivery attempt, keeping the SMTP error verbatim
 *                    when it fails.
 *
 * No foreign keys here on purpose: settings must survive whatever they describe.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        Schema::create('mail_settings', function (Blueprint $table) {
            $table->id();
            $table->string('host')->nullable();
            $table->unsignedInteger('port')->nullable();
            $table->string('username')->nullable();
            $table->text('password')->nullable();
            $table->string('encryption', 10)->nullable();
            $table->string('from_address')->nullable();
            $table->string('from_name')->nullable();
            $table->timestamps();
        });

        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->string('subject');
            $table->text('body_html');
            $table->boolean('enabled')->default(true);
            $table->string('cadence', 16)->default('realtime');
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });

        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->string('template_key')->nullable();
            // Nullable because a SKIPPED send is logged too, and the whole point of
            // those rows is that there was no address to send to.
            $table->string('to_email')->nullable();
            $table->string('recipient_name')->nullable();
            $table->string('subject');
            // What actually went out, kept so a log entry can be reopened and read
            // rather than only reporting that something was sent.
            $table->text('body_html')->nullable();
            $table->string('status', 10)->default('sent');
            $table->text('error')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('email_templates');
        Schema::dropIfExists('mail_settings');
        Schema::dropIfExists('app_settings');
    }
};
