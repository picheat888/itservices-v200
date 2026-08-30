<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Puts the access-offboarding mail into `email_templates`.
 *
 * A resignation already belled whoever can clear the leaver's access, but the bell only
 * carried counts and nothing left the building — the asset half of the same event has had
 * its own mail since ET-32. The catalogue is the definition; sendTemplate() reads the table,
 * and a key with no row there sends nothing at all, silently.
 *
 * firstOrCreate: if the key somehow already exists, the wording on it is an administrator's.
 */
return new class extends Migration
{
    private const KEY = 'access.offboarding';

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
