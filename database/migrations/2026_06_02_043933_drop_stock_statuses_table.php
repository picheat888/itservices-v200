<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop the unused stock_statuses master-data table. Nothing referenced it
     * (no FK, no column on stock_items/movements/serials) — stock health status
     * is derived in code, so this lookup carried no data of value.
     */
    public function up(): void
    {
        Schema::dropIfExists('stock_statuses');
    }

    /**
     * Recreate the table schema so the drop is reversible (data is not restored;
     * defaults can be re-seeded if ever needed).
     */
    public function down(): void
    {
        Schema::create('stock_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description', 255)->nullable();
            $table->timestamps();
        });
    }
};
