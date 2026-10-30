<?php

// Builds SlaHoliday rows on distinct weekdays of 2026.

namespace Database\Factories;

use App\Models\Settings\SlaHoliday;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SlaHoliday>
 */
class SlaHolidayFactory extends Factory
{
    /** @var class-string<SlaHoliday> */
    protected $model = SlaHoliday::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'date' => Carbon::create(2026, 1, 1)->addWeekdays(fake()->unique()->numberBetween(0, 250))->toDateString(),
            'name' => fake()->words(2, true),
        ];
    }
}
