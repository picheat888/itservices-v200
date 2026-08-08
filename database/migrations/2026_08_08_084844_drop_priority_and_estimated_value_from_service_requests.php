<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the requester-declared priority and estimated value from service requests.
 *
 * Both were written at submit but never collected: the create wizard stopped asking
 * for them, so every row landed on the `medium` default with a null value, and no
 * screen read either one. The only thing they still reached was a "Priority: medium"
 * line in the body of the auto-opened ticket — a constant, not information.
 *
 * Urgency now lives where it is actually decided: IT staff set TicketPriority when
 * they take or are assigned the case.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropColumn(['priority', 'estimated_value']);
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->string('priority', 10)->default('medium');
            $table->string('estimated_value', 120)->nullable();
        });
    }
};
