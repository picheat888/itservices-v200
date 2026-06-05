<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Stock module notification templates. These add a "Stock" tab to the
     * Notifications screen (the tab list is derived from each key's prefix) covering
     * the low/out-of-stock alerts and the stock-request workflow.
     */
    public function up(): void
    {
        $body = function (string $line): string {
            return "<p>Hi {{user.first_name}},</p>\n<p>{$line}</p>\n"
                .'<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> — {{stock.name}}</p>';
        };

        $rows = [
            ['key' => 'stock.low_alert',             'name' => 'Stock low alert',                 'subject' => 'Stock low: {{stock.sku}} ({{stock.qty}} left)',     'body_html' => $body('A stock item has dropped to or below its minimum level and may need reordering.'),       'enabled' => true],
            ['key' => 'stock.out_of_stock',          'name' => 'Out of stock',                    'subject' => 'Out of stock: {{stock.sku}}',                       'body_html' => $body('A stock item is now out of stock. Please reorder as soon as possible.'),                 'enabled' => true],
            ['key' => 'stock.request_approval_needed', 'name' => 'Stock request awaiting approval', 'subject' => 'A stock request is awaiting your approval',         'body_html' => $body('A stock disbursement request requires your approval. Please review it in the IT portal.'), 'enabled' => true],
            ['key' => 'stock.request_approved',      'name' => 'Stock request approved',          'subject' => 'Your stock request has been approved',              'body_html' => $body('Your stock request has been approved and is ready to be fulfilled.'),                    'enabled' => true],
            ['key' => 'stock.request_rejected',      'name' => 'Stock request rejected',          'subject' => 'Your stock request has been rejected',              'body_html' => $body('Your stock request has been rejected. Please contact IT if you have questions.'),         'enabled' => true],
            ['key' => 'stock.request_fulfilled',     'name' => 'Stock request fulfilled',         'subject' => 'Your stock request has been fulfilled',             'body_html' => $body('Your stock request has been fulfilled and the items have been issued.'),                 'enabled' => true],
        ];

        $now = now();
        // Skip any key already present so the migration is safe to re-run / coexist with seeds.
        $existing = DB::table('email_templates')->whereIn('key', array_column($rows, 'key'))->pluck('key')->all();
        $insert = array_filter($rows, fn ($r) => ! in_array($r['key'], $existing, true));

        if ($insert !== []) {
            DB::table('email_templates')->insert(array_map(fn ($r) => $r + ['created_at' => $now, 'updated_at' => $now], $insert));
        }
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'like', 'stock.%')->delete();
    }
};
