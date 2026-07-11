<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Rented assets no longer snapshot fee / vendor / lease term — those are read
     * live from the linked contract (single source of truth). Clear the now-stale
     * snapshot columns on every existing rented asset so nothing lingers out of sync.
     */
    public function up(): void
    {
        DB::table('assets')->where('source', 'rented')->update([
            'value' => 0,
            'vendor_id' => null,
            'lease_start' => null,
            'lease_end' => null,
        ]);
    }

    /**
     * Re-populate the snapshot from each asset's linked contract (the reverse of
     * reading it live). Assets with no contract are left cleared.
     */
    public function down(): void
    {
        $rented = DB::table('assets')->where('source', 'rented')->whereNotNull('contract_id')->get();

        foreach ($rented as $asset) {
            $contract = DB::table('contracts')->find($asset->contract_id);

            if ($contract) {
                DB::table('assets')->where('id', $asset->id)->update([
                    'value' => $contract->value,
                    'vendor_id' => $contract->vendor_id,
                    'lease_start' => $contract->start_date,
                    'lease_end' => $contract->end_date,
                ]);
            }
        }
    }
};
