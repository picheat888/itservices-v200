<?php

// Settings -> Security: idle timeout, password expiry, device limit and retention windows (route permission settings.security).

namespace App\Http\Requests\Settings;

use App\Http\Requests\Auth\LoginRequest;
use App\Services\Settings\SecuritySettingsService;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class UpdateSecuritySettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // 0 turns a policy off (keep forever for retention); the timeout is capped at the server session
            'session_timeout_minutes' => ['required', 'integer', 'min:0', 'max:'.SecuritySettingsService::sessionLifetimeMinutes()],
            'password_expiry_days' => ['required', 'integer', 'min:0', 'max:3650'],
            // Later-added keys are `sometimes`, so a client sending only the first two keeps working
            'email_log_body_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
            'email_log_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
            'audit_log_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
            'notification_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
            'login_log_days' => ['sometimes', 'integer', 'min:0', 'max:3650', $this->atLeastKnownIpDays(...)],
            'device_limit' => ['sometimes', 'integer', 'min:0', 'max:10'],
        ];
    }

    /** The Login log is kept forever (0) or at least as long as the sign-in rule looks back for a known IP. */
    private function atLeastKnownIpDays(string $attribute, mixed $value, Closure $fail): void
    {
        $days = (int) $value;
        if ($days > 0 && $days < LoginRequest::KNOWN_IP_DAYS) {
            $fail('validation.login_log_days_min')->translate(['days' => LoginRequest::KNOWN_IP_DAYS]);
        }
    }
}
