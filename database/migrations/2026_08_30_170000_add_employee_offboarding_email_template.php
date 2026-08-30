<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Puts the departure announcement into `email_templates`.
 *
 * A resignation has belled the directory since offboarding was built, but the news half of
 * it never left the building. The catalogue is only the definition — sendTemplate() reads
 * the table, and a key with no row there sends nothing at all, silently.
 *
 * firstOrCreate: if the key somehow already exists, the wording on it is an administrator's.
 */
return new class extends Migration
{
    private const KEY = 'employee.offboarding';

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
