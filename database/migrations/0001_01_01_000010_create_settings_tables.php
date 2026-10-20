<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 11/18 — admin-managed configuration that does not belong in .env: app settings,
 * SMTP (mail_settings row id=1), email templates, the delivery log and named networks.
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
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // One row per delivery attempt, skipped sends included (hence the nullable address)
        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->string('template_key')->nullable();
            $table->string('to_email')->nullable();
            $table->string('recipient_name')->nullable();
            $table->string('subject');
            $table->mediumText('body_html')->nullable();
            // null = not recorded; [] = no button; {url, label} = the button sent
            $table->json('action')->nullable();
            $table->string('status', 10)->default('sent');
            $table->boolean('is_test')->default(false);
            $table->text('error')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['status', 'created_at']);
            // Nightly prune (logs:prune) filters on created_at alone
            $table->index('created_at', 'email_logs_created_at_index');
        });

        // Admin-named CIDR ranges shown as a sign-in's location instead of a geo lookup
        Schema::create('network_names', function (Blueprint $table) {
            $table->id();
            $table->string('cidr', 64)->unique();
            $table->string('name', 100);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('network_names');
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('email_templates');
        Schema::dropIfExists('mail_settings');
        Schema::dropIfExists('app_settings');
    }
};
