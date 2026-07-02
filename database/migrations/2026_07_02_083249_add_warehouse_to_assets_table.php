<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the warehouse a stored/idle asset is kept in. Holds the warehouse *name*
     * (matching the Stock module's string convention — not a FK), chosen from the
     * `warehouses` master. Nullable: an asset need not be assigned to a warehouse.
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('warehouse', 120)->nullable()->after('location');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('warehouse');
        });
    }
};
