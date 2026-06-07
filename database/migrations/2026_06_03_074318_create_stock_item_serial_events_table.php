<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_item_serial_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_serial_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('event', 20); // received|issued|adjusted|transferred|returned
            $table->foreignId('stock_movement_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference', 60)->nullable();
            $table->string('warehouse', 120)->nullable();
            $table->string('from_label', 120)->nullable();
            $table->string('to_label', 120)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('recorded_by', 120)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['stock_item_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_item_serial_events');
    }
};
