<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Wire up the cross-table references that could not be declared on the
     * users / role_permissions create migrations (those tables are created
     * before employees and roles exist):
     *  - users.employee_id  → employees (SET NULL), one account per employee
     *  - users.role_id      → roles (RESTRICT, don't orphan a user's role)
     *  - role_permissions.role_id → roles (CASCADE, permissions belong to the role)
     *    plus the (role_id, permission) uniqueness.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->foreignId('role_id')->nullable()->constrained('roles')->restrictOnDelete();
        });

        Schema::table('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->constrained('roles')->cascadeOnDelete();
            $table->unique(['role_id', 'permission'], 'role_permissions_role_id_permission_unique');
        });
    }

    public function down(): void
    {
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropUnique('role_permissions_role_id_permission_unique');
            $table->dropConstrainedForeignId('role_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
            $table->dropConstrainedForeignId('employee_id');
        });
    }
};
