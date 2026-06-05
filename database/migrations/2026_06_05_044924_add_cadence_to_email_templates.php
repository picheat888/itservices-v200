<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Mark how each template is dispatched: 'realtime' (fired immediately on an
     * event) or 'daily' (fired by a scheduled sweep). System-defined and read-only
     * in the UI — it reflects code wiring, not an admin choice. Defaults to
     * 'realtime' (most templates are event-driven); the scheduled ones are flagged.
     */
    public function up(): void
    {
        Schema::table('email_templates', function (Blueprint $table) {
            $table->string('cadence', 16)->default('realtime')->after('enabled');
        });

        DB::table('email_templates')->whereIn('key', [
            'schedule.weekly',
            'contract.expiry_alert',
            'contract.expired_alert',
            'stock.request_approval_needed',
            'stock.alert_digest',
        ])->update(['cadence' => 'daily']);
    }

    public function down(): void
    {
        Schema::table('email_templates', function (Blueprint $table) {
            $table->dropColumn('cadence');
        });
    }
};
