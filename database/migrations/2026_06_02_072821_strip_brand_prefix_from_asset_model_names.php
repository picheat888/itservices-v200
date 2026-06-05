<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * One-time data cleanup: legacy/demo model names were stored with the brand
     * prefixed ("Dell Latitude 5540") even though the brand is its own column
     * (brand_id). Strip the leading "<brand> " so the stored name is the bare
     * model. Idempotent, and skips any row whose cleaned name already exists.
     */
    public function up(): void
    {
        $rows = DB::table('asset_models')
            ->join('brands', 'brands.id', '=', 'asset_models.brand_id')
            ->select('asset_models.id', 'asset_models.name', 'brands.name as brand')
            ->get();

        foreach ($rows as $row) {
            $prefix = $row->brand.' ';
            if (! str_starts_with($row->name, $prefix)) {
                continue;
            }

            $clean = substr($row->name, strlen($prefix));

            // Guard: don't create a duplicate name (no unique index, but keep it tidy).
            $exists = DB::table('asset_models')
                ->where('name', $clean)
                ->where('id', '!=', $row->id)
                ->exists();

            if ($clean !== '' && ! $exists) {
                DB::table('asset_models')->where('id', $row->id)->update(['name' => $clean]);
            }
        }
    }

    /**
     * Not reversible — the original brand prefix is not recorded. No-op so the
     * migration can still be rolled back cleanly without throwing.
     */
    public function down(): void
    {
        // Intentionally empty: cleaned names are kept on rollback.
    }
};
