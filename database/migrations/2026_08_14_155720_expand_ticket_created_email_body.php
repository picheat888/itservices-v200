<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * The "ticket created" receipt now repeats what was filed: subject, issue type and the
 * description the requester typed, under the ticket number.
 *
 * Written straight from the catalog rather than patched, because the shape of the message
 * changed rather than a token inside it. That does overwrite wording an administrator had
 * edited on this one template — asked for, and the previous text is one Reset away for
 * anyone who preferred it.
 */
return new class extends Migration
{
    public function up(): void
    {
        $standard = collect(EmailTemplates::all())->firstWhere('key', 'ticket.created');

        EmailTemplate::where('key', 'ticket.created')->update([
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
        ]);
    }

    /** The old body is in git; restoring it here would only freeze a copy that drifts. */
    public function down(): void {}
};
