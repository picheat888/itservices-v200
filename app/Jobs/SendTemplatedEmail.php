<?php

namespace App\Jobs;

use App\Services\Email\EmailNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Queued delivery of a rendered system email. Runs in the worker so the SMTP
 * config override + actual send never happen in the request cycle.
 */
class SendTemplatedEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /** @var list<int> seconds before the second and third attempt */
    public array $backoff = [60, 300];

    public function __construct(
        public string $toEmail,
        public string $subject,
        public string $html,
        public ?string $templateKey = null,
        public ?string $actionUrl = null,
        public ?string $actionLabel = null,
        public ?string $eyebrow = null,
        /** Carried only so the delivery log can name the person behind the address. */
        public ?string $recipientName = null,
    ) {}

    public function handle(EmailNotificationService $service): void
    {
        $service->deliver(
            $this->toEmail,
            $this->subject,
            $this->html,
            $this->templateKey,
            $this->actionUrl,
            $this->actionLabel,
            $this->eyebrow,
            $this->recipientName,
            throwTransient: $this->attempts() < $this->tries,
        );
    }
}
