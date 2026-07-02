<?php

namespace App\Services\Email;

use App\Jobs\SendTemplatedEmail;
use App\Mail\TemplatedMail;
use App\Models\AppSetting;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Services\MailConfigService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Central send path for system emails. Event-driven sends are queued (per
 * CLAUDE.md); manual test sends are synchronous so the admin gets immediate
 * feedback. Both go through deliver(), which applies the DB SMTP config and
 * records an email_logs row.
 */
class EmailNotificationService
{
    public function __construct(private readonly MailConfigService $mailConfig) {}

    /**
     * Absolute filesystem path of the logo to embed in sent emails (as a CID inline
     * attachment): the admin-uploaded brand logo if usable, otherwise the bundled
     * default PNG (public/logo.png). Returns null when neither exists, so the layout
     * falls back to the text tile. SVG is skipped — email clients don't render it.
     */
    public function brandLogoFile(): ?string
    {
        $custom = AppSetting::get('logo_path');
        if ($custom && ! Str::endsWith(strtolower($custom), '.svg') && Storage::disk('public')->exists($custom)) {
            return Storage::disk('public')->path($custom);
        }

        $default = public_path('logo.png');

        return is_file($default) ? $default : null;
    }

    /**
     * The brand logo as a base64 data URI — used by the in-app preview (a browser
     * iframe) where CID attachments don't resolve. Null when no usable logo.
     */
    public function brandLogoDataUri(): ?string
    {
        $file = $this->brandLogoFile();
        if (! $file) {
            return null;
        }

        return 'data:image/png;base64,'.base64_encode((string) file_get_contents($file));
    }

    /** Substitutes {{variables}} in a string from the given map. */
    public function render(string $text, array $vars): string
    {
        foreach ($vars as $key => $value) {
            $text = str_replace('{{'.$key.'}}', (string) $value, $text);
        }

        return $text;
    }

    /**
     * Queues an enabled template for delivery. No-op if the template is missing
     * or disabled. Variables fill both subject and body placeholders.
     *
     * @param  array<string, mixed>  $vars
     */
    public function sendTemplate(string $key, string $toEmail, array $vars = [], ?string $actionUrl = null, ?string $actionLabel = null): void
    {
        $template = EmailTemplate::where('key', $key)->where('enabled', true)->first();

        if (! $template || empty($toEmail)) {
            return;
        }

        $subject = $this->render($template->subject, $vars);
        $html = $this->render($template->body_html, $vars);

        // The template name doubles as the email's "eyebrow" category label.
        SendTemplatedEmail::dispatch($toEmail, $subject, $html, $key, $actionUrl, $actionLabel, $template->name);
    }

    /** Sends a one-off test email synchronously; returns true on success. */
    public function sendTest(string $toEmail): bool
    {
        $subject = 'Test email';
        $html = '<p>This is a test email from your IT Service Desk.</p>'
            .'<p style="color:#64748b">If you received this, your SMTP settings are working.</p>';

        return $this->deliver($toEmail, $subject, $html, null);
    }

    /**
     * Core send: applies DB SMTP config, sends the mailable, logs the result,
     * and bumps the template's last_sent_at. Returns true on success.
     */
    public function deliver(string $toEmail, string $subject, string $html, ?string $templateKey, ?string $actionUrl = null, ?string $actionLabel = null, ?string $eyebrow = null): bool
    {
        $brand = AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk');
        $subject = "[{$brand}] {$subject}";

        $this->mailConfig->apply();

        try {
            Mail::to($toEmail)->send(new TemplatedMail($subject, $html, $eyebrow, $actionUrl, $actionLabel, $brand, $this->brandLogoFile()));
            $status = 'sent';
            $error = null;
        } catch (\Throwable $e) {
            $status = 'failed';
            $error = $e->getMessage();
            Log::warning('Email send failed', ['to' => $toEmail, 'error' => $error]);
        }

        EmailLog::create([
            'template_key' => $templateKey,
            'to_email' => $toEmail,
            'subject' => $subject,
            'status' => $status,
            'error' => $error,
        ]);

        if ($status === 'sent' && $templateKey) {
            EmailTemplate::where('key', $templateKey)->update(['last_sent_at' => now()]);
        }

        return $status === 'sent';
    }
}
