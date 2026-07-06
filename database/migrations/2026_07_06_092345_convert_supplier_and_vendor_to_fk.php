<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert assets.supplier + contracts.vendor (name strings) to vendor_id
     * (→ vendors). Same recipe as earlier phases; matched/created by vendors.name.
     */
    public function up(): void
    {
        // 1. Create any vendor master rows missing for names already on assets/contracts.
        collect()
            ->merge(DB::table('assets')->whereNotNull('supplier')->where('supplier', '!=', '')->distinct()->pluck('supplier'))
            ->merge(DB::table('contracts')->whereNotNull('vendor')->where('vendor', '!=', '')->distinct()->pluck('vendor'))
            ->map(fn (string $name) => trim($name))
            ->unique()
            ->each(function (string $name) {
                DB::table('vendors')->updateOrInsert(['name' => $name], []);
            });

        // 2. Add the FK column to both tables.
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('vendor_id')->nullable()->after('supplier')->constrained('vendors')->restrictOnDelete();
        });
        Schema::table('contracts', function (Blueprint $table) {
            $table->foreignId('vendor_id')->nullable()->after('vendor')->constrained('vendors')->restrictOnDelete();
        });

        // 3. Backfill by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET vendor_id = (SELECT id FROM vendors WHERE vendors.name = TRIM(assets.supplier)) WHERE supplier IS NOT NULL AND supplier != ""');
        DB::statement('UPDATE contracts SET vendor_id = (SELECT id FROM vendors WHERE vendors.name = TRIM(contracts.vendor)) WHERE vendor IS NOT NULL AND vendor != ""');

        // 4. Drop the old name columns.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('supplier');
        });
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('vendor');
        });
    }

    /**
     * Re-add the string columns and best-effort backfill their names from the relation.
     */
    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('supplier')->nullable()->after('value');
        });
        Schema::table('contracts', function (Blueprint $table) {
            $table->string('vendor')->default('')->after('code');
        });

        DB::statement('UPDATE assets SET supplier = (SELECT name FROM vendors WHERE vendors.id = assets.vendor_id) WHERE vendor_id IS NOT NULL');
        DB::statement('UPDATE contracts SET vendor = COALESCE((SELECT name FROM vendors WHERE vendors.id = contracts.vendor_id), \'\')');

        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vendor_id');
        });
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vendor_id');
        });
    }
};
