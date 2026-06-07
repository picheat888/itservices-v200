<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Library of automated system emails. Each template is keyed by the event
     * that triggers it (e.g. ticket.created). Body holds {{variables}} that are
     * substituted at send time.
     *
     * The standard set of templates is seeded by EmailTemplateSeeder (from
     * App\Support\EmailTemplates), which is also the source the "Reset to
     * standard" action restores from — so seeding and resetting never drift.
     */
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();      // = trigger, e.g. "ticket.created"
            $table->string('name');
            $table->string('subject');
            $table->text('body_html');
            $table->boolean('enabled')->default(true);
            // 'realtime' (fired on an event) or 'daily' (fired by a scheduled sweep).
            $table->string('cadence', 16)->default('realtime');
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};
