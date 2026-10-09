<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Who revoked an access grant: revoked_by beside revoked_at (a users FK that goes null if the account is deleted).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('access_memberships', function (Blueprint $table) {
            $table->foreignId('revoked_by')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('access_memberships', function (Blueprint $table) {
            $table->dropConstrainedForeignId('revoked_by');
        });
    }
};
