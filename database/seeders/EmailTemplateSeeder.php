<?php

namespace Database\Seeders;

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Seeder;

class EmailTemplateSeeder extends Seeder
{
    /**
     * Seed the standard system email templates from the canonical catalog.
     *
     * firstOrCreate on `key`, NOT updateOrCreate: a run only adds the templates that are
     * missing, so a template an administrator has reworded or switched off keeps their
     * version, and a new template shipped in the catalogue lands on an installed system by
     * running this again. Putting one back to standard is the Email template page's Reset
     * (EmailTemplateController@reset / @resetAll), never a re-seed.
     */
    public function run(): void
    {
        foreach (EmailTemplates::all() as $template) {
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
}
