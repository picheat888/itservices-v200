<?php

// The delivery log: one page newest first with whole-log counts, and a sent email rebuilt inside the layout it went out in.

namespace App\Services\Email;

use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Support\EmailTemplates;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class EmailLogService
{
    public function __construct(private readonly EmailNotificationService $mail) {}

    /** Newest first, filtered by status and a search across recipient, address, subject and template key. */
    public function page(?string $status, mixed $search, int $perPage): LengthAwarePaginator
    {
        $query = EmailLog::query()->latest('created_at')->latest('id');

        if (in_array($status, ['sent', 'failed', 'skipped'], true)) {
            $query->where('status', $status);
        }

        SearchTerms::apply($query, $search, ['recipient_name', 'to_email', 'subject', 'template_key']);

        return $query->paginate($perPage);
    }

    /**
     * Whole-log counts for the filter chips, unaffected by status, search or page.
     *
     * @return array{all: int, sent: int, failed: int, skipped: int}
     */
    public function counts(): array
    {
        return [
            'all' => EmailLog::count(),
            'sent' => EmailLog::where('status', 'sent')->count(),
            'failed' => EmailLog::where('status', 'failed')->count(),
            'skipped' => EmailLog::where('status', 'skipped')->count(),
        ];
    }

    /** A stored message in the same layout the mailer sent it in, at the width it was sent at. */
    public function renderSent(EmailLog $log): string
    {
        // The eyebrow is the template's name in a real send; a deleted template falls back to the key
        $eyebrow = EmailTemplate::where('key', $log->template_key)->value('name') ?? $log->template_key;
        $action = $log->action ?? [];

        return view('emails.templated', [
            'subjectLine' => $log->subject,
            'bodyHtml' => $log->body_html,
            'eyebrow' => $eyebrow,
            'actionUrl' => $action['url'] ?? null,
            'actionLabel' => $action['label'] ?? null,
            'brand' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'logoData' => $this->mail->brandLogoDataUri(),
            'width' => EmailTemplates::widthFor($log->template_key),
            // Not preview mode: a record of a real send keeps the footnote the recipient saw
            'preview' => false,
        ])->render();
    }
}
