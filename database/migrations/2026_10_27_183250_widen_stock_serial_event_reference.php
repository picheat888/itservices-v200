<?php

// Serial events keep the movement's full reference (up to 100 characters, like stock_movements.reference).

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_item_serial_events', function (Blueprint $table) {
            $table->string('reference', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_item_serial_events', function (Blueprint $table) {
            $table->string('reference', 60)->nullable()->change();
        });
    }
};
