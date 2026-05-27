<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\MailSetting;
use App\Models\Role;
use App\Services\EmailNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    /** @var array<string, string> */
    private array $defaults = [
        'brand_name' => '',          // falls back to config('app.name')
        'brand_sub' => 'Service Desk',
        'company_name' => 'Thai Inaba Foods Co., Ltd.',
        'legal_name' => 'บริษัท ไทย อินาบะ ฟู้ดส์ จำกัด',
        'tax_id' => '',
        'industry' => 'Food manufacturing',
        'address' => '',
        'country' => 'Thailand',
        'currency' => 'THB',
        'timezone' => 'Asia/Bangkok',
        // Display theme — system-wide (shared by all users), not per-user.
        'theme_accent' => '#2563eb',
        'theme_density' => 'normal',
        'theme_radius' => '10',
    ];

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->payload(), 'message' => 'success']);
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);

        // 'sometimes' lets each Settings tab send only its own fields (Company,
        // Branding, or Display) — only the keys present get validated & saved.
        $data = $request->validate([
            'brand_name' => ['sometimes', 'required', 'string', 'max:60'],
            'brand_sub' => ['sometimes', 'nullable', 'string', 'max:60'],
            'company_name' => ['sometimes', 'required', 'string', 'max:150'],
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'tax_id' => ['sometimes', 'nullable', 'string', 'max:50'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency' => ['sometimes', 'nullable', 'string', 'max:20'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:60'],
            'theme_accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme_density' => ['sometimes', 'in:compact,normal,cozy'],
            'theme_radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }
        AuditLog::record('Updated settings', implode(', ', array_keys($data)));

        return $this->show();
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);

        $request->validate([
            // SVG mime is image/svg+xml; png covers raster. Max 2MB per the design.
            'logo' => ['required', 'file', 'mimes:png,svg,svg+xml', 'max:2048'],
        ]);

        // Replace any previous logo so we don't accumulate orphans.
        if ($old = AppSetting::get('logo_path')) {
            Storage::disk('public')->delete($old);
        }

        $path = $request->file('logo')->store('branding', 'public');
        AppSetting::put('logo_path', $path);
        AuditLog::record('Uploaded logo', 'Branding');

        return $this->show();
    }

    /** Removes the custom logo and reverts to the text-based default. */
    public function deleteLogo(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);

        if ($old = AppSetting::get('logo_path')) {
            Storage::disk('public')->delete($old);
            AppSetting::put('logo_path', null);
            AuditLog::record('Removed logo', 'Branding');
        }

        return $this->show();
    }

    /**
     * Returns the security policy values. Readable by any authenticated user
     * because the frontend session-timeout hook needs the timeout on every load.
     */
    public function security(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->securityPayload(), 'message' => 'success']);
    }

    /** Updates the security policy (session timeout + password expiry). Super only. */
    public function updateSecurity(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);

        $data = $request->validate([
            // 0 disables the respective policy.
            'session_timeout_minutes' => ['required', 'integer', 'min:0', 'max:1440'],
            'password_expiry_days' => ['required', 'integer', 'min:0', 'max:3650'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, (string) $value);
        }
        AuditLog::record('Updated security settings', implode(', ', array_keys($data)));

        return $this->security($request);
    }

    /**
     * @return array{session_timeout_minutes: int, password_expiry_days: int}
     */
    private function securityPayload(): array
    {
        return [
            'session_timeout_minutes' => (int) AppSetting::get('session_timeout_minutes', '0'),
            'password_expiry_days' => (int) AppSetting::get('password_expiry_days', '0'),
        ];
    }

    /** Returns the SMTP settings with the password masked (never sent to the client). */
    public function mailSettings(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.edit_settings'), 403);

        $s = MailSetting::current();

        return response()->json([
            'data' => [
                'host' => $s->host,
                'port' => $s->port,
                'username' => $s->username,
                'has_password' => ! empty($s->password),
                'encryption' => $s->encryption,
                'from_address' => $s->from_address,
                'from_name' => $s->from_name,
            ],
            'message' => 'success',
        ]);
    }

    /** Updates the SMTP settings. A blank password leaves the stored one intact. */
    public function updateMailSettings(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.edit_settings'), 403);

        $data = $request->validate([
            'host' => ['nullable', 'string', 'max:255'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
            'encryption' => ['nullable', 'in:tls,ssl'],
            'from_address' => ['nullable', 'email', 'max:255'],
            'from_name' => ['nullable', 'string', 'max:255'],
        ]);

        $s = MailSetting::current();

        // Only overwrite the password when a new one is provided.
        if (($data['password'] ?? '') === '') {
            unset($data['password']);
        }

        $s->update($data);
        AuditLog::record('Updated mail settings', 'SMTP');

        return $this->mailSettings($request);
    }

    /** Sends a test email to the current user using the saved SMTP config. */
    public function testMail(Request $request, EmailNotificationService $service): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.edit_settings'), 403);

        if (! MailSetting::current()->isConfigured()) {
            return response()->json(['message' => 'SMTP is not configured. Please fill in Host and From Address first.', 'sent' => false], 422);
        }

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'Your account has no email address.'], 422);
        }

        $ok = $service->sendTest($to);

        return response()->json(['message' => $ok ? 'success' : 'failed', 'sent' => $ok, 'to' => $to], $ok ? 200 : 502);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        $values = [];
        foreach ($this->defaults as $key => $default) {
            $values[$key] = AppSetting::get($key, $default);
        }
        $values['brand_name'] = $values['brand_name'] ?: config('app.name', 'IT Services');
        $values['theme_radius'] = (int) $values['theme_radius'];

        $logoPath = AppSetting::get('logo_path');
        $values['logo_url'] = $logoPath ? Storage::disk('public')->url($logoPath) : null;

        $defaultRole = AppSetting::get('default_employee_role', 'user');
        $values['default_employee_role'] = $defaultRole;
        $values['default_employee_role_label'] = Role::where('key', $defaultRole)->value('name') ?? $defaultRole;

        return $values;
    }
}
