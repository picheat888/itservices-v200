<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_alert_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('alert_type', 16); // out | low | over
            $table->date('last_alerted_on');
            $table->timestamps();
            $table->unique(['stock_item_id', 'alert_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_alert_logs');
    }
};
