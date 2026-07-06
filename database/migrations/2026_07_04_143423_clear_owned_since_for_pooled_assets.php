<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A pooled asset (no owner) has no holder, so it should carry no possession date.
     * Clear any stale owned_since left on unowned assets by the earlier receive logic.
     */
    public function up(): void
    {
        DB::table('assets')->whereNull('owner')->whereNotNull('owned_since')->update(['owned_since' => null]);
    }

    public function down(): void
    {
        // Not reversible — the original possession dates are not recoverable.
    }
};
