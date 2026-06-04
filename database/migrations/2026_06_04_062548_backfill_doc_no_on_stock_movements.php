<?php

use App\Models\StockMovement;
use App\Support\DocNumber;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Backfill running document numbers (RCV/ISS/RET/TRF/ADJ-YEAR-NNN) onto historical
     * movements created before doc_no existed (seeded demo data). Each null movement gets
     * the next sequence for its prefix+year, continuing AFTER the current max so it never
     * collides with numbers the app has already issued. Numbers are assigned in
     * chronological (moved_at) order within each prefix+year.
     */
    public function up(): void
    {
        StockMovement::query()
            ->whereNull('doc_no')
            ->orderBy('moved_at')
            ->orderBy('id')
            ->get()
            ->each(function (StockMovement $movement): void {
                $year = ($movement->moved_at ?? $movement->created_at)?->year ?? (int) date('Y');
                // DocNumber::next reads the current max for the prefix+year, so calling it
                // per row yields a fresh, non-colliding sequence each time.
                $movement->doc_no = DocNumber::next($movement->type, (int) $year);
                $movement->save();
            });
    }

    /**
     * Irreversible data backfill — there is no reliable way to tell a backfilled number
     * from one the app issued, so down() is intentionally a no-op.
     */
    public function down(): void
    {
        //
    }
};
