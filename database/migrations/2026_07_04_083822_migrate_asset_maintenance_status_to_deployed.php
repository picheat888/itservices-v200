<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The Maintenance asset status has been removed system-wide. Existing assets
     * parked in maintenance were previously toggled there from Deployed, so move
     * them back to Deployed.
     */
    public function up(): void
    {
        DB::table('assets')->where('status', 'maintenance')->update(['status' => 'deployed']);
    }

    /**
     * Not reversible: the original maintenance rows cannot be distinguished after
     * the fact. Down is intentionally a no-op.
     */
    public function down(): void
    {
        //
    }
};
