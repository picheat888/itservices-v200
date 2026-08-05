<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 7/11 — the spare-parts store.
 *
 * stock_movements is the ledger every other table here answers to: lots carry the
 * FIFO cost layers it created, balances the per-warehouse totals it moved, and
 * serials the individual units it brought in or issued out. stock_items keeps a
 * denormalised current_stock for list screens; the movements remain the truth.
 *
 * stock_alert_logs is one row per (item, alert type) so the daily low/out/over
 * sweep alerts once per state rather than every run.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_items', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 60)->unique();
            $table->string('name', 200);
            $table->string('serial', 120)->nullable();
            $table->boolean('track_serial')->default(false);
            $table->unsignedBigInteger('category_id')->nullable();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->unsignedBigInteger('model_id')->nullable();
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->decimal('cost', 12, 2)->default(0.00);
            $table->integer('current_stock')->default(0);
            $table->integer('min_stock')->default(0);
            $table->integer('max_stock')->default(0);
            $table->unsignedBigInteger('warranty_type_id')->nullable();
            $table->date('last_move_at')->nullable();
            $table->timestamps();
            $table->foreign('category_id')->references('id')->on('categories')->restrictOnDelete();
            $table->foreign('brand_id')->references('id')->on('brands')->restrictOnDelete();
            $table->foreign('model_id')->references('id')->on('asset_models')->restrictOnDelete();
            $table->foreign('unit_id')->references('id')->on('units')->restrictOnDelete();
            $table->foreign('warranty_type_id')->references('id')->on('warranty_types')->restrictOnDelete();
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->string('doc_no', 30)->nullable()->unique();
            $table->enum('type', ['receive', 'issue', 'return', 'transfer', 'adjust_up', 'adjust_down']);
            $table->unsignedBigInteger('stock_item_id');
            $table->integer('qty');
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->string('from_label', 200)->nullable();
            $table->string('to_label', 200)->nullable();
            $table->string('reference', 100)->nullable();
            $table->string('recorded_by', 120)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('moved_at');
            $table->timestamps();
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('stock_lots', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_item_id');
            $table->unsignedBigInteger('stock_movement_id')->nullable();
            $table->decimal('unit_cost', 12, 2)->default(0.00);
            $table->integer('qty_received');
            $table->integer('qty_remaining');
            $table->dateTime('received_at');
            $table->timestamps();
            // FIFO consumption order: oldest received first, id breaking same-instant ties.
            $table->index(['stock_item_id', 'received_at', 'id']);
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('stock_movement_id')->references('id')->on('stock_movements')->nullOnDelete();
        });

        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_item_id');
            $table->unsignedBigInteger('warehouse_id')->nullable();
            $table->integer('qty')->default(0);
            $table->timestamps();
            $table->index('stock_item_id');
            $table->unique(['stock_item_id', 'warehouse_id']);
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->restrictOnDelete();
        });

        Schema::create('stock_item_serials', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_item_id');
            $table->unsignedBigInteger('stock_movement_id')->nullable();
            $table->string('serial', 120)->unique();
            $table->string('status', 20)->default('in_stock');
            $table->unsignedBigInteger('warehouse_id')->nullable();
            $table->string('reference', 100)->nullable();
            $table->dateTime('received_at')->nullable();
            $table->timestamps();
            $table->index(['stock_item_id', 'status']);
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->restrictOnDelete();
            $table->foreign('stock_movement_id')->references('id')->on('stock_movements')->nullOnDelete();
        });

        Schema::create('stock_item_serial_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_item_serial_id');
            $table->unsignedBigInteger('stock_item_id');
            $table->string('event', 20);
            $table->unsignedBigInteger('stock_movement_id')->nullable();
            $table->string('reference', 60)->nullable();
            $table->string('warehouse', 120)->nullable();
            $table->string('from_label', 120)->nullable();
            $table->string('to_label', 120)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('recorded_by', 120)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['stock_item_id', 'occurred_at']);
            $table->foreign('stock_item_serial_id')->references('id')->on('stock_item_serials')->cascadeOnDelete();
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('stock_movement_id')->references('id')->on('stock_movements')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('stock_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 30)->nullable()->unique();
            $table->unsignedBigInteger('stock_item_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('requester_name', 160);
            $table->integer('qty');
            $table->text('reason');
            $table->enum('status', ['pending', 'approved', 'fulfilled', 'rejected'])->default('pending');
            $table->string('approver_name', 160)->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('fulfilled_at')->nullable();
            $table->dateTime('rejected_at')->nullable();
            $table->timestamps();
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('stock_counts', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->string('warehouse')->nullable();
            $table->string('category')->nullable();
            $table->string('status')->default('draft');
            $table->string('adjust_mode')->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('counted_by')->nullable();
            $table->timestamp('committed_at')->nullable();
            $table->timestamps();
            $table->foreign('counted_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('stock_count_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_count_id');
            $table->unsignedBigInteger('stock_item_id');
            $table->integer('system_qty');
            $table->integer('counted_qty')->nullable();
            $table->timestamps();
            $table->foreign('stock_count_id')->references('id')->on('stock_counts')->cascadeOnDelete();
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
        });

        Schema::create('stock_alert_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_item_id');
            $table->string('alert_type', 16);
            $table->date('last_alerted_on');
            $table->timestamps();
            $table->unique(['stock_item_id', 'alert_type']);
            $table->foreign('stock_item_id')->references('id')->on('stock_items')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_alert_logs');
        Schema::dropIfExists('stock_count_lines');
        Schema::dropIfExists('stock_counts');
        Schema::dropIfExists('stock_requests');
        Schema::dropIfExists('stock_item_serial_events');
        Schema::dropIfExists('stock_item_serials');
        Schema::dropIfExists('stock_balances');
        Schema::dropIfExists('stock_lots');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_items');
    }
};
