<?php

namespace Tests\Feature;

use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\Warehouse;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The lookup lists the Asset, Contract and Stock forms pick from.
 *
 * Re-running the seeder on an installed system has to update rather than duplicate —
 * it says so on the class, and every `name` here is unique, so a second insert would
 * fail rather than double up. Categories carry more than a name, and both halves are
 * held below.
 */
class MasterDataSeedTest extends TestCase
{
    use RefreshDatabase;

    /** Every model the seeder writes, so a list added later is covered by default. */
    private const SEEDED = [
        Brand::class, Category::class,
        Warehouse::class, Unit::class, WarrantyType::class,
    ];

    public function test_it_seeds_every_list(): void
    {
        $this->seed(MasterDataSeeder::class);

        foreach (self::SEEDED as $model) {
            $this->assertGreaterThan(0, $model::count(), class_basename($model).' was seeded');
        }
    }

    public function test_running_it_twice_changes_nothing(): void
    {
        $this->seed(MasterDataSeeder::class);
        $first = collect(self::SEEDED)->mapWithKeys(fn ($m) => [$m => $m::count()]);

        $this->seed(MasterDataSeeder::class);

        foreach ($first as $model => $count) {
            $this->assertSame($count, $model::count(), class_basename($model).' was duplicated on the second run');
        }
    }

    /**
     * Categories are shown in the reader's language: `name` is read for English and
     * `name_th` for Thai (asset/pages/index.tsx). A category missing either half
     * shows the other one to somebody who cannot read it.
     */
    public function test_every_category_is_named_in_both_languages(): void
    {
        $this->seed(MasterDataSeeder::class);

        foreach (Category::all() as $category) {
            $this->assertNotEmpty($category->name_th, "{$category->name} has no Thai name");
            $this->assertDoesNotMatchRegularExpression('/\p{Thai}/u', $category->name, 'name is the English half');
            $this->assertMatchesRegularExpression('/\p{Thai}/u', $category->name_th, "{$category->name} name_th is not Thai");
            $this->assertMatchesRegularExpression('/\p{Thai}/u', (string) $category->description, "{$category->name} description is not Thai");
        }
    }

    /**
     * An icon is a Lucide name the picker offers, so what the seeder writes has to be
     * a name that exists — `getLucideIcon()` renders nothing at all for one that does
     * not, and the category silently loses its mark.
     */
    public function test_every_category_icon_is_one_the_picker_offers(): void
    {
        $this->seed(MasterDataSeeder::class);

        $source = file_get_contents(base_path('resources/js/shared/lib/lucide-icons.ts'));
        preg_match_all("/\{ name: '([A-Za-z0-9]+)'/", $source, $matches);
        $offered = $matches[1];
        $this->assertNotEmpty($offered, 'the curated icon list was read');

        $icons = Category::pluck('icon', 'name');
        foreach ($icons as $name => $icon) {
            $this->assertNotEmpty($icon, "{$name} has no icon");
            $this->assertContains($icon, $offered, "{$name} uses '{$icon}', which the picker does not offer");
        }

        $this->assertSame($icons->count(), $icons->unique()->count(), 'two categories share an icon');
    }
}
