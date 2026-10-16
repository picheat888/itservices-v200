<?php

// Unit tests for the request permission keys: catalog, cascade, defaults and requestTypesFor().

namespace Tests\Unit;

use App\Enums\Request\RequestType;
use App\Models\User;
use App\Support\Permissions;
use Tests\TestCase;

class RequestPermissionHierarchyTest extends TestCase
{
    /**
     * @return list<string>
     */
    private function typeKeys(): array
    {
        return array_map(fn (RequestType $type) => "requests.submit_{$type->value}", RequestType::cases());
    }

    public function test_catalog_exposes_the_new_request_keys(): void
    {
        $all = Permissions::all();
        $this->assertContains('requests.cancel_any', $all);
        $this->assertCount(13, $this->typeKeys());
        foreach ($this->typeKeys() as $key) {
            $this->assertContains($key, $all, "missing {$key}");
        }
        $this->assertCount(14, array_intersect($all, [...$this->typeKeys(), 'requests.cancel_any']));
    }

    public function test_type_key_needs_submit(): void
    {
        $out = Permissions::normalizeRequests(['requests.module', 'requests.submit_cctv']);
        $this->assertNotContains('requests.submit_cctv', $out);
    }

    public function test_type_key_survives_with_submit(): void
    {
        $out = Permissions::normalizeRequests(['requests.module', 'requests.submit', 'requests.submit_cctv']);
        $this->assertContains('requests.submit_cctv', $out);
    }

    public function test_cancel_any_needs_view_all(): void
    {
        $out = Permissions::normalizeRequests(['requests.module', 'requests.cancel_any']);
        $this->assertNotContains('requests.cancel_any', $out);

        $kept = Permissions::normalizeRequests(['requests.module', 'requests.view_all', 'requests.cancel_any']);
        $this->assertContains('requests.cancel_any', $kept);
    }

    public function test_everything_needs_the_master(): void
    {
        $out = Permissions::normalizeRequests(['requests.submit', 'requests.submit_cctv', 'tickets.create']);
        $this->assertSame(['tickets.create'], $out);
    }

    public function test_request_types_for_returns_only_held_types(): void
    {
        $user = new class extends User
        {
            public function hasPermission(string $permission): bool
            {
                return in_array($permission, ['requests.submit', 'requests.submit_cctv', 'requests.submit_email'], true);
            }
        };
        $this->assertSame(['email', 'cctv'], Permissions::requestTypesFor($user));
        $this->assertSame([], Permissions::requestTypesFor(null));
    }

    public function test_defaults_give_every_submitter_all_types(): void
    {
        foreach (Permissions::defaults() as $role => $keys) {
            if (in_array('requests.submit', $keys, true)) {
                $this->assertEmpty(array_diff($this->typeKeys(), $keys), "{$role} lacks a type key");
            } else {
                $this->assertEmpty(array_intersect($this->typeKeys(), $keys), "{$role} has type keys without submit");
            }
        }
    }

    public function test_only_admin_and_supervisor_hold_cancel_any(): void
    {
        $holders = array_keys(array_filter(
            Permissions::defaults(),
            fn (array $keys) => in_array('requests.cancel_any', $keys, true),
        ));
        sort($holders);
        $this->assertSame(['admin', 'it_supervisorleader'], $holders);
    }

    public function test_default_grants_are_request_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $keys) {
            $normalized = Permissions::normalizeRequests($keys);
            $this->assertEmpty(array_diff($keys, $normalized), "{$role} has request keys the cascade would drop");
        }
    }
}
