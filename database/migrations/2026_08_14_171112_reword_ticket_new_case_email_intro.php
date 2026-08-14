<?php

use App\Models\Email\EmailTemplate;
use Illuminate\Database\Migrations\Migration;

/**
 * Rewords the opening line of the new-case mail.
 *
 * "nobody has taken it yet" states the reader's own inaction back at them; the case simply
 * needs somebody, which is what the line now says.
 *
 * Replaces the sentence in place so any wording an administrator has added around it stays.
 */
return new class extends Migration
{
    private const OLD = 'A new case has been raised and nobody has taken it yet.';

    private const NEW = 'A new case has been created and is waiting for support';

    public function up(): void
    {
        $this->replace(self::OLD, self::NEW);
    }

    public function down(): void
    {
        $this->replace(self::NEW, self::OLD);
    }

    private function replace(string $from, string $to): void
    {
        $template = EmailTemplate::where('key', 'ticket.new_case')->first();

        if ($template && str_contains((string) $template->body_html, $from)) {
            $template->update(['body_html' => str_replace($from, $to, $template->body_html)]);
        }
    }
};
