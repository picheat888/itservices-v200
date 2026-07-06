<?php

namespace Tests\Feature;

use App\Models\Settings\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocationApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_creating_a_location_with_a_duplicate_name_is_rejected(): void
    {
        $this->actingAs($this->super());
        Location::create(['name' => 'HQ Floor 3']);

        $this->postJson('/api/locations', ['name' => 'HQ Floor 3'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_creating_a_location_with_a_unique_name_succeeds(): void
    {
        $this->actingAs($this->super());
        Location::create(['name' => 'HQ Floor 3']);

        $this->postJson('/api/locations', ['name' => 'HQ Floor 4'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'HQ Floor 4');
    }

    public function test_updating_a_location_to_another_locations_name_is_rejected(): void
    {
        $this->actingAs($this->super());
        Location::create(['name' => 'HQ Floor 3']);
        $target = Location::create(['name' => 'HQ Floor 4']);

        $this->putJson("/api/locations/{$target->id}", ['name' => 'HQ Floor 3'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_updating_a_location_keeping_its_own_name_succeeds(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->putJson("/api/locations/{$location->id}", ['name' => 'HQ Floor 3'])
            ->assertOk()
            ->assertJsonPath('data.name', 'HQ Floor 3');
    }

    public function test_updating_a_location_to_a_new_unique_name_succeeds(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->putJson("/api/locations/{$location->id}", ['name' => 'HQ Floor 5'])
            ->assertOk()
            ->assertJsonPath('data.name', 'HQ Floor 5');
    }
}
