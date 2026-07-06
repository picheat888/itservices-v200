<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A pooled asset now has no owner (null) — the same as a freshly registered one —
     * with the warehouse recording where it sits. Clear the legacy "Pool — IT" owner
     * placeholder left on assets received back before this change.
     */
    public function up(): void
    {
        DB::table('assets')->where('owner', 'Pool — IT')->update(['owner' => null]);
    }

    public function down(): void
    {
        // Not reversible: the original placeholder cannot be told apart from other null owners.
    }
};
