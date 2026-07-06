<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Create any location master rows missing for names already on assets.
        DB::table('assets')
            ->whereNotNull('location')
            ->where('location', '!=', '')
            ->distinct()
            ->pluck('location')
            ->each(function (string $name) {
                DB::table('locations')->updateOrInsert(['name' => trim($name)], []);
            });

        // 2. Add the FK column (nullable; block deleting a referenced location at the DB layer too).
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('location_id')->nullable()->after('location')->constrained('locations')->restrictOnDelete();
        });

        // 3. Backfill the id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET location_id = (SELECT id FROM locations WHERE locations.name = TRIM(assets.location)) WHERE location IS NOT NULL AND location != ""');

        // 4. Drop the old name column.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('location');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('location')->nullable()->after('serial');
        });
        DB::statement('UPDATE assets SET location = (SELECT name FROM locations WHERE locations.id = assets.location_id) WHERE location_id IS NOT NULL');
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('location_id');
        });
    }
};
