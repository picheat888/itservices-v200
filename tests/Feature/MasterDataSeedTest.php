<?php

namespace Tests\Feature;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\Warehouse;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The lookup lists the Asset and Stock forms pick from.
 *
 * Two things are worth holding: that re-running the seeder on an installed system
 * updates rather than duplicates — it says so on the class, and every `name` here is
 * a unique column, so a second insert would fail rather than double up — and that an
 * asset model is stored without the brand it already has a column for.
 */
class MasterDataSeedTest extends TestCase
{
    use RefreshDatabase;

    /** Every model the seeder writes, so a list added later is covered by default. */
    private const SEEDED = [
        Brand::class, AssetModel::class, Category::class,
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
     * The brand lives in its own column, so carrying it in the name too renders as
     * "Dell Dell Latitude 5540" everywhere the two are shown together.
     */
    public function test_an_asset_model_is_stored_without_its_brand_prefix(): void
    {
        $this->seed(MasterDataSeeder::class);

        $model = AssetModel::with('brand')->where('name', 'Latitude 5540')->first();

        $this->assertNotNull($model, 'the Dell prefix was stripped from the stored name');
        $this->assertSame('Dell', $model->brand?->name);
    }

    /** A model whose name does not start with its brand keeps it whole. */
    public function test_a_model_named_after_no_brand_is_left_alone(): void
    {
        $this->seed(MasterDataSeeder::class);

        $this->assertNotNull(AssetModel::where('name', 'MacBook Air M2 13"')->first());
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
