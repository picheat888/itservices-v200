<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The SPA shell is served to everyone; real access control lives at the API,
     * so a guest hitting a protected endpoint must be rejected.
     */
    public function test_guests_cannot_access_protected_api(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    /** An authenticated user can load the dashboard shell. */
    public function test_authenticated_users_can_visit_the_dashboard(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/dashboard')->assertOk();
    }
}
