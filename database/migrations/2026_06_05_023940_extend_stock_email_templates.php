<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Round out the Stock notification templates to the eight topics the desk uses:
     * add the missing Overstock-alert and New-Request templates, and relabel the six
     * existing ones to the shared "Stock - ..." naming. Only display names are
     * rewritten; admin-edited subjects/bodies are left untouched.
     */
    public function up(): void
    {
        $body = function (string $line): string {
            return "<p>Hi {{user.first_name}},</p>\n<p>{$line}</p>\n"
                .'<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> — {{stock.name}}</p>';
        };

        $now = now();

        // New templates — inserted only if the key is not already present.
        $new = [
            ['key' => 'stock.overstock_alert', 'name' => 'Stock - Overstock alert', 'subject' => 'Overstock: {{stock.sku}} ({{stock.qty}} on hand)', 'body_html' => $body('A stock item has risen above its maximum level (overstock).'), 'enabled' => true],
            ['key' => 'stock.request_created', 'name' => 'Stock - New Request', 'subject' => 'New stock request submitted: {{stock.sku}}', 'body_html' => $body('A new stock request has been submitted and is awaiting processing.'), 'enabled' => true],
        ];

        $existing = DB::table('email_templates')->whereIn('key', array_column($new, 'key'))->pluck('key')->all();
        $insert = array_filter($new, fn ($r) => ! in_array($r['key'], $existing, true));

        if ($insert !== []) {
            DB::table('email_templates')->insert(array_map(fn ($r) => $r + ['created_at' => $now, 'updated_at' => $now], $insert));
        }

        // Relabel the existing six to the shared "Stock - ..." convention (name only).
        $names = [
            'stock.low_alert' => 'Stock - Low alert',
            'stock.out_of_stock' => 'Stock - Out of stock alert',
            'stock.request_approval_needed' => 'Stock - waiting approval',
            'stock.request_approved' => 'Stock - Respond to the request (Approved)',
            'stock.request_rejected' => 'Stock - Respond to the request (Rejected)',
            'stock.request_fulfilled' => 'Stock - Respond to the request (fulfilled)',
        ];

        foreach ($names as $key => $name) {
            DB::table('email_templates')->where('key', $key)->update(['name' => $name, 'updated_at' => $now]);
        }
    }

    /**
     * Drop only the two templates this migration introduced; the relabels are
     * harmless and left in place.
     */
    public function down(): void
    {
        DB::table('email_templates')->whereIn('key', ['stock.overstock_alert', 'stock.request_created'])->delete();
    }
};
