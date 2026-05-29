<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // users.role_id — RESTRICT (don't orphan a user's role)
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->restrictOnDelete();
        });
        // group_roles.role_id — RESTRICT, stays nullable (a group may have no role)
        Schema::table('group_roles', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->restrictOnDelete();
        });
        // role_permissions.role_id — CASCADE (permissions belong to the role)
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->cascadeOnDelete();
        });

        // Backfill from the existing string key. Query-builder form so it works on
        // both MySQL (prod) and sqlite (tests). No orphans exist (verified).
        foreach (DB::table('roles')->get(['id', 'key']) as $role) {
            foreach (['users', 'group_roles', 'role_permissions'] as $t) {
                DB::table($t)->where('role', $role->key)->update(['role_id' => $role->id]);
            }
        }

        // Swap role_permissions uniqueness from (role, permission) to (role_id, permission).
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->unique(['role_id', 'permission'], 'role_permissions_role_id_permission_unique');
        });
    }

    public function down(): void
    {
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropUnique('role_permissions_role_id_permission_unique');
            $table->dropConstrainedForeignId('role_id');
        });
        Schema::table('group_roles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });
    }
};
