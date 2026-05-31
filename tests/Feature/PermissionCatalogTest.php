<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Tests\TestCase;

class PermissionCatalogTest extends TestCase
{
    public function test_settings_module_has_nine_granular_keys(): void
    {
        $expected = [
            'settings.company', 'settings.branding', 'settings.display',
            'settings.masterdata', 'settings.email', 'settings.sla',
            'settings.assets', 'settings.workflows', 'settings.security',
        ];

        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
    }

    public function test_legacy_edit_settings_key_is_removed(): void
    {
        $this->assertNotContains('system.edit_settings', Permissions::all());
    }

    public function test_settings_permissions_are_not_granted_by_default(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            foreach ($granted as $key) {
                $this->assertStringStartsNotWith('settings.', $key, "{$role} should not be granted {$key}");
            }
        }
    }
}
