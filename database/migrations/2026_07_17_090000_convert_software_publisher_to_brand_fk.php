<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert softwares.publisher (free-text) to brand_id (→ brands), so the
     * Software form's Brand/Publisher field reuses the same Master Data list
     * that Asset/Stock already pick brands from, instead of free-typed text.
     */
    public function up(): void
    {
        // 1. Create any brand master rows missing for publisher names already on softwares.
        DB::table('softwares')->whereNotNull('publisher')->where('publisher', '!=', '')
            ->distinct()->pluck('publisher')
            ->map(fn (string $name) => trim($name))
            ->unique()
            ->each(function (string $name) {
                DB::table('brands')->updateOrInsert(['name' => $name], []);
            });

        // 2. Add brand_id FK (block deleting a referenced brand at the DB layer too).
        Schema::table('softwares', function (Blueprint $table) {
            $table->foreignId('brand_id')->nullable()->after('publisher')->constrained('brands')->restrictOnDelete();
        });

        // 3. Backfill brand_id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE softwares SET brand_id = (SELECT id FROM brands WHERE brands.name = TRIM(softwares.publisher)) WHERE publisher IS NOT NULL AND publisher != ""');

        // 4. Drop the old name column.
        Schema::table('softwares', function (Blueprint $table) {
            $table->dropColumn('publisher');
        });
    }

    public function down(): void
    {
        Schema::table('softwares', function (Blueprint $table) {
            $table->string('publisher')->nullable()->after('name');
        });

        DB::statement('UPDATE softwares SET publisher = (SELECT name FROM brands WHERE brands.id = softwares.brand_id) WHERE brand_id IS NOT NULL');

        Schema::table('softwares', function (Blueprint $table) {
            $table->dropConstrainedForeignId('brand_id');
        });
    }
};
