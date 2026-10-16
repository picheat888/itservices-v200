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
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $assetKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'assets.'));
        $this->assertCount(13, $assetKeys);
    }

    public function test_normalize_drops_child_when_its_group_is_off(): void
    {
        // register's parent (view) IS present -> kept; transfer's parent (manage) is absent -> dropped.
        $in = ['assets.module', 'assets.view', 'assets.register', 'assets.transfer'];
        $out = Permissions::normalizeAssets($in);
        $this->assertContains('assets.register', $out);
        $this->assertNotContains('assets.transfer', $out);
    }

    public function test_normalize_drops_every_asset_key_when_master_is_off(): void
    {
        $in = ['assets.view', 'assets.register', 'assets.transfer', 'tickets.create'];
        $out = Permissions::normalizeAssets($in);
        $this->assertSame(['tickets.create'], $out);
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
