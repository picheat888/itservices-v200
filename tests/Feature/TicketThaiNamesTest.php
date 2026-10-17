<?php

// Ticket rows carry requester_name_th next to the English requester name.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_ticket_row_carries_requester_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $requester = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        Ticket::factory()->create(['requester_id' => $requester->id]);

        $this->getJson('/api/tickets')->assertOk()
            ->assertJsonPath('data.0.requester_name', 'Somchai J')
            ->assertJsonPath('data.0.requester_name_th', 'สมชาย ใจดี');
    }

    public function test_requester_twin_is_null_without_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $requester = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J']);
        Ticket::factory()->create(['requester_id' => $requester->id]);

        $row = $this->getJson('/api/tickets')->assertOk()->json('data.0');

        $this->assertArrayHasKey('requester_name_th', $row);
        $this->assertNull($row['requester_name_th']);
    }
}
