<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill a join date for legacy/demo employees that have none, so the
     * (now required) Start date field is populated. Spread by id order to give
     * realistic, varied tenures — mirrors the OrgSeeder formula.
     */
    public function up(): void
    {
        $ids = DB::table('employees')->whereNull('joined_at')->orderBy('id')->pluck('id');
        foreach ($ids as $i => $id) {
            DB::table('employees')->where('id', $id)->update([
                'joined_at' => date('Y-m-d', strtotime('2016-01-01 +'.($i * 2).' months')),
            ]);
        }
    }

    public function down(): void
    {
        // no-op (cannot tell which dates were backfilled vs. real)
    }
};
