<?php

// Append-only sign-in history (signed in, failed, locked, signed out, forced out) behind the Login log tabs.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('login_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('login_name')->nullable();
            $table->string('event', 20);
            $table->string('reason', 30)->nullable();
            $table->boolean('remembered')->default(false);
            $table->foreignId('device_id')->nullable()->constrained('user_devices')->nullOnDelete();
            $table->string('ip', 45)->nullable();
            $table->string('location', 120)->nullable();
            $table->string('os', 20)->nullable();
            $table->string('browser', 20)->nullable();
            $table->timestamp('created_at')->index();

            $table->index(['user_id', 'created_at']);
            $table->index(['event', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_events');
    }
};
