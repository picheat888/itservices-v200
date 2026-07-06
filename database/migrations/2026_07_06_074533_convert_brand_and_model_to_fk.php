<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert brand/model name strings on assets + stock_items to FK ids:
     * brand → brand_id (→ brands), model → model_id (→ asset_models).
     * asset_models are brand-scoped, and model names are NOT globally unique,
     * so models are created and backfilled per (name, brand_id) pair.
     */
    public function up(): void
    {
        // ===== BRANDS =====
        // 1. Create any brand master rows missing for names already on assets/stock_items.
        collect()
            ->merge(DB::table('assets')->whereNotNull('brand')->where('brand', '!=', '')->distinct()->pluck('brand'))
            ->merge(DB::table('stock_items')->whereNotNull('brand')->where('brand', '!=', '')->distinct()->pluck('brand'))
            ->map(fn (string $name) => trim($name))
            ->unique()
            ->each(function (string $name) {
                DB::table('brands')->updateOrInsert(['name' => $name], []);
            });

        // 2. Add brand_id FK to both tables (block deleting a referenced brand at the DB layer too).
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('brand_id')->nullable()->after('brand')->constrained('brands')->restrictOnDelete();
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('brand_id')->nullable()->after('brand')->constrained('brands')->restrictOnDelete();
        });

        // 3. Backfill brand_id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET brand_id = (SELECT id FROM brands WHERE brands.name = TRIM(assets.brand)) WHERE brand IS NOT NULL AND brand != ""');
        DB::statement('UPDATE stock_items SET brand_id = (SELECT id FROM brands WHERE brands.name = TRIM(stock_items.brand)) WHERE brand IS NOT NULL AND brand != ""');

        // ===== ASSET MODELS =====
        // 4. Create any asset_model master rows missing for (brand_id, model) pairs on either table.
        //    Model names are not globally unique — they are scoped to a brand — so the master row
        //    is keyed on (name, brand_id). A null brand_id matches with IS NULL (no duplicate).
        collect()
            ->merge(DB::table('assets')->whereNotNull('model')->where('model', '!=', '')->select('brand_id', 'model')->distinct()->get())
            ->merge(DB::table('stock_items')->whereNotNull('model')->where('model', '!=', '')->select('brand_id', 'model')->distinct()->get())
            ->each(function ($row) {
                DB::table('asset_models')->updateOrInsert(
                    ['name' => trim($row->model), 'brand_id' => $row->brand_id],
                    []
                );
            });

        // 5. Add model_id FK to both tables.
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('model_id')->nullable()->after('model')->constrained('asset_models')->restrictOnDelete();
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('model_id')->nullable()->after('model')->constrained('asset_models')->restrictOnDelete();
        });

        // 6. Backfill model_id matching name AND brand_id (null-safe for models with no brand).
        DB::statement('UPDATE assets SET model_id = (SELECT id FROM asset_models WHERE asset_models.name = TRIM(assets.model) AND (asset_models.brand_id = assets.brand_id OR (asset_models.brand_id IS NULL AND assets.brand_id IS NULL))) WHERE model IS NOT NULL AND model != ""');
        DB::statement('UPDATE stock_items SET model_id = (SELECT id FROM asset_models WHERE asset_models.name = TRIM(stock_items.model) AND (asset_models.brand_id = stock_items.brand_id OR (asset_models.brand_id IS NULL AND stock_items.brand_id IS NULL))) WHERE model IS NOT NULL AND model != ""');

        // 7. Drop the old name columns.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn(['brand', 'model']);
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn(['brand', 'model']);
        });
    }

    /**
     * Re-add the string columns and best-effort backfill their names from the relations.
     */
    public function down(): void
    {
        // Re-add columns (model was NOT NULL on assets; nullable is safe for a rollback).
        Schema::table('assets', function (Blueprint $table) {
            $table->string('brand')->nullable()->after('type');
            $table->string('model')->nullable()->after('brand');
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->string('brand', 120)->nullable()->after('category');
            $table->string('model', 120)->nullable()->after('brand');
        });

        DB::statement('UPDATE assets SET brand = (SELECT name FROM brands WHERE brands.id = assets.brand_id) WHERE brand_id IS NOT NULL');
        DB::statement('UPDATE assets SET model = (SELECT name FROM asset_models WHERE asset_models.id = assets.model_id) WHERE model_id IS NOT NULL');
        DB::statement('UPDATE stock_items SET brand = (SELECT name FROM brands WHERE brands.id = stock_items.brand_id) WHERE brand_id IS NOT NULL');
        DB::statement('UPDATE stock_items SET model = (SELECT name FROM asset_models WHERE asset_models.id = stock_items.model_id) WHERE model_id IS NOT NULL');

        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('model_id');
            $table->dropConstrainedForeignId('brand_id');
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('model_id');
            $table->dropConstrainedForeignId('brand_id');
        });
    }
};
