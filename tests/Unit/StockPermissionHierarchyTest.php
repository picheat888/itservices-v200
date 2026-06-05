<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class StockPermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_15_stock_keys(): void
    {
        $expected = [
            'stock.module',
            'stock.view_dashboard', 'stock.view', 'stock.view_request',
            'stock.view_count', 'stock.view_events',
            'stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer',
            'stock.request', 'stock.approve', 'stock.fulfill',
            'stock.count', 'stock.events',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $stockKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'stock.'));
        $this->assertCount(15, $stockKeys);
    }

    public function test_normalize_drops_child_when_its_view_is_off(): void
    {
        $in = ['stock.module', 'stock.view', 'stock.receive', 'stock.fulfill']; // fulfill has no view_request
        $out = Permissions::normalizeStock($in);
        $this->assertContains('stock.receive', $out);   // view present
        $this->assertNotContains('stock.fulfill', $out); // view_request absent
    }

    public function test_normalize_drops_everything_when_master_is_off(): void
    {
        $in = ['stock.view', 'stock.receive', 'tickets.create'];
        $out = Permissions::normalizeStock($in);
        $this->assertNotContains('stock.view', $out);
        $this->assertNotContains('stock.receive', $out);
        $this->assertContains('tickets.create', $out); // non-stock untouched
    }
}
