<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Tests\TestCase;

/** Tests the settings permission group and the removal of system.edit_settings. */
class SettingsPermissionsTest extends TestCase
{
    public function test_settings_module_exposes_expected_keys(): void
    {
        $expected = [
            'settings.company', 'settings.system',
            'settings.masterdata', 'settings.email', 'settings.sla',
            'settings.assets', 'settings.workflows', 'settings.security',
        ];

        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }

        // Branding & Display were consolidated into the single settings.system key.
        $this->assertNotContains('settings.branding', Permissions::all());
        $this->assertNotContains('settings.display', Permissions::all());

        $settingsKeys = array_filter(Permissions::all(), fn ($key) => str_starts_with($key, 'settings.'));
        $this->assertCount(8, $settingsKeys);
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
