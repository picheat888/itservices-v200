<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Puts the weekly contract summary into `email_templates`.
 *
 * The catalogue is only the definition — sendTemplate() reads the table, and a key with no
 * row there sends nothing at all, silently. Adding contract.weekly_digest to the catalogue
 * alone would leave the new Monday mail doing nothing on this installation.
 *
 * firstOrCreate rather than updateOrCreate: if the key somehow already exists, the wording
 * on it is an administrator's and is not this migration's to overwrite.
 */
return new class extends Migration
{
    private const KEY = 'contract.weekly_digest';

    public function up(): void
    {
        $standard = collect(EmailTemplates::all())->firstWhere('key', self::KEY);

        if ($standard === null) {
            return;
        }

        EmailTemplate::firstOrCreate(
            ['key' => self::KEY],
            [
                'name' => $standard['name'],
                'subject' => $standard['subject'],
                'body_html' => $standard['body_html'],
                'enabled' => $standard['enabled'],
                'cadence' => $standard['cadence'],
            ],
        );
    }

    public function down(): void
    {
        EmailTemplate::where('key', self::KEY)->delete();
    }
};
