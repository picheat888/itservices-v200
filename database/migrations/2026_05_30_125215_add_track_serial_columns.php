<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the "serialized" flag to stock items and categories. When true, every
     * unit must carry an individual serial captured at receiving time. The
     * category flag acts as the default suggestion when creating a new SKU.
     */
    public function up(): void
    {
        Schema::table('stock_items', function (Blueprint $table) {
            $table->boolean('track_serial')->default(false)->after('serial');
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->boolean('track_serial')->default(false)->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn('track_serial');
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('track_serial');
        });
    }
};
