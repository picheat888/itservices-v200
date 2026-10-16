<?php

// Unit tests for the "My Profile" permission group (profile.edit, profile.return_assets).

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class ProfilePermissionKeysTest extends TestCase
{
    public function test_catalog_has_the_profile_keys(): void
    {
        $this->assertContains('profile.edit', Permissions::all());
        $this->assertContains('profile.return_assets', Permissions::all());
    }

    public function test_old_self_service_keys_are_gone(): void
    {
        foreach (['assets.my', 'access.my', 'assets.return', 'employees.edit_own'] as $key) {
            $this->assertNotContains($key, Permissions::all(), "{$key} should be gone");
        }
    }

    public function test_profile_keys_are_independent_of_module_masters(): void
    {
        $this->assertSame(['profile.return_assets'], Permissions::normalizeAssets(['profile.return_assets', 'assets.view']));
        $this->assertSame(['profile.edit'], Permissions::normalizeEmployees(['profile.edit', 'employees.view']));
        $this->assertSame(['profile.edit'], Permissions::normalizeAccess(['profile.edit', 'access.email_view']));
    }

    public function test_hierarchies_have_no_standalone_pairs(): void
    {
        $this->assertArrayNotHasKey('standalone', Permissions::employeeHierarchy());
        $this->assertArrayNotHasKey('standalone', Permissions::assetHierarchy());
        $this->assertArrayNotHasKey('standalone', Permissions::accessHierarchy());
    }

    public function test_default_roles_carry_the_profile_keys_and_no_old_ones(): void
    {
        $defaults = Permissions::defaults();
        foreach (['user', 'hr', 'it_stock', 'it_supervisorleader'] as $role) {
            $this->assertContains('profile.return_assets', $defaults[$role], "{$role} missing profile.return_assets");
        }
        $this->assertContains('profile.edit', $defaults['it_supervisorleader']);
        foreach ($defaults as $role => $granted) {
            foreach (['assets.my', 'access.my', 'assets.return', 'employees.edit_own'] as $old) {
                $this->assertNotContains($old, $granted, "{$role} still has {$old}");
            }
        }
    }
}
