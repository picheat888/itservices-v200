<?php

// A list filter sent as an array (?status[]=x) is ignored like an unknown value, never a 500.

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ListFilterArrayInputTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_email_log_ignores_an_array_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/email-logs?status[]=sent')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_the_stock_item_list_ignores_an_array_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/stock-items?status[]=low')->assertOk();
        $this->getJson('/api/stock-items?category[]=Toner&warehouse[]=Main')->assertOk();
        $this->getJson('/api/stock-items?all=1&status[]=low')->assertOk();
    }
}
