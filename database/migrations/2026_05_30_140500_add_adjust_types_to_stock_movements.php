<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Allow the two stock-count adjustment movement types. The original column was
     * an enum limited to the four manual types, which rejected adjust_up/adjust_down.
     */
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->enum('type', ['receive', 'issue', 'return', 'transfer', 'adjust_up', 'adjust_down'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->enum('type', ['receive', 'issue', 'return', 'transfer'])->change();
        });
    }
};
