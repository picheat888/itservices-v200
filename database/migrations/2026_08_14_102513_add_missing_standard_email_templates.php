<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Copies standard templates that the installation does not have yet into `email_templates`.
 *
 * The catalog in App\Support\EmailTemplates is the definition; the table is what actually
 * gets sent, and `sendTemplate()` finds nothing — silently — when a key has no row. Adding a
 * template to the catalog therefore does nothing on an installation that was seeded before
 * it existed, which is how request.stalled_digest arrived: the code sends it, the database
 * has never heard of it, and the weekly digest goes out to nobody.
 *
 * `firstOrCreate`, never updateOrCreate: administrators reword these templates through the
 * Email Templates screen (a dozen rows on this installation already differ from the
 * catalog), and refreshing them all is what the screen's own "reset" button is for.
 */
return new class extends Migration
{
    public function up(): void
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

    /**
     * Nothing to reverse: the rows this adds are the standard set, and deleting a template
     * an administrator has since edited to remove it again would lose their wording.
     */
    public function down(): void {}
};
