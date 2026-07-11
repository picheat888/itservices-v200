<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A rented asset's lease term is read live from its linked contract, so the
     * asset no longer stores lease_start / lease_end of its own. Drop the now-dead
     * columns (null for every row). The value / vendor_id columns are kept — a
     * purchased asset still records its own price and supplier there.
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn(['lease_start', 'lease_end']);
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->date('lease_start')->nullable()->after('contract_id');
            $table->date('lease_end')->nullable()->after('lease_start');
        });
    }
};
