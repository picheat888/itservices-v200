<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// granted_at / revoked_at keep the full date and time; rows granted on the day they were created take that time.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('access_memberships', function (Blueprint $table) {
            $table->dateTime('granted_at')->change();
            $table->dateTime('revoked_at')->nullable()->change();
        });

        DB::table('access_memberships')->whereRaw('DATE(created_at) = DATE(granted_at)')->update(['granted_at' => DB::raw('created_at')]);
        DB::table('access_memberships')->whereNotNull('revoked_at')->whereRaw('DATE(updated_at) = DATE(revoked_at)')->update(['revoked_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('access_memberships', function (Blueprint $table) {
            $table->date('granted_at')->change();
            $table->date('revoked_at')->nullable()->change();
        });
    }
};
