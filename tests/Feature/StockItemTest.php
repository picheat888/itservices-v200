<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemTest extends TestCase
{
    use RefreshDatabase;

    private function superUser(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function regularUser(): User
    {
        return User::factory()->create(['role' => 'user']);
    }

    private function makeItem(array $overrides = []): StockItem
    {
        return StockItem::create(array_merge([
            'sku' => 'SK-TEST-'.fake()->unique()->numerify('###'),
            'name' => 'Test item',
            'unit' => 'unit',
            'cost' => 100,
            'current_stock' => 5,
            'min_stock' => 2,
            'max_stock' => 10,
            'warehouse' => 'WH-HQ',
            'category' => 'Cable',
            'last_move_at' => now(),
        ], $overrides));
    }

    public function test_guest_cannot_list_stock_items(): void
    {
        $this->getJson('/api/stock-items')->assertUnauthorized();
    }

    public function test_super_can_list_stock_items(): void
    {
        $this->makeItem();

        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_status_is_derived_from_current_vs_min_max(): void
    {
        $this->assertSame('out', $this->makeItem(['current_stock' => 0])->status());
        $this->assertSame('low', $this->makeItem(['current_stock' => 1, 'min_stock' => 3])->status());
        $this->assertSame('over', $this->makeItem(['current_stock' => 20, 'max_stock' => 10])->status());
        $this->assertSame('ok', $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()])->status());
        $this->assertSame('dead', $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()->subDays(120)])->status());
    }

    public function test_summary_reports_alert_buckets(): void
    {
        $this->makeItem(['current_stock' => 0, 'min_stock' => 3]);            // out → low bucket
        $this->makeItem(['current_stock' => 1, 'min_stock' => 5]);            // low
        $this->makeItem(['current_stock' => 30, 'max_stock' => 10]);          // over
        $this->makeItem(['current_stock' => 5, 'last_move_at' => now()->subDays(200)]); // dead

        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items/summary')
            ->assertOk()
            ->assertJsonPath('skus', 4)
            ->assertJsonPath('low_count', 2)
            ->assertJsonPath('over_count', 1)
            ->assertJsonPath('dead_count', 1);
    }

    public function test_super_can_create_stock_item(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', [
                'sku' => 'SK-NEW-001',
                'name' => 'New SSD',
                'unit' => 'drive',
                'cost' => 2100,
                'current_stock' => 4,
                'min_stock' => 2,
                'max_stock' => 12,
            ])
            ->assertCreated()
            ->assertJsonPath('data.sku', 'SK-NEW-001')
            ->assertJsonPath('data.status', 'ok');

        $this->assertDatabaseHas('stock_items', ['sku' => 'SK-NEW-001']);
    }

    public function test_user_without_manage_items_cannot_create(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/stock-items', ['sku' => 'SK-X', 'name' => 'X', 'unit' => 'unit', 'cost' => 1, 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 1])
            ->assertForbidden();
    }
}
