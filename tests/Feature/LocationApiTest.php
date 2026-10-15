<?php

namespace Tests\Feature;

use App\Models\Request\ServiceRequest;
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

    public function test_a_location_named_on_a_request_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'Building B']);
        $request = ServiceRequest::create([
            'reference' => 'RQ-2026-0001', 'type' => 'computer', 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => 'New laptop', 'reason' => 'Needed for work.',
            'status' => 'pending', 'location_id' => $location->id,
        ]);

        $this->deleteJson("/api/locations/{$location->id}")
            ->assertStatus(409)
            ->assertJsonPath('message', 'in_use')
            ->assertJsonPath('count', 1);

        $this->assertSame($location->id, $request->fresh()->location_id);
    }

    public function test_an_unused_location_can_be_deleted(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'Building C']);

        $this->deleteJson("/api/locations/{$location->id}")->assertOk();

        $this->assertDatabaseMissing('locations', ['id' => $location->id]);
    }
}
