<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Puts the two mails that tell a requester their case moved into `email_templates`.
 *
 * They used to hear nothing between filing and closing: the two mails they got were "we
 * have it" and "it is done", with the whole middle silent — a case could sit with three
 * different technicians and the person waiting on it would see none of that.
 *
 * The catalogue is only the definition; sendTemplate() reads the table, and a key with no
 * row there sends nothing at all, silently.
 */
return new class extends Migration
{
    private const KEYS = ['ticket.owner_taken', 'ticket.owner_forwarded'];

    public function up(): void
    {
        foreach (EmailTemplates::all() as $standard) {
            if (! in_array($standard['key'], self::KEYS, true)) {
                continue;
            }

            EmailTemplate::firstOrCreate(
                ['key' => $standard['key']],
                [
                    'name' => $standard['name'],
                    'subject' => $standard['subject'],
                    'body_html' => $standard['body_html'],
                    'enabled' => $standard['enabled'],
                    'cadence' => $standard['cadence'],
                ],
            );
        }
    }

    public function down(): void
    {
        EmailTemplate::whereIn('key', self::KEYS)->delete();
    }
};
