<?php

use App\Models\Email\EmailTemplate;
use Illuminate\Database\Migrations\Migration;

/**
 * Calls the person who opened the case what the rest of the product calls them.
 *
 * The screens say "Requester" everywhere; the new-case mail said "Raised by", a phrase that
 * appears nowhere else. One thing, one name — otherwise the reader has to work out that the
 * two are the same person.
 *
 * A targeted replace rather than rewriting the row: an administrator may already have
 * reworded the message around this label, and that wording is theirs to keep.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->replaceLabel('Raised by:', 'Requester:');
    }

    public function down(): void
    {
        $this->replaceLabel('Requester:', 'Raised by:');
    }

    private function replaceLabel(string $from, string $to): void
    {
        $template = EmailTemplate::where('key', 'ticket.new_case')->first();

        if ($template && str_contains((string) $template->body_html, $from)) {
            $template->update(['body_html' => str_replace($from, $to, $template->body_html)]);
        }
    }
};
