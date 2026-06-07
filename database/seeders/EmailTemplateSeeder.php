<?php

namespace Database\Seeders;

use App\Models\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Seeder;

class EmailTemplateSeeder extends Seeder
{
    /**
     * Seed the standard system email templates from the canonical catalog.
     *
     * Idempotent: matches on `key` and refreshes the standard fields so the
     * table always reflects App\Support\EmailTemplates. Runtime-only columns
     * (last_sent_at) are left untouched.
     */
    public function run(): void
    {
        foreach (EmailTemplates::all() as $template) {
            EmailTemplate::updateOrCreate(
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
}
