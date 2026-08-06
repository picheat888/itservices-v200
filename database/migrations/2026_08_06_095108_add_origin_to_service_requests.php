<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tells a request's owner apart from the person who filed it.
 *
 * Until now `user_id` meant both, which is fine while everyone submits for
 * themselves. Onboarding requests break that: HR presses Save, but the request
 * belongs to a new employee who has no login yet (so `user_id` is null). Without
 * a record of who filed it, an approver sees a name with no explanation and the
 * only person able to withdraw the request cannot even find it.
 *
 * `origin` also drives the "new employee" marking approvers see, so the reason a
 * request exists is data rather than something inferred from a null column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->string('origin', 20)->default('direct')->after('type');
            $table->unsignedBigInteger('submitted_by_user_id')->nullable()->after('user_id');
            // Snapshotted like requester_name, so a resignation does not blank the trail.
            $table->string('submitted_by_name', 160)->nullable()->after('submitted_by_user_id');

            $table->index('origin');
            $table->foreign('submitted_by_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropForeign(['submitted_by_user_id']);
            $table->dropIndex(['origin']);
            $table->dropColumn(['origin', 'submitted_by_user_id', 'submitted_by_name']);
        });
    }
};
