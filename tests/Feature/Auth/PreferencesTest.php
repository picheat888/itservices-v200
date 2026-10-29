<?php

// PUT /api/preferences merges the sent keys into the stored ones and refuses values the UI never sends (AUTH-9).

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_preferences_merge_and_keep_other_keys(): void
    {
        $user = User::factory()->create(['preferences' => ['dark' => true, 'lang' => 'th']]);

        $this->actingAs($user)->putJson('/api/preferences', ['density' => 'compact'])->assertOk();
        $this->actingAs($user)->putJson('/api/preferences', ['radius' => 4, 'accent' => '#10B981'])->assertOk();

        $stored = $user->fresh()->resolvedPreferences();
        $this->assertTrue($stored['dark']);
        $this->assertSame('th', $stored['lang']);
        $this->assertSame('compact', $stored['density']);
        $this->assertSame(4, $stored['radius']);
        $this->assertSame('#10B981', $stored['accent']);
        $this->assertSame('labeled', $stored['sidebar']);
    }

    public function test_bad_density_radius_or_accent_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/preferences', ['density' => 'tiny'])->assertStatus(422)->assertJsonValidationErrors('density');
        $this->actingAs($user)->putJson('/api/preferences', ['radius' => 21])->assertStatus(422)->assertJsonValidationErrors('radius');
        $this->actingAs($user)->putJson('/api/preferences', ['radius' => -1])->assertStatus(422)->assertJsonValidationErrors('radius');
        $this->actingAs($user)->putJson('/api/preferences', ['accent' => 'blue'])->assertStatus(422)->assertJsonValidationErrors('accent');
        $this->actingAs($user)->putJson('/api/preferences', ['accent' => '#12345'])->assertStatus(422)->assertJsonValidationErrors('accent');

        $this->assertSame(User::DEFAULT_PREFERENCES, $user->fresh()->resolvedPreferences());
    }
}
