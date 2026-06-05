<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The daily sweep now emails a single DIGEST per recipient instead of one mail
     * per item/request. Add the alert-digest template and convert the existing
     * "waiting approve & fulfill" template into a digest body. Both use {{items}}
     * (an HTML list the service injects) and {{count}}.
     */
    public function up(): void
    {
        $now = now();

        // New: daily stock-alert digest (out/low/over rolled into one mail).
        $exists = DB::table('email_templates')->where('key', 'stock.alert_digest')->exists();
        if (! $exists) {
            DB::table('email_templates')->insert([
                'key' => 'stock.alert_digest',
                'name' => 'Stock - Daily alert digest',
                'subject' => 'Daily stock alert — {{count}} item(s) need attention',
                'body_html' => "<p>Hi {{user.first_name}},</p>\n<p>{{count}} stock item(s) need attention:</p>\n{{items}}",
                'enabled' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // Convert the waiting template to a digest of all open requests.
        DB::table('email_templates')
            ->where('key', 'stock.request_approval_needed')
            ->update([
                'subject' => 'Stock requests awaiting action — {{count}}',
                'body_html' => "<p>Hi {{user.first_name}},</p>\n<p>{{count}} stock request(s) awaiting approval or fulfilment:</p>\n{{items}}",
                'updated_at' => $now,
            ]);
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'stock.alert_digest')->delete();

        DB::table('email_templates')
            ->where('key', 'stock.request_approval_needed')
            ->update([
                'subject' => 'A stock request is awaiting your approval',
                'body_html' => "<p>Hi {{user.first_name}},</p>\n<p>A stock disbursement request requires your approval. Please review it in the IT portal.</p>\n"
                    .'<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> — {{stock.name}}</p>',
                'updated_at' => now(),
            ]);
    }
};
