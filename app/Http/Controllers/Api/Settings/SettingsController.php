<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateAssetColorsRequest;
use App\Http\Requests\Settings\UpdateBrandingSettingsRequest;
use App\Http\Requests\Settings\UpdateCompanySettingsRequest;
use App\Http\Requests\Settings\UpdateDateTimeSettingsRequest;
use App\Http\Requests\Settings\UpdateDisplaySettingsRequest;
use App\Http\Requests\Settings\UpdateMailSettingsRequest;
use App\Http\Requests\Settings\UpdateSecuritySettingsRequest;
use App\Http\Requests\Settings\UpdateSlaSettingsRequest;
use App\Http\Requests\Settings\UpdateSoundSettingsRequest;
use App\Http\Requests\Settings\UploadLogoRequest;
use App\Models\Settings\MailSetting;
use App\Services\Auth\DeviceService;
use App\Services\Email\EmailNotificationService;
use App\Services\Settings\MailSettingsService;
use App\Services\Settings\SecuritySettingsService;
use App\Services\Settings\SettingsService;
use App\Services\Settings\SlaSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** System settings; every save is gated by its route's permission middleware and answers with the settings it changed. */
class SettingsController extends Controller
{
    public function __construct(private readonly SettingsService $settings) {}

    /** Outside the sign-in check (the login page themes itself from it): a guest gets the public keys only. */
    public function show(?Request $request = null): JsonResponse
    {
        $guest = ($request ?? request())->user('sanctum') === null;

        return response()->json(['data' => $guest ? $this->settings->publicPayload() : $this->settings->payload(), 'message' => 'success']);
    }

    public function updateCompany(UpdateCompanySettingsRequest $request): JsonResponse
    {
        $this->settings->save($request->validated(), 'Updated company settings');

        return $this->show();
    }

    public function updateBranding(UpdateBrandingSettingsRequest $request): JsonResponse
    {
        $this->settings->save($request->validated(), 'Updated branding settings');

        return $this->show();
    }

    public function updateAssets(UpdateAssetColorsRequest $request): JsonResponse
    {
        $this->settings->saveAssetColors($request->validated('asset_status_colors'));

        return $this->show();
    }

    public function updateSla(UpdateSlaSettingsRequest $request, SlaSettingsService $sla): JsonResponse
    {
        $sla->save($request->validated());

        return $this->show();
    }

    public function updateDisplay(UpdateDisplaySettingsRequest $request): JsonResponse
    {
        $this->settings->save($request->validated(), 'Updated display settings');

        return $this->show();
    }

    public function updateDateTime(UpdateDateTimeSettingsRequest $request): JsonResponse
    {
        $this->settings->save($request->validated(), 'Updated date and time settings');

        return $this->show();
    }

    public function updateSound(UpdateSoundSettingsRequest $request): JsonResponse
    {
        $this->settings->saveSound($request->validated('sound'), (bool) $request->validated('enabled'));

        return $this->show();
    }

    public function uploadLogo(UploadLogoRequest $request): JsonResponse
    {
        $this->settings->uploadLogo($request->file('logo'));

        return $this->show();
    }

    public function deleteLogo(): JsonResponse
    {
        $this->settings->deleteLogo();

        return $this->show();
    }

    /** Any signed-in user may read these: the session-timeout hook needs the timeout on every load. */
    public function security(SecuritySettingsService $security): JsonResponse
    {
        return response()->json(['data' => $security->payload(), 'message' => 'success']);
    }

    public function updateSecurity(UpdateSecuritySettingsRequest $request, SecuritySettingsService $security, DeviceService $devices): JsonResponse
    {
        // The saving admin's own device stays when the limit trims the rest
        $security->update($request->validated(), fn () => $devices->currentOf($request->user(), $request)?->id);

        return $this->security($security);
    }

    /** The SMTP settings with the password masked. */
    public function mailSettings(MailSettingsService $mail): JsonResponse
    {
        return response()->json(['data' => $mail->payload(), 'message' => 'success']);
    }

    public function updateMailSettings(UpdateMailSettingsRequest $request, MailSettingsService $mail): JsonResponse
    {
        $mail->update($request->validated());

        return $this->mailSettings($mail);
    }

    /** Sends a test email to the current user with the saved SMTP settings. */
    public function testMail(Request $request, EmailNotificationService $service): JsonResponse
    {
        if (! MailSetting::current()->isConfigured()) {
            return response()->json(['message' => 'smtp_not_configured', 'sent' => false], 422);
        }

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'no_email'], 422);
        }

        $ok = $service->sendTest($to);

        // 200 either way: a failed delivery is the result being reported, not a server fault
        return response()->json(['message' => $ok ? 'success' : 'failed', 'sent' => $ok, 'to' => $to]);
    }
}
