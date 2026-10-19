<?php

namespace App\Services\Email;

use App\Jobs\SendTemplatedEmail;
use App\Mail\TemplatedMail;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Models\Settings\MailSetting;
use App\Services\Settings\MailConfigService;
use App\Support\EmailTemplates;
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
    public const DELIVERY_RATE_DAYS = 30;

    public const NOT_CONFIGURED_ERROR = 'SMTP is not set up in Settings > Email: the message was written to the mail log file, not sent';

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

    /**
     * The subject as it leaves the building: every outgoing mail is prefixed with the brand.
     *
     * Lives here rather than inside deliver() because a send that never happens is logged
     * without going through it, and a `skipped` row recording the bare subject made the same
     * email look like two different ones depending on whether it reached anybody.
     */
    private function brandedSubject(string $subject): string
    {
        $brand = AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk');

        return "[{$brand}] {$subject}";
    }

    /**
     * Variables every template gets without any caller passing them.
     *
     * The system's own name was written into the wording as "the IT portal", so renaming the
     * installation left the emails calling it something nobody recognised. It belongs here
     * rather than in each service's variable map: none of them should have to remember a
     * value that has nothing to do with what they are notifying about.
     *
     * @return array<string, string>
     */
    private function globalVars(): array
    {
        return [
            'app.name' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
        ];
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
     * Queues an enabled template for delivery, or records why it could not be sent.
     *
     * The address is nullable on purpose: callers used to check `if (! $user->email)` and
     * return where they stood, seven services each dropping the message their own silent
     * way. Whether somebody can be emailed is one decision, and it belongs here — where
     * there is a log to write it down in. A recipient with no address produces a `skipped`
     * row naming them, so "nobody told them" is a fact somebody can look up rather than a
     * thing that quietly never happened.
     *
     * A missing or disabled template is not logged: that is the administrator's own switch,
     * and every send would otherwise write a row saying they turned it off.
     *
     * @param  array<string, mixed>  $vars
     */
    public function sendTemplate(
        string $key,
        ?string $toEmail,
        array $vars = [],
        ?string $actionUrl = null,
        ?string $actionLabel = null,
        ?string $recipientName = null,
    ): void {
        $template = EmailTemplate::where('key', $key)->where('enabled', true)->first();

        if (! $template) {
            return;
        }

        $vars += $this->globalVars();
        // Subject is plain text: undo the HTML escaping callers apply to vars meant for the body.
        $subject = html_entity_decode($this->render($template->subject, $vars), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $html = $this->render($template->body_html, $vars);

        if (blank($toEmail)) {
            // Branded like a real send: the row records what they would have received
            $this->writeLog([
                'template_key' => $key,
                'to_email' => null,
                'recipient_name' => $recipientName,
                'subject' => $this->brandedSubject($subject),
                'body_html' => $html,
                'action' => $this->actionRecord($actionUrl, $actionLabel),
                'status' => 'skipped',
                'error' => 'Recipient has no email address',
            ]);

            return;
        }

        // The template name doubles as the email's "eyebrow" category label.
        SendTemplatedEmail::dispatch($toEmail, $subject, $html, $key, $actionUrl, $actionLabel, $template->name, $recipientName);
    }

    /**
     * An enabled template rendered with $vars (plus the global ones), or null when the
     * administrator has it switched off — for senders already in the worker that call
     * deliver() themselves (a scheduled report, which carries an attachment).
     *
     * @param  array<string, mixed>  $vars
     * @return array{subject: string, html: string, eyebrow: string}|null
     */
    public function renderTemplate(string $key, array $vars): ?array
    {
        $template = EmailTemplate::where('key', $key)->where('enabled', true)->first();
        if (! $template) {
            return null;
        }

        $vars += $this->globalVars();

        return [
            'subject' => html_entity_decode($this->render($template->subject, $vars), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'html' => $this->render($template->body_html, $vars),
            'eyebrow' => $template->name,
        ];
    }

    /** Sends a one-off test email synchronously; returns true on success. */
    public function sendTest(string $toEmail): bool
    {
        $subject = 'Test email';
        $html = '<p>This is a test email from your IT Service Desk.</p>'
            .'<p style="color:#64748b">If you received this, your SMTP settings are working.</p>';

        return $this->deliver($toEmail, $subject, $html, null, isTest: true);
    }

    /**
     * Core send: applies DB SMTP config, sends the mailable, logs the result,
     * and bumps the template's last_sent_at (not for a test). Returns true on success.
     */
    public function deliver(string $toEmail, string $subject, string $html, ?string $templateKey, ?string $actionUrl = null, ?string $actionLabel = null, ?string $eyebrow = null, ?string $recipientName = null, ?string $attachmentPath = null, ?string $attachmentName = null, bool $isTest = false): bool
    {
        $brand = AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk');
        $subject = $this->brandedSubject($subject);

        $this->mailConfig->apply();
        // No SMTP in Settings and the .env fallback only writes to a log file
        $logOnly = config('mail.mailers.'.config('mail.default').'.transport') === 'log';

        try {
            Mail::to($toEmail)->send(new TemplatedMail($subject, $html, $eyebrow, $actionUrl, $actionLabel, $brand, $this->brandLogoFile(), EmailTemplates::widthFor($templateKey), $attachmentPath, $attachmentName));
            $status = $logOnly ? 'failed' : 'sent';
            $error = $logOnly ? self::NOT_CONFIGURED_ERROR : null;
        } catch (\Throwable $e) {
            $status = 'failed';
            // The mailer's own words, kept verbatim on purpose. Whoever reads the delivery
            // log is the person who has to fix the mail server, and a friendlier sentence
            // would drop the part they need — the malformed address, the refused
            // connection, the rejecting host. Deliberately not translated or summarised.
            $error = $e->getMessage();
            Log::warning('Email send failed', ['to' => $toEmail, 'error' => $error]);
        }

        // The rendered message only; the frame is rebuilt from the layout when the log is read
        $this->writeLog([
            'template_key' => $templateKey,
            'to_email' => $toEmail,
            'recipient_name' => $recipientName,
            'subject' => $subject,
            'body_html' => $html,
            'action' => $this->actionRecord($actionUrl, $actionLabel),
            'status' => $status,
            'is_test' => $isTest,
            'error' => $error,
        ]);

        // toBase(): a send is not an edit, so updated_at stays put
        if ($status === 'sent' && $templateKey && ! $isTest) {
            EmailTemplate::where('key', $templateKey)->toBase()->update(['last_sent_at' => now()]);
        }

        return $status === 'sent';
    }

    /**
     * Sent today and the 30-day delivery rate, real sends only. Tests are left out, and so
     * are mails that never left because SMTP was not set up; with no SMTP the rate is null.
     *
     * @return array{sent_today: int, delivery_rate: ?float, delivery_sent: int, delivery_attempts: int, mail_configured: bool}
     */
    public function deliveryStats(): array
    {
        $real = fn () => EmailLog::query()->where('is_test', false);
        $since = now()->subDays(self::DELIVERY_RATE_DAYS);

        $sent = $real()->where('status', 'sent')->where('created_at', '>=', $since)->count();
        $failed = $real()->where('status', 'failed')->where('created_at', '>=', $since)
            ->where(fn ($q) => $q->whereNull('error')->orWhere('error', '!=', self::NOT_CONFIGURED_ERROR))
            ->count();
        $attempts = $sent + $failed;
        $configured = MailSetting::current()->isConfigured();

        return [
            'sent_today' => $real()->where('status', 'sent')->whereBetween('created_at', [today(), today()->endOfDay()])->count(),
            'delivery_rate' => $configured && $attempts > 0 ? round($sent / $attempts * 100, 1) : null,
            'delivery_sent' => $sent,
            'delivery_attempts' => $attempts,
            'mail_configured' => $configured,
        ];
    }

    /** @return array{url?: string, label?: string} the button the mail carried; [] when it had none */
    private function actionRecord(?string $actionUrl, ?string $actionLabel): array
    {
        return filled($actionUrl) ? ['url' => $actionUrl, 'label' => $actionLabel ?: 'Open in portal'] : [];
    }

    /**
     * A failed log write never fails a mail that already went out.
     *
     * @param  array<string, mixed>  $row
     */
    private function writeLog(array $row): void
    {
        // Characters, not display width: Thai marks have zero width but fill the varchar(255)
        $subject = (string) $row['subject'];
        $row['subject'] = mb_strlen($subject) > 255 ? mb_substr($subject, 0, 254).'…' : $subject;

        try {
            EmailLog::create($row);
        } catch (\Throwable $e) {
            Log::warning('Email log write failed', ['to' => $row['to_email'], 'template' => $row['template_key'], 'error' => $e->getMessage()]);
        }
    }
}
