<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('stock_items', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 60)->unique();
            $table->string('name', 200);
            $table->string('serial', 120)->nullable();
            $table->string('category', 120)->nullable();
            $table->string('brand', 120)->nullable();
            $table->string('model', 120)->nullable();
            $table->string('unit', 40)->default('unit');
            $table->decimal('cost', 12, 2)->default(0);
            $table->integer('current_stock')->default(0);
            $table->integer('min_stock')->default(0);
            $table->integer('max_stock')->default(0);
            $table->string('warehouse', 120)->nullable();
            $table->string('supplier', 200)->nullable();
            $table->string('warranty', 120)->nullable();
            $table->date('last_move_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_items');
    }
};
