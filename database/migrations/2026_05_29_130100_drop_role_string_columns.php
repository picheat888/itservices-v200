<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop the legacy string `role` columns now that everything references
        // role_id. role_id is left nullable at the DB level (the application
        // always sets it and the FK guards integrity); a NOT NULL change() is
        // fragile on the sqlite test rebuild + FK.
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropUnique(['role', 'permission']);
            $table->dropColumn('role');
        });
        // Drop the index on users.role (from the permission-performance migration)
        // before the column it references can be removed.
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_role_idx');
            $table->dropColumn('role');
        });
        Schema::table('group_roles', fn (Blueprint $t) => $t->dropColumn('role'));
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('user')->after('email');
            $table->index('role', 'users_role_idx');
        });
        Schema::table('group_roles', fn (Blueprint $t) => $t->string('role')->nullable()->after('name'));
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->string('role')->nullable()->after('id');
            $table->unique(['role', 'permission']);
        });
    }
};
