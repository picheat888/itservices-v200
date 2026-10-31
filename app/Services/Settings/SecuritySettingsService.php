<?php

// Security policy settings: what they read as, and a save that audits only what changed and signs out devices over a new limit.

namespace App\Services\Settings;

use App\Console\Commands\UpdateGeoIpDatabase;
use App\Models\AuditLog;
use App\Models\Settings\AppSetting;
use App\Services\Auth\DeviceService;
use Closure;

class SecuritySettingsService
{
    public function __construct(
        private readonly DeviceService $devices,
        private readonly LogRetentionService $retention,
    ) {}

    /** The longest idle timeout that can hold: the server session's lifetime (SESSION_LIFETIME), at most a day. */
    public static function sessionLifetimeMinutes(): int
    {
        return min(1440, (int) config('session.lifetime'));
    }

    /**
     * @return array{session_timeout_minutes: int, session_lifetime_minutes: int, session_timeout_effective_minutes: int, password_expiry_days: int, email_log_body_days: int, email_log_days: int, audit_log_days: int, notification_days: int, login_log_days: int, device_limit: int, geoip_updated_at: string|null}
     */
    public function payload(): array
    {
        $timeout = (int) AppSetting::get('session_timeout_minutes', '0');
        $lifetime = self::sessionLifetimeMinutes();

        return [
            'session_timeout_minutes' => $timeout,
            // Read-only: the cap, and the timeout the server really enforces (what the SPA's idle timer counts)
            'session_lifetime_minutes' => $lifetime,
            'session_timeout_effective_minutes' => $timeout > 0 ? min($timeout, $lifetime) : 0,
            'password_expiry_days' => (int) AppSetting::get('password_expiry_days', '0'),
            // Defaults live on the service that enforces them, so the screen and the nightly sweep agree
            'email_log_body_days' => $this->retention->days('email_log_body_days'),
            'email_log_days' => $this->retention->days('email_log_days'),
            'audit_log_days' => $this->retention->days('audit_log_days'),
            'notification_days' => $this->retention->days('notification_days'),
            'login_log_days' => $this->retention->days('login_log_days'),
            'device_limit' => $this->devices->limit(),
            // Read-only: when the GeoIP file was last replaced
            'geoip_updated_at' => UpdateGeoIpDatabase::lastUpdated()?->toIso8601String(),
        ];
    }

    /**
     * Saves the policy values; turning the device limit on or lowering it signs out the extra devices but the saver's own.
     *
     * @param  array<string, int>  $data  validated by UpdateSecuritySettingsRequest
     * @param  Closure(): ?int  $keepDeviceId  the saver's device, looked up only when devices are trimmed
     */
    public function update(array $data, Closure $keepDeviceId): void
    {
        $previousDeviceLimit = $this->devices->limit();
        $before = $this->payload();

        foreach ($data as $key => $value) {
            AppSetting::put($key, (string) $value);
        }
        $this->recordChanges($before, $data);

        if (isset($data['device_limit'])) {
            $newLimit = (int) $data['device_limit'];
            $isTurnedOnOrLowered = $newLimit > 0 && ($previousDeviceLimit === 0 || $newLimit < $previousDeviceLimit);
            if ($isTurnedOnOrLowered) {
                $this->devices->trimTo($newLimit, $keepDeviceId());
            }
        }
    }

    /**
     * One audit row with each setting that really changed, old and new value; a save that changes nothing writes none.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, int>  $saved
     */
    private function recordChanges(array $before, array $saved): void
    {
        $changes = [];
        foreach ($saved as $key => $value) {
            if ((int) $before[$key] !== (int) $value) {
                $changes[$key] = ['from' => (int) $before[$key], 'to' => (int) $value];
            }
        }

        if ($changes !== []) {
            AuditLog::record('Updated security settings', implode(', ', array_keys($changes)), ['changes' => $changes]);
        }
    }
}
