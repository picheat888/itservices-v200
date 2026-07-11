<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rename the asset's business identifier column from `asset_id` to `asset_code`
     * — clearer, and avoids confusion with the primary key `id` and with the
     * `asset_id` foreign keys on other tables (asset_transfers, tickets).
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('asset_id', 'asset_code');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('asset_code', 'asset_id');
        });
    }
};
