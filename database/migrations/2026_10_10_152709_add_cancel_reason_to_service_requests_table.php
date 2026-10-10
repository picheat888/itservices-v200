<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Who withdrew a pending request and why (the requester, or the HR filer of an onboarding request).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->text('cancel_reason')->nullable()->after('cancelled_at');
            $table->foreignId('cancelled_by_user_id')->nullable()->after('cancel_reason')->constrained('users')->nullOnDelete();
            $table->string('cancelled_by_name')->nullable()->after('cancelled_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cancelled_by_user_id');
            $table->dropColumn(['cancel_reason', 'cancelled_by_name']);
        });
    }
};
