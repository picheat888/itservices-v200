<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class AssetPermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_asset_keys(): void
    {
        $expected = [
            'assets.module', 'assets.view_dashboard', 'assets.view', 'assets.register', 'assets.edit', 'assets.delete',
            'assets.manage', 'assets.transfer', 'assets.receive', 'assets.retire',
            'assets.special', 'assets.force_recall', 'assets.cancel_writeoff',
            'assets.my', 'assets.return',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $assetKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'assets.'));
        $this->assertCount(15, $assetKeys);
    }

    public function test_normalize_drops_child_when_its_group_is_off(): void
    {
        // register's parent (view) IS present -> kept; transfer's parent (manage) is absent -> dropped.
        $in = ['assets.module', 'assets.view', 'assets.register', 'assets.transfer'];
        $out = Permissions::normalizeAssets($in);
        $this->assertContains('assets.register', $out);
        $this->assertNotContains('assets.transfer', $out);
    }

    public function test_normalize_drops_gated_assets_when_master_is_off_but_keeps_self_service(): void
    {
        $in = ['assets.view', 'assets.register', 'assets.transfer', 'assets.my', 'assets.return', 'tickets.create'];
        $out = Permissions::normalizeAssets($in);
        $this->assertNotContains('assets.view', $out);
        $this->assertNotContains('assets.register', $out);
        $this->assertNotContains('assets.transfer', $out);
        // Self-service survives the master being off.
        $this->assertContains('assets.my', $out);
        $this->assertContains('assets.return', $out);
        // Non-asset keys untouched.
        $this->assertContains('tickets.create', $out);
    }

    public function test_normalize_drops_return_when_my_is_off(): void
    {
        // `return` requires `my` even though both are master-independent.
        $in = ['assets.return'];
        $out = Permissions::normalizeAssets($in);
        $this->assertNotContains('assets.return', $out);

        $in2 = ['assets.my', 'assets.return'];
        $out2 = Permissions::normalizeAssets($in2);
        $this->assertContains('assets.return', $out2);
    }

    public function test_default_grants_are_asset_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $normalized = Permissions::normalizeAssets($granted);
            $before = array_values(array_filter($granted, fn ($k) => str_starts_with($k, 'assets.')));
            $after = array_values(array_filter($normalized, fn ($k) => str_starts_with($k, 'assets.')));
            sort($before);
            sort($after);
            $this->assertSame($before, $after, "asset defaults for {$role} are not hierarchy-consistent");
        }
    }
}
