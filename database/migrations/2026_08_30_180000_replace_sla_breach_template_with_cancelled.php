<?php

use App\Models\Email\EmailTemplate;
use App\Support\EmailTemplates;
use Illuminate\Database\Migrations\Migration;

/**
 * Turns the SLA-breach template into the ticket-cancelled one, in place.
 *
 * The SLA sweep no longer mails anybody (it runs every ten minutes across every open case,
 * and everyone it reaches is already in the portal where the tray is), while a case closed
 * WITHOUT being fixed had no mail at all — the requester was left to notice in the drawer.
 *
 * The row is reused rather than deleted and recreated so the template keeps its place in the
 * list an administrator knows it by. Nothing was ever sent on the old key, so no delivery log
 * is orphaned by the rename.
 */
return new class extends Migration
{
    private const OLD_KEY = 'ticket.sla_breach';

    private const NEW_KEY = 'ticket.cancelled';

    public function up(): void
    {
        $standard = collect(EmailTemplates::all())->firstWhere('key', self::NEW_KEY);
        $row = EmailTemplate::where('key', self::OLD_KEY)->first();

        if ($standard === null) {
            return;
        }

        $wording = [
            'key' => self::NEW_KEY,
            'name' => $standard['name'],
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
            'enabled' => $standard['enabled'],
            'cadence' => $standard['cadence'],
            // The old key never sent anything; the new one has not sent yet either.
            'last_sent_at' => null,
        ];

        if ($row === null) {
            EmailTemplate::firstOrCreate(['key' => self::NEW_KEY], $wording);

            return;
        }

        $row->update($wording);
    }

    public function down(): void
    {
        $standard = collect(EmailTemplates::all())->firstWhere('key', self::OLD_KEY);
        $row = EmailTemplate::where('key', self::NEW_KEY)->first();

        if ($row === null || $standard === null) {
            return;
        }

        $row->update([
            'key' => self::OLD_KEY,
            'name' => $standard['name'],
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
        ]);
    }
};
