<?php

// The email template page: list with stats, the rights a save needs, save, reset to standard, test send and live preview.

namespace App\Services\Email;

use App\Models\AuditLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Models\Settings\MailSetting;
use App\Models\User;
use App\Support\EmailSampleVars;
use App\Support\EmailTemplates;
use Illuminate\Database\Eloquent\Collection;

class EmailTemplateService
{
    public function __construct(private readonly EmailNotificationService $mail) {}

    /** @return Collection<int, EmailTemplate> */
    public function templates(): Collection
    {
        return EmailTemplate::with('updater.employee')->orderBy('id')->get();
    }

    /**
     * The page's header stats.
     *
     * @param  Collection<int, EmailTemplate>  $templates
     * @return array<string, mixed>
     */
    public function stats(Collection $templates): array
    {
        return [
            'templates' => $templates->count(),
            'enabled' => $templates->where('enabled', true)->count(),
            ...$this->mail->deliveryStats(),
        ];
    }

    /**
     * The address recipients will see the mail come from, resolved as MailConfigService does at send time.
     *
     * @return array{from_address: ?string, from_name: ?string}
     */
    public function fromIdentity(): array
    {
        $settings = MailSetting::current();
        $configured = $settings->isConfigured();

        return [
            'from_address' => $configured ? $settings->from_address : (string) config('mail.from.address'),
            'from_name' => ($configured ? $settings->from_name : null) ?: (string) config('mail.from.name'),
        ];
    }

    /**
     * The rights a save needs, from what it changes against the stored row: toggle first, then edit; nothing changed needs neither.
     *
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    public function requiredRights(EmailTemplate $template, array $data): array
    {
        $togglesIt = array_key_exists('enabled', $data) && (bool) $data['enabled'] !== (bool) $template->enabled;
        $rewordsIt = collect(['name', 'subject', 'body_html'])
            ->contains(fn (string $field) => array_key_exists($field, $data) && $data[$field] !== $template->{$field});

        return array_values(array_filter([
            $togglesIt ? 'notifications.email_toggle' : null,
            $rewordsIt ? 'notifications.email_edit' : null,
        ]));
    }

    /** @param  array<string, mixed>  $data */
    public function update(EmailTemplate $template, array $data): EmailTemplate
    {
        $before = $template->getOriginal();
        $template->update($data);
        AuditLog::record('Updated email template', $template->name, AuditLog::changes($before, $template), subject: $template);

        return $template;
    }

    /** Back to the standard wording and switch; false when the template has no standard. */
    public function reset(EmailTemplate $template): bool
    {
        $standard = EmailTemplates::find($template->key);
        if ($standard === null) {
            return false;
        }

        $before = $template->getOriginal();
        $template->update($this->standardValues($standard));
        AuditLog::record('Reset email template to standard', $template->name, AuditLog::changes($before, $template), subject: $template);

        return true;
    }

    /** Every standard template back to its standard; audits only the rows it changed. Returns how many standard rows exist. */
    public function resetAll(): int
    {
        $count = 0;
        foreach (EmailTemplates::all() as $standard) {
            $template = EmailTemplate::where('key', $standard['key'])->first();
            if ($template === null) {
                continue;
            }

            $before = $template->getOriginal();
            $template->update($this->standardValues($standard));
            if ($template->wasChanged()) {
                AuditLog::record('Reset email template to standard', $template->name, AuditLog::changes($before, $template), subject: $template);
            }
            $count++;
        }

        return $count;
    }

    /**
     * Sends the editor's unsaved wording (or the stored row) to $to with sample values; whether it was delivered.
     *
     * @param  array<string, string>  $draft  filled fields only
     */
    public function sendTest(EmailTemplate $template, array $draft, User $user, string $to): bool
    {
        $vars = EmailSampleVars::for($user);
        $subject = $this->mail->render($draft['subject'] ?? $template->subject, $vars);
        $html = $this->mail->render($draft['body_html'] ?? $template->body_html, $vars);

        // The send time keeps two test sends from threading into one conversation
        $subject .= ' (test '.now()->format('H:i').')';

        // Same wrapper, eyebrow and sample Quick link as a real send
        return $this->mail->deliver(
            $to,
            $subject,
            $html,
            $template->key,
            rtrim((string) config('app.url'), '/').'/',
            'Open in portal',
            $draft['name'] ?? $template->name,
            isTest: true,
        );
    }

    /**
     * Unsaved editor content through the branded layout with sample values and an inert Quick link.
     *
     * @param  array{key?: ?string, name?: ?string, subject?: ?string, body_html?: ?string}  $data
     */
    public function preview(array $data, ?User $user): string
    {
        $vars = EmailSampleVars::for($user);

        return view('emails.templated', [
            'subjectLine' => $this->mail->render($data['subject'] ?? '', $vars),
            'bodyHtml' => $this->mail->render($data['body_html'] ?? '', $vars),
            'eyebrow' => $data['name'] ?? null,
            'width' => EmailTemplates::widthFor($data['key'] ?? null),
            'actionUrl' => rtrim((string) config('app.url'), '/').'/',
            'actionLabel' => 'Open in portal',
            'brand' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'logoData' => $this->mail->brandLogoDataUri(),
            'preview' => true,
        ])->render();
    }

    /**
     * @param  array<string, mixed>  $standard
     * @return array<string, mixed>
     */
    private function standardValues(array $standard): array
    {
        return [
            'name' => $standard['name'],
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
            'enabled' => $standard['enabled'],
            'cadence' => $standard['cadence'],
        ];
    }
}
