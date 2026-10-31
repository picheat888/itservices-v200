<?php

// The system settings the SPA reads (GET /settings) and the plain section saves: company, branding, display, date and time, sound, asset colours.

namespace App\Services\Settings;

use App\Enums\Ticket\SlaScope;
use App\Models\AuditLog;
use App\Models\Settings\AppSetting;
use App\Models\Settings\SlaTarget;
use App\Services\Employee\EmployeeService;
use App\Support\NotificationSounds;
use App\Support\TicketSla;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class SettingsService
{
    /** What the page may show before anybody signs in: its name, logo and theme. */
    public const PUBLIC_KEYS = ['brand_name', 'brand_sub', 'logo_url', 'theme_accent', 'theme_density', 'theme_radius'];

    /** @var array<string, string> */
    private const DEFAULTS = [
        'brand_name' => '',          // falls back to config('app.name')
        'brand_sub' => 'Service Desk',
        // Empty until saved: the Settings form shows samples as placeholders
        'company_name' => '',
        'legal_name' => '',
        'tax_id' => '',
        'industry' => '',
        'address' => '',
        'country' => 'Thailand',
        'currency' => 'THB',
        // Display theme, system-wide
        'theme_accent' => '#2563eb',
        'theme_density' => 'normal',
        'theme_radius' => '10',
        // Date and time display, system-wide (App\Support\DateDisplay)
        'date_format' => 'dmy_slash',
        'date_era' => 'ce',
        'time_format' => '24',
        // Notification sound, system-wide, signed-in only
        'notification_sound' => NotificationSounds::DEFAULT,
        'notification_sound_enabled' => '1',
    ];

    /** @var array<string, string> */
    private const ASSET_STATUS_COLOR_DEFAULTS = [
        'deployed' => '#0284c7',
        'ready' => '#059669',
        'pending_acceptance' => '#d97706',
        'pending_return' => '#7c3aed',
        'common' => '#64748b',
        'writeoff' => '#dc2626',
    ];

    public function __construct(private readonly EmployeeService $employees) {}

    /** @return array<string, mixed> */
    public function payload(): array
    {
        $values = [];
        foreach (self::DEFAULTS as $key => $default) {
            $values[$key] = AppSetting::get($key, $default);
        }
        // Same rule as the server-rendered page title (AppSetting::brandName())
        $values['brand_name'] = AppSetting::brandName();
        $values['theme_radius'] = (int) $values['theme_radius'];
        $values['vapid_public_key'] = (string) config('webpush.vapid.public_key');

        $logoPath = AppSetting::get('logo_path');
        $values['logo_url'] = $logoPath ? Storage::disk('public')->url($logoPath) : null;

        // The role a new employee really gets (default Role Group); null when none is set, read by SetCredentialsModal
        $values['default_employee_role_label'] = $this->employees->defaultRoleForNewEmployee()?->name;

        // Saved asset colours merged over the defaults
        $stored = json_decode((string) AppSetting::get('asset_status_colors', '{}'), true);
        $values['asset_status_colors'] = array_merge(self::ASSET_STATUS_COLOR_DEFAULTS, is_array($stored) ? $stored : []);

        // Ticket SLA: priority targets, first response, goal and working window
        $values['ticket_sla'] = TicketSla::targets();
        $values['ticket_sla_response'] = TicketSla::responseMinutes();
        $values['ticket_sla_goal'] = TicketSla::goalPercent();
        $values['ticket_sla_hours'] = TicketSla::hours();
        // Request-type targets as rows, switched-off ones included
        $values['ticket_sla_request'] = SlaTarget::where('scope', SlaScope::RequestType->value)
            ->orderBy('match_value')
            ->get()
            ->map(fn (SlaTarget $target) => [
                'type' => $target->match_value,
                'resolve' => $target->resolve_hours,
                'clock' => $target->clock->value,
                'enabled' => $target->enabled,
            ])->all();
        // Repair targets split into the two halves the screen edits
        $values['ticket_sla_work_class'] = SlaTarget::where('scope', SlaScope::WorkClass->value)
            ->orderBy('match_value')
            ->get()
            ->map(fn (SlaTarget $target) => [
                'category' => explode(':', $target->match_value, 2)[0] ?? '',
                'work_class' => explode(':', $target->match_value, 2)[1] ?? '',
                'resolve' => $target->resolve_hours,
                'clock' => $target->clock->value,
                'enabled' => $target->enabled,
            ])->all();

        return $values;
    }

    /** @return array<string, mixed> */
    public function publicPayload(): array
    {
        return array_intersect_key($this->payload(), array_flip(self::PUBLIC_KEYS));
    }

    /** @param  array<string, mixed>  $values */
    public function saveCompany(array $values): void
    {
        AuditLog::record('Updated company settings', $this->put($values));
    }

    /** @param  array<string, mixed>  $values */
    public function saveBranding(array $values): void
    {
        AuditLog::record('Updated branding settings', $this->put($values));
    }

    /** @param  array<string, mixed>  $values */
    public function saveDisplay(array $values): void
    {
        AuditLog::record('Updated display settings', $this->put($values));
    }

    /** @param  array<string, mixed>  $values */
    public function saveDateTime(array $values): void
    {
        AuditLog::record('Updated date and time settings', $this->put($values));
    }

    /**
     * Stores a section's values (null as '') and returns the audit target: the keys sent.
     *
     * @param  array<string, mixed>  $values
     */
    private function put(array $values): string
    {
        foreach ($values as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }

        return implode(', ', array_keys($values));
    }

    /** @param  array<string, string>  $colors */
    public function saveAssetColors(array $colors): void
    {
        AppSetting::put('asset_status_colors', json_encode($colors));
        AuditLog::record('Updated asset settings', 'asset_status_colors');
    }

    public function saveSound(string $sound, bool $enabled): void
    {
        AppSetting::put('notification_sound', $sound);
        AppSetting::put('notification_sound_enabled', $enabled ? '1' : '0');
        AuditLog::record('Updated notification sound', $sound.($enabled ? ', on' : ', off'));
    }

    /** Replaces the logo (PNG), removing the old file so none pile up. */
    public function uploadLogo(UploadedFile $file): void
    {
        if ($old = AppSetting::get('logo_path')) {
            Storage::disk('public')->delete($old);
        }

        AppSetting::put('logo_path', $file->store('branding', 'public'));
        AuditLog::record('Uploaded logo', 'Branding');
    }

    /** Back to the text-based default; nothing is written when there was no logo. */
    public function deleteLogo(): void
    {
        if ($old = AppSetting::get('logo_path')) {
            Storage::disk('public')->delete($old);
            AppSetting::put('logo_path', null);
            AuditLog::record('Removed logo', 'Branding');
        }
    }
}
