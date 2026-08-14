<?php

use App\Models\Email\EmailTemplate;
use Illuminate\Database\Migrations\Migration;

/**
 * Ticket templates refer to the case number one way: {{ticket.id}}.
 *
 * Both names carried the same value — every ticket-sending service passes the ticket number
 * as `ticket.id` AND as `reference.id` — so the editor offered two variables for one thing
 * and the standard bodies used each of them once, which reads as though they differ.
 *
 * Only `ticket.` templates are touched. `reference.id` stays the generic record number for
 * the modules that have no name of their own for it (requests, stock), and the services keep
 * passing it, so an administrator's own template that uses it still renders.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (EmailTemplate::where('key', 'like', 'ticket.%')->get() as $template) {
            $template->update([
                'subject' => str_replace('{{reference.id}}', '{{ticket.id}}', (string) $template->subject),
                'body_html' => str_replace('{{reference.id}}', '{{ticket.id}}', (string) $template->body_html),
            ]);
        }
    }

    /**
     * Nothing to reverse. Swapping every {{ticket.id}} back would also rewrite the ones that
     * were always there — the subjects have said {{ticket.id}} since the beginning — and both
     * names render the same ticket number anyway, so leaving them is not a broken state.
     */
    public function down(): void {}
};
