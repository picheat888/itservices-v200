<?php

namespace Database\Factories;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Asset>
 */
class AssetFactory extends Factory
{
    /**
     * The domain-namespaced model this factory builds. Set explicitly because the
     * flat factory name no longer maps to App\Models\Asset\Asset by convention.
     *
     * @var class-string<Asset>
     */
    protected $model = Asset::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $type = fake()->randomElement(['laptop', 'desktop', 'mobile', 'printer', 'server', 'network', 'other']);
        $purchase = fake()->dateTimeBetween('-3 years', '-2 months');

        // Category / brand / model are FK ids now (Master Data). Resolve or create the
        // master rows so every factory-built asset links to real records (model scoped to brand).
        $category = Category::firstOrCreate(['name' => $type]);
        $brand = Brand::firstOrCreate(['name' => fake()->randomElement(['Dell', 'HP', 'Lenovo', 'Apple', 'Cisco', 'Samsung'])]);
        $model = AssetModel::create(['name' => ucwords(fake()->unique()->words(2, true)), 'brand_id' => $brand->id]);

        return [
            'category_id' => $category->id,
            'brand_id' => $brand->id,
            'model_id' => $model->id,
            'serial' => strtoupper(fake()->bothify('??######')),
            'source' => AssetSource::Purchased,
            'status' => fake()->randomElement(AssetStatus::cases()),
            'owner' => 'EMP-'.fake()->numberBetween(1000, 2200),
            'value' => fake()->numberBetween(10000, 90000),
            'purchase_date' => $purchase->format('Y-m-d'),
            'warranty_end' => fake()->dateTimeBetween('+1 month', '+3 years')->format('Y-m-d'),
        ];
    }

    /**
     * A rented asset billed monthly. Fee, vendor and lease term are NOT stored on the
     * asset — they live on the linked contract and are read from it live — so this state
     * creates a real contract and leaves the asset's own value / lease columns empty.
     */
    public function rented(): static
    {
        return $this->state(function () {
            $vendor = Vendor::firstOrCreate(['name' => 'Lease Vendor']);
            $contract = Contract::create([
                'vendor_id' => $vendor->id,
                'name' => 'Equipment lease',
                'type' => 'hardware',
                'start_date' => fake()->dateTimeBetween('-2 years', '-2 months')->format('Y-m-d'),
                'end_date' => fake()->dateTimeBetween('+2 months', '+2 years')->format('Y-m-d'),
                'value' => fake()->numberBetween(1500, 9000),
                'billing_cycle' => 'monthly',
            ]);

            return [
                'source' => AssetSource::Rented,
                'contract_id' => $contract->id,
                'value' => 0,
                'vendor_id' => null,
                'purchase_date' => null,
                'warranty_end' => null,
            ];
        });
    }
}
