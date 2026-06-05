<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop the SKU-level warehouse/supplier columns. Both were only convenience
     * defaults: warehouse presence is now read from per-warehouse balances, and
     * supplier is captured per-receive as the movement's from_label.
     */
    public function up(): void
    {
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn(['warehouse', 'supplier']);
        });
    }

    /**
     * Recreate the columns so the change is reversible (values are not restored).
     */
    public function down(): void
    {
        Schema::table('stock_items', function (Blueprint $table) {
            $table->string('warehouse', 120)->nullable();
            $table->string('supplier', 200)->nullable();
        });
    }
};
