<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Date the current holder took possession of the asset — set when an employee
     * accepts a hand-over (or when IT receives it back into the pool). Backfilled
     * from the most recent transfer for assets that already have a custody history.
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->date('owned_since')->nullable()->after('registered_date');
        });

        DB::statement('UPDATE assets SET owned_since = (SELECT MAX(DATE(created_at)) FROM asset_transfers WHERE asset_transfers.asset_id = assets.id)');
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('owned_since');
        });
    }
};
