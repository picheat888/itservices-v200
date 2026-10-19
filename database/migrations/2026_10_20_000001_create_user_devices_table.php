<?php

// One row per browser sign-in: what the per-account device limit counts, and what the profile Devices tab lists.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session_id')->nullable()->index();
            $table->char('remember_token_hash', 64)->nullable()->unique();
            $table->timestamp('remember_expires_at')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('location', 120)->nullable();
            $table->string('os', 20);
            $table->string('browser', 20);
            $table->string('user_agent', 300)->nullable();
            $table->timestamp('signed_in_at');
            $table->timestamp('last_active_at');
            $table->timestamp('ended_at')->nullable();
            $table->string('end_reason', 30)->nullable();
            $table->json('ended_by')->nullable();

            $table->index(['user_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_devices');
    }
};
