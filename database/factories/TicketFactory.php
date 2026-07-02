<?php

namespace Database\Factories;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Ticket>
 */
class TicketFactory extends Factory
{
    /**
     * The domain-namespaced model this factory builds. Set explicitly because the
     * flat factory name no longer maps to App\Models\Ticket\Ticket by convention.
     *
     * @var class-string<Ticket>
     */
    protected $model = Ticket::class;

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
                'first_name' => fake()->firstName(),
                'last_name' => fake()->lastName(),
                'status' => 'active',
            ])->id,
            'assignee_id' => null,
        ];
    }
}
