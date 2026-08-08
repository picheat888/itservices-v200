<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Settings\AppSetting;
use App\Models\Settings\MailSetting;
use App\Models\Ticket\Ticket;
use App\Services\Email\EmailNotificationService;
use App\Services\Employee\EmployeeService;
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
        'common' => '#64748b',
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
            // Resolution is per priority; first response is ONE system-wide target
            // (priority doesn't exist yet while a case waits to be taken).
            'ticket_sla' => ['required', 'array'],
            'ticket_sla.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
            'ticket_sla_response' => ['sometimes', 'required', 'integer', 'min:1', 'max:10080'],
            // Working window the SLA clocks count against (days: ISO weekday 1–7).
            'ticket_sla_hours' => ['sometimes', 'required', 'array'],
            'ticket_sla_hours.days' => ['required_with:ticket_sla_hours', 'array', 'min:1'],
            'ticket_sla_hours.days.*' => ['integer', 'between:1,7', 'distinct'],
            'ticket_sla_hours.start' => ['required_with:ticket_sla_hours', 'date_format:H:i'],
            'ticket_sla_hours.end' => ['required_with:ticket_sla_hours', 'date_format:H:i', 'after:ticket_sla_hours.start'],
            // Optional break the clocks skip (e.g. lunch) — null on both = no break.
            'ticket_sla_hours.break_start' => [
                'nullable', 'required_with:ticket_sla_hours.break_end', 'date_format:H:i',
                'after_or_equal:ticket_sla_hours.start', 'before:ticket_sla_hours.end',
            ],
            'ticket_sla_hours.break_end' => [
                'nullable', 'required_with:ticket_sla_hours.break_start', 'date_format:H:i',
                'after:ticket_sla_hours.break_start', 'before_or_equal:ticket_sla_hours.end',
            ],
        ]);

        // Every resolution target (hours) must be at least the first-response target (minutes).
        $validator->after(function ($v) use ($request) {
            $response = (int) $request->input('ticket_sla_response', TicketSla::responseMinutes());
            foreach ((array) $request->input('ticket_sla', []) as $priority => $row) {
                $resolve = (int) (is_array($row) ? ($row['resolve'] ?? 0) : 0);
                if ($response > 0 && $resolve > 0 && $resolve * 60 < $response) {
                    $v->errors()->add("ticket_sla.{$priority}.resolve", 'Resolution must be at least the first-response target.');
                }
            }
        });

        $data = $validator->validate();

        AppSetting::put('ticket_sla', json_encode($data['ticket_sla']));
        if (isset($data['ticket_sla_response'])) {
            AppSetting::put(TicketSla::RESPONSE_KEY, (string) $data['ticket_sla_response']);
        }
        if (isset($data['ticket_sla_hours'])) {
            AppSetting::put(TicketSla::HOURS_KEY, json_encode($data['ticket_sla_hours']));
        }
        TicketSla::flush(); // drop the per-request memo so this response reflects the new values

        // Deadlines are persisted per ticket for SQL ordering — refresh every ticket
        // still in motion under the new targets/window (closed history stays frozen).
        Ticket::query()->whereIn('status', ['open', 'in_progress'])->chunkById(200, function ($tickets) {
            foreach ($tickets as $ticket) {
                // Compute BEFORE disabling timestamps — usesTimestamps()=false also
                // drops the created_at Carbon cast the business-time math needs.
                $dues = [
                    'sla_response_due_at' => TicketSla::responseDueAt($ticket),
                    'sla_resolve_due_at' => TicketSla::resolveDueAt($ticket),
                    // The deadlines moved — stale escalation state must re-evaluate.
                    'sla_response_alert_level' => null,
                    'sla_resolve_alert_level' => null,
                ];
                $ticket->timestamps = false; // a recompute is not an edit — keep updated_at
                $ticket->forceFill($dues)->saveQuietly();
            }
        });

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

        // The role a new employee actually ends up with, asked of the service that puts
        // them there. It resolves through the default Role Group set on the Permission
        // page — the only place an Admin can choose it. Reading a separate
        // `default_employee_role` setting here (as this used to) showed the Add Employee
        // form a role nothing ever assigned, and the two agreed only by accident, while
        // both happened to fall back to Staff.
        //
        // Null on an install with no default Role Group — not filled in with a guess, and
        // nothing here writes. SetCredentialsModal reads the null to say why an account
        // cannot be created yet.
        $values['default_employee_role_label'] = app(EmployeeService::class)->defaultRoleForNewEmployee()?->name;

        // Asset status colors: stored saved values merged over defaults so any
        // status without an explicit override still resolves to a color.
        $stored = json_decode((string) AppSetting::get('asset_status_colors', '{}'), true);
        $values['asset_status_colors'] = array_merge($this->assetStatusColorDefaults, is_array($stored) ? $stored : []);

        // Ticket SLA: per-priority resolution targets, the single first-response
        // target, and the working window — saved values merged over defaults.
        $values['ticket_sla'] = TicketSla::targets();
        $values['ticket_sla_response'] = TicketSla::responseMinutes();
        $values['ticket_sla_hours'] = TicketSla::hours();

        return $values;
    }
}
