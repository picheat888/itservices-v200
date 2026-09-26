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

    /**
     * The company's templates (2026-09-26) do grant settings sections — to IT only, and
     * never a section without the settings.access master that opens the screen.
     */
    public function test_default_settings_grants_carry_the_master_and_stay_with_it(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $sections = array_filter($granted, fn (string $key) => str_starts_with($key, 'settings.') && $key !== 'settings.access');
            if ($sections !== []) {
                $this->assertContains('settings.access', $granted, "{$role} holds a settings section without settings.access");
            }
        }

        foreach (['hr', 'user'] as $role) {
            $this->assertEmpty(
                array_filter(Permissions::defaults()[$role], fn (string $key) => str_starts_with($key, 'settings.')),
                "{$role} should not be granted any settings",
            );
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
