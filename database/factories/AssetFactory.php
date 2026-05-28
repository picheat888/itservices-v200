<?php

namespace Database\Factories;

use App\Enums\AssetSource;
use App\Enums\AssetStatus;
use App\Enums\AssetType;
use App\Models\Asset;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Asset>
 */
class AssetFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $type = fake()->randomElement(AssetType::cases());
        $purchase = fake()->dateTimeBetween('-3 years', '-2 months');

        return [
            'type' => $type,
            'brand' => fake()->randomElement(['Dell', 'HP', 'Lenovo', 'Apple', 'Cisco', 'Samsung']),
            'model' => fake()->words(2, true),
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
