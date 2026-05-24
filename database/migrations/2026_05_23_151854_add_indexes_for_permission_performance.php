<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Speed up role_permissions: WHERE allowed = true
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->index('allowed', 'rp_allowed_idx');
        });

        // Speed up member count GROUP BY role on users table
        Schema::table('users', function (Blueprint $table) {
            $table->index('role', 'users_role_idx');
        });

        // Speed up ORDER BY created_at DESC on audit_logs
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->index('created_at', 'audit_created_at_idx');
        });

        // Speed up employees: search by name, filter by status + department
        Schema::table('employees', function (Blueprint $table) {
            $table->index('name', 'emp_name_idx');
            $table->index('status', 'emp_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('role_permissions', fn (Blueprint $t) => $t->dropIndex('rp_allowed_idx'));
        Schema::table('users', fn (Blueprint $t) => $t->dropIndex('users_role_idx'));
        Schema::table('audit_logs', fn (Blueprint $t) => $t->dropIndex('audit_created_at_idx'));
        Schema::table('employees', function (Blueprint $t) {
            $t->dropIndex('emp_name_idx');
            $t->dropIndex('emp_status_idx');
        });
    }
};
