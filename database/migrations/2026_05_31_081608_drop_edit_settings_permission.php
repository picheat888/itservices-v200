<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** Removes the retired monolithic settings permission from existing role grants. */
    public function up(): void
    {
        DB::table('role_permissions')->where('permission', 'system.edit_settings')->delete();
    }

    /** No-op: the key is no longer defined in the catalog, so there is nothing to restore. */
    public function down(): void {}
};
