<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-unit serial registry for serialized stock items. One row per physical
     * unit, captured when goods are received. The unique index on `serial`
     * enforces system-wide de-duplication (case-insensitive via the column's
     * default collation).
     */
    public function up(): void
    {
        Schema::create('stock_item_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_movement_id')->nullable()->constrained()->nullOnDelete();
            $table->string('serial', 120);
            // in_stock | issued | returned | retired
            $table->string('status', 20)->default('in_stock');
            $table->string('warehouse', 120)->nullable();
            $table->string('reference', 100)->nullable();
            $table->dateTime('received_at')->nullable();
            $table->timestamps();

            $table->unique('serial');
            $table->index(['stock_item_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_item_serials');
    }
};
