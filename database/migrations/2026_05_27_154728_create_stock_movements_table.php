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
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['receive', 'issue', 'return', 'transfer']);
            $table->foreignId('stock_item_id')->constrained('stock_items')->cascadeOnDelete();
            $table->integer('qty');
            $table->string('from_label', 200)->nullable();
            $table->string('to_label', 200)->nullable();
            $table->string('reference', 100)->nullable();
            $table->string('recorded_by', 120)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->dateTime('moved_at');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
