<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Returning a rented asset to its lessor, recorded as a fact of its own: returned_to_vendor_at /
 * returned_to_vendor_by (a users FK that goes null if the account is deleted). The asset still
 * leaves the register as a write-off (status writeoff, written_off_at/by) — everything that treats
 * a written-off asset as gone keeps working — but the return no longer depends on which reason
 * was picked from Settings → Assets, a list anyone with the right can rename or delete.
 *
 * Set by AssetService::returnToVendor (the "Return to lessor" action) and cleared, with the rest of
 * the write-off, when the write-off is cancelled (Asset::booted).
 *
 * The standard write-off reason "คืนผู้ให้เช่า" goes: the action replaces it, and a reason left
 * in the list would let a return be recorded as an ordinary write-off the reports cannot count.
 * Removed only while no asset uses it (none does on 2026-10-06).
 */
return new class extends Migration
{
    private const RETIRED_REASON = 'คืนผู้ให้เช่า';

    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->timestamp('returned_to_vendor_at')->nullable()->after('written_off_by');
            $table->foreignId('returned_to_vendor_by')->nullable()->after('returned_to_vendor_at')->constrained('users')->nullOnDelete();
        });

        DB::table('writeoff_reasons')
            ->where('name', self::RETIRED_REASON)
            ->whereNotExists(fn ($query) => $query->select(DB::raw(1))->from('assets')->whereColumn('assets.writeoff_reason_id', 'writeoff_reasons.id'))
            ->delete();
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('returned_to_vendor_by');
            $table->dropColumn('returned_to_vendor_at');
        });

        if (! DB::table('writeoff_reasons')->where('name', self::RETIRED_REASON)->exists()) {
            DB::table('writeoff_reasons')->insert([
                'name' => self::RETIRED_REASON,
                'description' => 'สิ้นสุดหรือยกเลิกสัญญาเช่า',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
};
