<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Field labels in the "ticket created" receipt are bold, with a blank line above the block.
 *
 * Same shape as before, laid out the way it was asked for. Written from the catalog so the
 * installed template and the standard stay identical — anyone who had reworded this one
 * template is one Reset away from the previous text either way.
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

    /** The previous markup is in git; freezing a copy here would only drift from it. */
    public function down(): void {}
};
