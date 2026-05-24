<?php

namespace App\Jobs;

use App\Services\EmailNotificationService;
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

    public function __construct(
        public string $toEmail,
        public string $subject,
        public string $html,
        public ?string $templateKey = null,
    ) {}

    public function handle(EmailNotificationService $service): void
    {
        $service->deliver($this->toEmail, $this->subject, $this->html, $this->templateKey);
    }
}
