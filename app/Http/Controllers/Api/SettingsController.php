<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\MailSetting;
use App\Models\Role;
use App\Services\EmailNotificationService;
use App\Support\TicketSla;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class SettingsController extends Controller
{
    /** @var array<string, string> */
    private array $defaults = [
        'brand_name' => '',          // falls back to config('app.name')
        'brand_sub' => 'Service Desk',
        'company_name' => 'ABCD Electric Company',
        'legal_name' => 'บริษัท เอบีซีดี อิเล็กทริก จำกัด',
        'tax_id' => '0105540087000',
        'industry' => 'Electronics manufacturing',
        'address' => '99/9 หมู่ 5 นิคมอุตสาหกรรมอมตะซิตี้ ต.ดอนหัวฬอ อ.เมืองชลบุรี จ.ชลบุรี 20000',
        'country' => 'Thailand',
        'currency' => 'THB',
        'timezone' => 'Asia/Bangkok',
        // Display theme — system-wide (shared by all users), not per-user.
        'theme_accent' => '#2563eb',
        'theme_density' => 'normal',
        'theme_radius' => '10',
    ];

    /**
     * Default asset status badge colors (system-wide). Editable from
     * Settings -> Assets; stored as JSON under the `asset_status_colors` key.
     *
     * @var array<string, string>
     */
    private array $assetStatusColorDefaults = [
        'deployed' => '#0284c7',
        'ready' => '#059669',
        'pending_acceptance' => '#d97706',
        'pending_return' => '#d97706',
        'maintenance' => '#d97706',
        'writeoff' => '#dc2626',
    ];

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->payload(), 'message' => 'success']);
    }

    /** Company information (Settings -> Company). Gated by route middleware permission:settings.company. */
    public function updateCompany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['sometimes', 'required', 'string', 'max:150'],
            'legal_name' => ['sometimes', 'required', 'string', 'max:150'],
            'tax_id' => ['sometimes', 'required', 'digits:13'],
            'industry' => ['sometimes', 'required', 'string', 'max:100'],
            'address' => ['sometimes', 'required', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency' => ['sometimes', 'nullable', 'string', 'max:20'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }
        AuditLog::record('Updated company settings', implode(', ', array_keys($data)));

        return $this->show();
    }

    /** Branding name/subtitle (Settings -> Branding). Logo upload/delete are separate routes, same permission. */
    public function updateBranding(Request $request): JsonResponse
    {
        $data = $request->validate([
            'brand_name' => ['sometimes', 'required', 'string', 'max:60'],
            'brand_sub' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }
        AuditLog::record('Updated branding settings', implode(', ', array_keys($data)));

        return $this->show();
    }

    /** Asset status badge colors (Settings -> Assets). Gated by permission:settings.assets. */
    public function updateAssets(Request $request): JsonResponse
    {
        $data = $request->validate([
            'asset_status_colors' => ['required', 'array'],
            'asset_status_colors.*' => ['string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        AppSetting::put('asset_status_colors', json_encode($data['asset_status_colors']));
        AuditLog::record('Updated asset settings', 'asset_status_colors');

        return $this->show();
    }

    /** Per-priority ticket SLA targets (Settings -> Ticket & SLA). Gated by permission:settings.sla. */
    public function updateSla(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'ticket_sla' => ['required', 'array'],
            'ticket_sla.*.response' => ['required', 'integer', 'min:1', 'max:10080'],
            'ticket_sla.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
        ]);

        // Resolution (hours) must be at least the first-response target (minutes).
        $validator->after(function ($v) use ($request) {
            foreach ((array) $request->input('ticket_sla', []) as $priority => $row) {
                $response = (int) ($row['response'] ?? 0);
                $resolve = (int) ($row['resolve'] ?? 0);
                if ($response > 0 && $resolve > 0 && $resolve * 60 < $response) {
                    $v->errors()->add("ticket_sla.{$priority}.resolve", 'Resolution must be at least the first-response target.');
                }
            }
        });

        $data = $validator->validate();

        AppSetting::put('ticket_sla', json_encode($data['ticket_sla']));
        AuditLog::record('Updated SLA settings', 'ticket_sla');

        return $this->show();
    }

    /** System-wide display theme (Settings -> Display). Gated by permission:settings.display. */
    public function updateDisplay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme_accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme_density' => ['sometimes', 'in:compact,normal,cozy'],
            'theme_radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, (string) $value);
        }
        AuditLog::record('Updated display settings', implode(', ', array_keys($data)));

        return $this->show();
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            // PNG only — the logo is also used in emails, where SVG doesn't render.
            'logo' => ['required', 'file', 'mimes:png', 'max:2048'],
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

    /** Updates the security policy (session timeout + password expiry). Gated by route middleware permission:settings.security. */
    public function updateSecurity(Request $request): JsonResponse
    {
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
        $s = MailSetting::current();
        // Password is required only on first setup; once one is stored, leaving the
        // field blank keeps the existing password.
        $hasPassword = filled($s->password);

        $data = $request->validate([
            'host' => ['required', 'string', 'max:255'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'username' => ['required', 'string', 'max:255'],
            'password' => [$hasPassword ? 'nullable' : 'required', 'string', 'max:255'],
            'encryption' => ['nullable', 'in:tls,ssl'],
            'from_address' => ['required', 'email', 'max:255'],
            'from_name' => ['required', 'string', 'max:255'],
        ]);

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

        // Asset status colors: stored saved values merged over defaults so any
        // status without an explicit override still resolves to a color.
        $stored = json_decode((string) AppSetting::get('asset_status_colors', '{}'), true);
        $values['asset_status_colors'] = array_merge($this->assetStatusColorDefaults, is_array($stored) ? $stored : []);

        // Ticket SLA targets: saved values merged over defaults (see TicketSla).
        $values['ticket_sla'] = TicketSla::targets();

        return $values;
    }
}
