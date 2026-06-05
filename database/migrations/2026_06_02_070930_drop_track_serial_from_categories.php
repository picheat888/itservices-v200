<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop the category-level "serialized" flag. It was only a default suggestion
     * when creating a SKU; the real flag lives on stock_items.track_serial, which
     * is untouched. New SKUs now start with serial-tracking off.
     */
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('track_serial');
        });
    }

    /**
     * Recreate the column so the change is reversible (values are not restored).
     */
    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->boolean('track_serial')->default(false)->after('description');
        });
    }
};
