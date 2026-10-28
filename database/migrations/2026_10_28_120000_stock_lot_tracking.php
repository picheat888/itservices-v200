<?php

// Stock lot tracking: lot numbers and warehouse, serial-to-lot link, request link on movements, and the lot ledger.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_lots', function (Blueprint $table) {
            $table->string('lot_no', 30)->nullable()->unique();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->restrictOnDelete();
            $table->index(['stock_item_id', 'warehouse_id']);
        });

        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->foreignId('stock_lot_id')->nullable()->constrained('stock_lots')->nullOnDelete();
        });

        // One ISS or RET number now spans several rows
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropUnique(['doc_no']);
            $table->index('doc_no');
            $table->foreignId('stock_request_id')->nullable()->constrained('stock_requests')->nullOnDelete();
        });

        Schema::create('stock_lot_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_lot_id')->constrained('stock_lots')->cascadeOnDelete();
            $table->foreignId('stock_movement_id')->nullable()->constrained('stock_movements')->nullOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignId('from_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->integer('qty');
            $table->string('reference', 100)->nullable();
            $table->dateTime('occurred_at');
            $table->timestamps();
            $table->index(['stock_lot_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_lot_entries');

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('stock_request_id');
            $table->dropIndex(['doc_no']);
            $table->unique('doc_no');
        });

        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->dropConstrainedForeignId('stock_lot_id');
        });

        Schema::table('stock_lots', function (Blueprint $table) {
            $table->dropIndex(['stock_item_id', 'warehouse_id']);
            $table->dropConstrainedForeignId('warehouse_id');
            $table->dropUnique(['lot_no']);
            $table->dropColumn('lot_no');
        });
    }
};
