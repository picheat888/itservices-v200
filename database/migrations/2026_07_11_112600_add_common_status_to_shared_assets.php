<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The shared / common-use state used to be stored as `deployed` with no employee owner.
 * It now has its own AssetStatus value, `common`, so it can be filtered, coloured and
 * bulk-recalled distinctly. Re-tag existing shared-deployed assets accordingly.
 * (`status` is a plain string column, so no schema change is needed.)
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('assets')
            ->where('status', 'deployed')
            ->whereNull('owner_employee_id')
            ->update(['status' => 'common']);
    }

    public function down(): void
    {
        DB::table('assets')
            ->where('status', 'common')
            ->update(['status' => 'deployed']);
    }
};
