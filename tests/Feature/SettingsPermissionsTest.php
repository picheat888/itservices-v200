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
            'settings.access', 'settings.company', 'settings.system',
            'settings.masterdata', 'settings.email', 'settings.sla', 'settings.requestdata',
            'settings.assets', 'settings.security',
        ];

        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }

        // Branding & Display were consolidated into the single settings.system key.
        $this->assertNotContains('settings.branding', Permissions::all());
        $this->assertNotContains('settings.display', Permissions::all());

        $settingsKeys = array_filter(Permissions::all(), fn ($key) => str_starts_with($key, 'settings.'));
        $this->assertCount(9, $settingsKeys);
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

    /** Without the settings.access master, every per-section settings key is dropped. */
    public function test_normalize_settings_drops_sections_when_master_is_off(): void
    {
        $normalized = Permissions::normalizeSettings(['settings.company', 'settings.email', 'tickets.create']);

        $this->assertSame(['tickets.create'], array_values($normalized));
    }

    /** With the master on, the per-section keys are kept. */
    public function test_normalize_settings_keeps_sections_when_master_is_on(): void
    {
        $granted = ['settings.access', 'settings.company', 'tickets.create'];

        $normalized = Permissions::normalizeSettings($granted);

        $this->assertEqualsCanonicalizing($granted, $normalized);
    }
}
