<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * FIFO cost lots. One row per receipt; `qty_remaining` is drawn down oldest
     * first as stock is issued. Stock value = Σ(qty_remaining × unit_cost).
     */
    public function up(): void
    {
        Schema::create('stock_lots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_movement_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('unit_cost', 12, 2)->default(0);
            $table->integer('qty_received');
            $table->integer('qty_remaining');
            $table->dateTime('received_at');
            $table->timestamps();

            // FIFO ordering + fast "open lots for this item" lookups.
            $table->index(['stock_item_id', 'received_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_lots');
    }
};
