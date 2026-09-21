<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The editable half of an in-app notification.
 *
 * Only what an administrator can change lives here: the one-line message, in each
 * language, and whether the notification fires at all. Everything descriptive — what triggers
 * it, who receives it, which module it belongs to — stays in App\Support\NotificationCatalogue,
 * so rewording a description or adding a new bell never needs a migration.
 *
 * `key` is the SPA's own message key (notif_asset_assigned, …), which is already the
 * exact granularity of one distinct message: the front end resolves a notification to
 * one of these keys today, so an override slots in without touching that logic.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_templates', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            // Both languages, because a notification is read in the reader's own language —
            // unlike an email template, which is one English body for everybody.
            $table->text('message_en');
            $table->text('message_th');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_templates');
    }
};
