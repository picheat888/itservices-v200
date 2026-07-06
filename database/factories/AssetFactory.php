<?php

namespace Database\Factories;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
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

        // Brand + model are FK ids now (Master Data). Resolve/create a brand, then a
        // brand-scoped model, so every factory-built asset links to real master rows.
        $brand = Brand::firstOrCreate(['name' => fake()->randomElement(['Dell', 'HP', 'Lenovo', 'Apple', 'Cisco', 'Samsung'])]);
        $model = AssetModel::create(['name' => ucwords(fake()->unique()->words(2, true)), 'brand_id' => $brand->id]);

        return [
            'type' => $type,
            'brand_id' => $brand->id,
            'model_id' => $model->id,
            'serial' => strtoupper(fake()->bothify('??######')),
            'source' => AssetSource::Purchased,
            'status' => fake()->randomElement(AssetStatus::cases()),
            'owner' => 'EMP-'.fake()->numberBetween(1000, 2200),
            'department' => fake()->randomElement(['IT', 'Finance', 'Sales', 'Production', 'HR']),
            'value' => fake()->numberBetween(10000, 90000),
            'purchase_date' => $purchase->format('Y-m-d'),
            'warranty_end' => fake()->dateTimeBetween('+1 month', '+3 years')->format('Y-m-d'),
            'registered_date' => $purchase->format('Y-m-d'),
        ];
    }

    /** A rented asset billed monthly, optionally linked to a contract. */
    public function rented(): static
    {
        return $this->state(fn () => [
            'source' => AssetSource::Rented,
            'value' => fake()->numberBetween(1500, 9000),
            'lease_start' => fake()->dateTimeBetween('-2 years', '-2 months')->format('Y-m-d'),
            'lease_end' => fake()->dateTimeBetween('+2 months', '+2 years')->format('Y-m-d'),
        ]);
    }
}
