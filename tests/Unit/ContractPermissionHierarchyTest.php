<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class ContractPermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_contract_keys(): void
    {
        $expected = [
            'contracts.module', 'contracts.view_dashboard', 'contracts.view', 'contracts.view_lifecycle',
            'contracts.create', 'contracts.edit', 'contracts.delete',
            'contracts.cancel', 'contracts.expire', 'contracts.reactivate', 'contracts.alerts',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $contractKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'contracts.'));
        $this->assertCount(12, $contractKeys);

        // Renew is gone.
        $this->assertNotContains('contracts.renew', Permissions::all());
    }

    public function test_normalize_drops_child_when_its_group_is_off(): void
    {
        // create's parent view IS present -> kept; cancel's parent view_lifecycle is absent -> dropped.
        $in = ['contracts.module', 'contracts.view', 'contracts.create', 'contracts.cancel'];
        $out = Permissions::normalizeContracts($in);
        $this->assertContains('contracts.create', $out);
        $this->assertNotContains('contracts.cancel', $out);
    }

    public function test_normalize_drops_all_contracts_when_master_is_off(): void
    {
        $in = ['contracts.view', 'contracts.create', 'contracts.cancel', 'tickets.create'];
        $out = Permissions::normalizeContracts($in);
        $this->assertNotContains('contracts.view', $out);
        $this->assertNotContains('contracts.create', $out);
        $this->assertContains('tickets.create', $out); // non-contract untouched
    }

    public function test_default_grants_are_contract_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $normalized = Permissions::normalizeContracts($granted);
            $before = array_values(array_filter($granted, fn ($k) => str_starts_with($k, 'contracts.')));
            $after = array_values(array_filter($normalized, fn ($k) => str_starts_with($k, 'contracts.')));
            sort($before);
            sort($after);
            $this->assertSame($before, $after, "contract defaults for {$role} are not hierarchy-consistent");
        }
    }
}
