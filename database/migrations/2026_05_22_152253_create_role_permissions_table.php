<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // role_id (FK to roles) and the (role_id, permission) unique index are
        // added later in the role-reference migration — roles is created after
        // this table, so the FK cannot be declared here.
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('permission');
            $table->boolean('allowed')->default(false);
            $table->timestamps();
            $table->index('allowed', 'rp_allowed_idx'); // WHERE allowed = true
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
    }
};
