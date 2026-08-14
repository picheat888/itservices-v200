<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Puts the two new staff-facing ticket templates into `email_templates`.
 *
 * The catalog is only the definition — `sendTemplate()` reads the table, and a key with no
 * row there sends nothing at all. Adding ticket.new_case and ticket.weekly_digest to the
 * catalog alone would leave both notifications quietly doing nothing on this installation.
 *
 * `firstOrCreate` keeps an administrator's wording if either key somehow already exists.
 */
return new class extends Migration
{
    private const KEYS = ['ticket.new_case', 'ticket.weekly_digest'];

    public function up(): void
    {
        foreach (EmailTemplates::all() as $template) {
            if (! in_array($template['key'], self::KEYS, true)) {
                continue;
            }

            EmailTemplate::firstOrCreate(
                ['key' => $template['key']],
                [
                    'name' => $template['name'],
                    'subject' => $template['subject'],
                    'body_html' => $template['body_html'],
                    'enabled' => $template['enabled'],
                    'cadence' => $template['cadence'],
                ],
            );
        }
    }

    public function down(): void
    {
        EmailTemplate::whereIn('key', self::KEYS)->delete();
    }
};
