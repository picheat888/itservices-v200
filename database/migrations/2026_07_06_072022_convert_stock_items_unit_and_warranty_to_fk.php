<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert stock_items.unit → unit_id (FK → units) and
     * stock_items.warranty → warranty_type_id (FK → warranty_types).
     * Same recipe as Phase 1 (locations): create-missing → add nullable FK →
     * backfill by trimmed name → drop the old string column.
     */
    public function up(): void
    {
        // --- Units ---------------------------------------------------------
        // 1. Create any unit master rows missing for names already on stock_items.
        DB::table('stock_items')
            ->whereNotNull('unit')
            ->where('unit', '!=', '')
            ->distinct()
            ->pluck('unit')
            ->each(function (string $name) {
                DB::table('units')->updateOrInsert(['name' => trim($name)], []);
            });

        // 2. Add the nullable FK (block deleting a referenced unit at the DB layer too).
        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('unit_id')->nullable()->after('unit')->constrained('units')->restrictOnDelete();
        });

        // 3. Backfill the id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE stock_items SET unit_id = (SELECT id FROM units WHERE units.name = TRIM(stock_items.unit)) WHERE unit IS NOT NULL AND unit != ""');

        // 4. Drop the old name column.
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn('unit');
        });

        // --- Warranty types ------------------------------------------------
        DB::table('stock_items')
            ->whereNotNull('warranty')
            ->where('warranty', '!=', '')
            ->distinct()
            ->pluck('warranty')
            ->each(function (string $name) {
                DB::table('warranty_types')->updateOrInsert(['name' => trim($name)], []);
            });

        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('warranty_type_id')->nullable()->after('warranty')->constrained('warranty_types')->restrictOnDelete();
        });

        DB::statement('UPDATE stock_items SET warranty_type_id = (SELECT id FROM warranty_types WHERE warranty_types.name = TRIM(stock_items.warranty)) WHERE warranty IS NOT NULL AND warranty != ""');

        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn('warranty');
        });
    }

    /**
     * Re-add the string columns and best-effort backfill their names from the relations.
     */
    public function down(): void
    {
        // Units: re-add the string column (NOT NULL default 'unit', as before) and backfill from the relation.
        Schema::table('stock_items', function (Blueprint $table) {
            $table->string('unit', 40)->default('unit')->after('model');
        });
        DB::statement('UPDATE stock_items SET unit = COALESCE((SELECT name FROM units WHERE units.id = stock_items.unit_id), \'unit\')');
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('unit_id');
        });

        // Warranty: re-add the nullable string column and backfill from the relation.
        Schema::table('stock_items', function (Blueprint $table) {
            $table->string('warranty', 120)->nullable()->after('max_stock');
        });
        DB::statement('UPDATE stock_items SET warranty = (SELECT name FROM warranty_types WHERE warranty_types.id = stock_items.warranty_type_id) WHERE warranty_type_id IS NOT NULL');
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warranty_type_id');
        });
    }
};
