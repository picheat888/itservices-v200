<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Convert any leftover legacy "P-##" position codes to the standard
     * "PST-####" format in place. Numbered by the existing code descending
     * (highest level first → PST-0001), continuing past the highest PST code
     * already present so it can never collide with positions added via the UI.
     */
    public function up(): void
    {
        // Highest PST number already in use (0 when none) — start numbering after it.
        $maxPst = 0;
        foreach (DB::table('positions')->where('code', 'like', 'PST-%')->pluck('code') as $code) {
            $maxPst = max($maxPst, (int) substr($code, 4));
        }

        $legacyIds = DB::table('positions')->where('code', 'like', 'P-%')->orderByDesc('code')->pluck('id');
        $n = $maxPst;
        foreach ($legacyIds as $id) {
            $n++;
            DB::table('positions')->where('id', $id)->update([
                'code' => 'PST-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    /**
     * Irreversible data migration (the original P-## numbering is not recoverable).
     */
    public function down(): void
    {
        // no-op
    }
};
