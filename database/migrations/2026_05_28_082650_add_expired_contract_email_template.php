<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Adds the one-time "contract has expired" email template. Sent once when a
     * contract first crosses its end date (the recurring nag lives in the bell,
     * not the inbox). Carries a {{contract.days_overdue}} variable.
     */
    public function up(): void
    {
        DB::table('email_templates')->updateOrInsert(
            ['key' => 'contract.expired_alert'],
            [
                'name' => 'Contract expired',
                'subject' => 'Contract {{contract.vendor}} has expired ({{contract.days_overdue}} days ago)',
                'body_html' => "<p>Hi {{user.first_name}},</p>\n"
                    .'<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} expired '
                    .'<strong>{{contract.days_overdue}}</strong> days ago (on {{contract.end_date}}). '
                    ."Please review and renew or close it out.</p>\n"
                    .'<p style="color:#64748b">Reference: <strong>{{contract.code}}</strong></p>',
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'contract.expired_alert')->delete();
    }
};
