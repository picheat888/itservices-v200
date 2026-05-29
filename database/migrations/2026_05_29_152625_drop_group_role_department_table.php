<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop the group_role_department pivot. The group↔department link is no longer
     * used: Department is now only a quick-add shortcut for picking employees, not a
     * relationship stored against a role group.
     */
    public function up(): void
    {
        Schema::dropIfExists('group_role_department');
    }

    /**
     * Recreate the pivot exactly as the original create_group_role_pivots migration
     * defined it, so the schema can be rolled back cleanly.
     */
    public function down(): void
    {
        Schema::create('group_role_department', function (Blueprint $table) {
            $table->foreignId('group_role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->primary(['group_role_id', 'department_id']);
        });
    }
};
