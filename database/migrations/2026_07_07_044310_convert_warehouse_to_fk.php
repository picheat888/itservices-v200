<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert the current-state warehouse columns to warehouse_id (→ warehouses):
     * assets.warehouse, stock_item_serials.warehouse, stock_balances.warehouse.
     * The append-only log columns (stock_item_serial_events.warehouse, stock_counts.warehouse)
     * intentionally stay as name-string snapshots. 'Unassigned' / blank → null (no fake row).
     */
    public function up(): void
    {
        // 1. Create any warehouse master rows missing for real names already in use.
        collect()
            ->merge(DB::table('assets')->whereNotNull('warehouse')->pluck('warehouse'))
            ->merge(DB::table('stock_item_serials')->whereNotNull('warehouse')->pluck('warehouse'))
            ->merge(DB::table('stock_balances')->whereNotNull('warehouse')->pluck('warehouse'))
            ->map(fn (?string $name) => trim((string) $name))
            ->reject(fn (string $name) => $name === '' || $name === 'Unassigned')
            ->unique()
            ->each(function (string $name) {
                DB::table('warehouses')->updateOrInsert(['name' => $name], []);
            });

        // 2. assets.warehouse → warehouse_id
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('warehouse')->constrained('warehouses')->restrictOnDelete();
        });
        DB::statement('UPDATE assets SET warehouse_id = (SELECT id FROM warehouses WHERE warehouses.name = TRIM(assets.warehouse)) WHERE warehouse IS NOT NULL AND warehouse != "" AND warehouse != "Unassigned"');
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('warehouse');
        });

        // 3. stock_item_serials.warehouse → warehouse_id
        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('warehouse')->constrained('warehouses')->restrictOnDelete();
        });
        DB::statement('UPDATE stock_item_serials SET warehouse_id = (SELECT id FROM warehouses WHERE warehouses.name = TRIM(stock_item_serials.warehouse)) WHERE warehouse IS NOT NULL AND warehouse != "" AND warehouse != "Unassigned"');
        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->dropColumn('warehouse');
        });

        // 4. stock_balances.warehouse → warehouse_id (swap the unique index too)
        Schema::table('stock_balances', function (Blueprint $table) {
            $table->dropUnique('stock_balances_stock_item_id_warehouse_unique');
            $table->foreignId('warehouse_id')->nullable()->after('warehouse')->constrained('warehouses')->restrictOnDelete();
        });
        DB::statement('UPDATE stock_balances SET warehouse_id = (SELECT id FROM warehouses WHERE warehouses.name = TRIM(stock_balances.warehouse)) WHERE warehouse IS NOT NULL AND warehouse != "" AND warehouse != "Unassigned"');
        Schema::table('stock_balances', function (Blueprint $table) {
            $table->dropColumn('warehouse');
            $table->unique(['stock_item_id', 'warehouse_id']);
        });
    }

    public function down(): void
    {
        // assets
        Schema::table('assets', function (Blueprint $table) {
            $table->string('warehouse', 120)->nullable()->after('department');
        });
        DB::statement('UPDATE assets SET warehouse = (SELECT name FROM warehouses WHERE warehouses.id = assets.warehouse_id) WHERE warehouse_id IS NOT NULL');
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
        });

        // stock_item_serials
        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->string('warehouse', 120)->nullable()->after('status');
        });
        DB::statement('UPDATE stock_item_serials SET warehouse = (SELECT name FROM warehouses WHERE warehouses.id = stock_item_serials.warehouse_id) WHERE warehouse_id IS NOT NULL');
        Schema::table('stock_item_serials', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
        });

        // stock_balances
        Schema::table('stock_balances', function (Blueprint $table) {
            $table->dropUnique(['stock_item_id', 'warehouse_id']);
            $table->string('warehouse', 120)->nullable()->after('stock_item_id');
        });
        DB::statement('UPDATE stock_balances SET warehouse = COALESCE((SELECT name FROM warehouses WHERE warehouses.id = stock_balances.warehouse_id), \'Unassigned\')');
        Schema::table('stock_balances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
            $table->unique(['stock_item_id', 'warehouse']);
        });
    }
};
