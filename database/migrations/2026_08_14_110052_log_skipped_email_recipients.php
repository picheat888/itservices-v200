<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets the email log record a send that never happened because the recipient has no address.
 *
 * Until now every service checked `if (! $user->email) return;` on its own and dropped the
 * message where it stood, so nobody could tell the difference between "nothing to send" and
 * "somebody never heard about their own request". Those sends are now logged with status
 * `skipped`, which needs two changes to the table: an address column that accepts nothing,
 * and the person's name, since without an address the name is all that identifies them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_logs', function (Blueprint $table) {
            $table->string('to_email')->nullable()->change();
            $table->string('recipient_name')->nullable()->after('to_email');
            // The log screen filters by status and reads newest first, always together.
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        // Rows written while the column was nullable have no address to put back, and the
        // NOT NULL restore below would fail on them. They only exist because of this
        // migration, so removing them is the reversal, not data loss.
        DB::table('email_logs')->whereNull('to_email')->delete();

        Schema::table('email_logs', function (Blueprint $table) {
            $table->dropIndex(['status', 'created_at']);
            $table->dropColumn('recipient_name');
            $table->string('to_email')->nullable(false)->change();
        });
    }
};
