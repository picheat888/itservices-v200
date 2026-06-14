<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Re-code positions to the standard PST-#### format (4 digits),
        // numbered by the existing code order (which follows level). The
        // `code` column already exists and is unique; only values change.
        $n = 0;
        foreach (DB::table('positions')->orderBy('code')->pluck('id') as $id) {
            $n++;
            DB::table('positions')->where('id', $id)->update([
                'code' => 'PST-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        // Best-effort revert to the legacy P-## scheme (numbered by id).
        foreach (DB::table('positions')->orderBy('id')->pluck('id') as $i => $id) {
            DB::table('positions')->where('id', $id)->update([
                'code' => 'P-'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
            ]);
        }
    }
};
