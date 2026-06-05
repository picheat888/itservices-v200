<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Generic mailable that wraps an already-rendered body in the branded email
 * layout (emails.templated). Variable substitution and SMTP config override
 * happen in EmailNotificationService before this is sent. An optional Quick link
 * (actionUrl + actionLabel) renders a CTA button; eyebrow labels the email type.
 */
class TemplatedMail extends Mailable
{
    public function __construct(
        public string $subjectLine,
        public string $bodyHtml,
        public ?string $eyebrow = null,
        public ?string $actionUrl = null,
        public ?string $actionLabel = null,
        public ?string $brand = null,
        public ?string $logoPath = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.templated', with: [
            'subjectLine' => $this->subjectLine,
            'bodyHtml' => $this->bodyHtml,
            'eyebrow' => $this->eyebrow,
            'actionUrl' => $this->actionUrl,
            'actionLabel' => $this->actionLabel,
            'brand' => $this->brand,
            'logoPath' => $this->logoPath,
        ]);
    }
}
