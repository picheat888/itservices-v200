<?php

use App\Models\Email\EmailTemplate;
use Illuminate\Database\Migrations\Migration;

/**
 * Emails call the installation by its own name instead of the words "the IT portal".
 *
 * The phrase was written into six template bodies, so renaming the service in Settings left
 * every notification pointing people at something they had never heard of. `{{app.name}}` is
 * injected into every template render, and this puts it into the templates already installed
 * — including any an administrator has since reworded, since only the phrase is replaced.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->swap('the IT portal.', '{{app.name}}.');
    }

    public function down(): void
    {
        $this->swap('{{app.name}}.', 'the IT portal.');
    }

    private function swap(string $from, string $to): void
    {
        foreach (EmailTemplate::all() as $template) {
            if (! str_contains((string) $template->body_html, $from)) {
                continue;
            }

            $template->update(['body_html' => str_replace($from, $to, (string) $template->body_html)]);
        }
    }
};
