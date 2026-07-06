<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Map of legacy English AssetType enum values (and a stray Thai variant) to the
     * canonical Thai category names already in the categories master, so assets.type
     * is normalized before the FK backfill instead of creating duplicate categories.
     *
     * @var array<string, string>
     */
    private array $typeMap = [
        'laptop' => 'แล็ปท็อป',
        'desktop' => 'เดสก์ท็อป',
        'mobile' => 'Mobile',
        'printer' => 'เครื่องพิมพ์',
        'server' => 'เซิร์ฟเวอร์',
        'network' => 'สวิตช์ / เราเตอร์',
        'other' => 'อุปกรณ์อื่น ๆ',
        'โทรศัพท์' => 'Mobile',
    ];

    /**
     * Convert assets.type + stock_items.category (name strings) to category_id
     * (→ categories). Same recipe as earlier phases; assets.type is first mapped
     * from its legacy enum values to the matching Thai category names.
     */
    public function up(): void
    {
        // 1. Normalize legacy enum values on assets.type to their canonical category name.
        foreach ($this->typeMap as $from => $to) {
            DB::table('assets')->where('type', $from)->update(['type' => $to]);
        }

        // 2. Create any category master rows still missing (safety net — after mapping
        //    everything should already match an existing category).
        collect()
            ->merge(DB::table('assets')->whereNotNull('type')->where('type', '!=', '')->distinct()->pluck('type'))
            ->merge(DB::table('stock_items')->whereNotNull('category')->where('category', '!=', '')->distinct()->pluck('category'))
            ->map(fn (string $name) => trim($name))
            ->unique()
            ->each(function (string $name) {
                DB::table('categories')->updateOrInsert(['name' => $name], []);
            });

        // 3. Add the FK column to both tables.
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('category_id')->nullable()->after('type')->constrained('categories')->restrictOnDelete();
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('category_id')->nullable()->after('category')->constrained('categories')->restrictOnDelete();
        });

        // 4. Backfill by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET category_id = (SELECT id FROM categories WHERE categories.name = TRIM(assets.type)) WHERE type IS NOT NULL AND type != ""');
        DB::statement('UPDATE stock_items SET category_id = (SELECT id FROM categories WHERE categories.name = TRIM(stock_items.category)) WHERE category IS NOT NULL AND category != ""');

        // 5. Drop the old name columns.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('type');
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }

    /**
     * Re-add the string columns and best-effort backfill their names from the relation.
     */
    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('type')->default('laptop')->after('nickname');
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->string('category', 120)->nullable()->after('track_serial');
        });

        DB::statement('UPDATE assets SET type = COALESCE((SELECT name FROM categories WHERE categories.id = assets.category_id), \'laptop\')');
        DB::statement('UPDATE stock_items SET category = (SELECT name FROM categories WHERE categories.id = stock_items.category_id) WHERE category_id IS NOT NULL');

        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('category_id');
        });
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('category_id');
        });
    }
};
