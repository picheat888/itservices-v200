<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per outgoing email attempt. Powers the "Sent today" and
     * "Delivery rate" stats on the Email Notifications page.
     */
    public function up(): void
    {
        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->string('template_key')->nullable();
            $table->string('to_email');
            $table->string('subject');
            $table->string('status', 10)->default('sent'); // sent | failed
            $table->text('error')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
    }
};
