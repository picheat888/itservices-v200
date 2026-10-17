<?php

// Index on audit_logs.user_name so the actor filter list (SELECT DISTINCT) scans the index, not the table.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->index('user_name', 'audit_user_name_idx');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex('audit_user_name_idx');
        });
    }
};
