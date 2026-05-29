<?php

namespace Database\Factories;

use App\Enums\TicketCategory;
use App\Enums\TicketStatus;
use App\Models\Employee;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Ticket>
 */
class TicketFactory extends Factory
{
    /**
     * A fresh ticket: Open, unassigned, no priority. Creates a standalone employee
     * as the requester so the factory works without external setup.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject' => fake()->sentence(4),
            'description' => fake()->paragraph(),
            'category' => fake()->randomElement(TicketCategory::cases()),
            'priority' => null,
            'status' => TicketStatus::Open,
            'callback_phone' => fake()->numerify('+66 8# ### ####'),
            'requester_id' => fn () => Employee::create([
                'name' => fake()->name(),
                'status' => 'active',
            ])->id,
            'assignee_id' => null,
        ];
    }
}
