<?php

use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the `report.scheduled` email template (the mail a scheduled report is sent in) to an
 * existing install. EmailTemplateSeeder must not run on a live database — it overwrites the
 * templates administrators have edited — so the one new row is inserted here, and only when
 * it is not there yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        $standard = EmailTemplates::find('report.scheduled');
        if ($standard === null || DB::table('email_templates')->where('key', 'report.scheduled')->exists()) {
            return;
        }

        DB::table('email_templates')->insert([
            'key' => $standard['key'],
            'name' => $standard['name'],
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
            'enabled' => $standard['enabled'],
            'cadence' => $standard['cadence'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'report.scheduled')->delete();
    }
};
