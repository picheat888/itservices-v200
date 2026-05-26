<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Replaces the three rigid day-specific contract templates with one flexible
     * template whose subject/body carry a {{contract.days_remaining}} variable,
     * so every reminder threshold (150/120/60/45/30/7) is covered by one row.
     */
    public function up(): void
    {
        DB::table('email_templates')
            ->whereIn('key', ['contract.expire.60d', 'contract.expire.30d', 'contract.expire.7d'])
            ->delete();

        DB::table('email_templates')->insert([
            'key'        => 'contract.expiry_alert',
            'name'       => 'Contract expiring soon',
            'subject'    => 'Contract {{contract.vendor}} expires in {{contract.days_remaining}} days',
            'body_html'  => "<p>Hi {{user.first_name}},</p>\n"
                . "<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} expires in "
                . "<strong>{{contract.days_remaining}}</strong> days (on {{contract.end_date}}). "
                . "Please review and decide on renewal.</p>\n"
                . "<p style=\"color:#64748b\">Reference: <strong>{{contract.code}}</strong></p>",
            'enabled'    => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'contract.expiry_alert')->delete();

        $contract = 'A vendor contract is approaching its expiration date. Please review and decide on renewal.';
        $body = "<p>Hi {{user.first_name}},</p>\n<p>{$contract}</p>\n"
            . "<p style=\"color:#64748b\">Reference: <strong>{{reference.id}}</strong></p>";
        $now = now();

        DB::table('email_templates')->insert([
            ['key' => 'contract.expire.60d', 'name' => 'Contract expiring (60 days)', 'subject' => 'Contract {{contract.vendor}} expires in 60 days', 'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'contract.expire.30d', 'name' => 'Contract expiring (30 days)', 'subject' => 'Contract {{contract.vendor}} expires in 30 days', 'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'contract.expire.7d',  'name' => 'Contract expiring (7 days)',  'subject' => 'Contract {{contract.vendor}} expires in 7 days',  'body_html' => $body, 'enabled' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }
};
