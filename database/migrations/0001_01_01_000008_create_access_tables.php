<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 9/17 — the access registries: which software, email groups and file
 * shares exist, and who holds access to each.
 *
 * access_memberships is one polymorphic table across all three registries
 * (resource_type + resource_id) rather than three near-identical join tables.
 * A revoked grant keeps its row with revoked_at set, so history survives — which
 * is why the employee index is on the pair (employee_id, revoked_at).
 *
 * The Request form draws on these, so this file precedes the request one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('softwares', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('license_type')->default('subscription');
            $table->unsignedInteger('seats')->nullable();
            $table->text('product_key')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->foreign('brand_id')->references('id')->on('brands')->restrictOnDelete();
        });

        Schema::create('email_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('email')->unique();
            $table->unsignedBigInteger('department_id')->nullable();
            $table->string('description')->nullable();
            $table->unsignedBigInteger('owner_employee_id')->nullable();
            $table->timestamps();
            $table->foreign('department_id')->references('id')->on('departments')->nullOnDelete();
            $table->foreign('owner_employee_id')->references('id')->on('employees')->nullOnDelete();
        });

        Schema::create('file_shares', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('path');
            $table->unsignedBigInteger('department_id')->nullable();
            // Size is kept as a number plus its unit, so "500 GB" stays what the
            // admin typed instead of being normalised into bytes and back.
            $table->integer('size')->nullable();
            $table->string('size_unit', 10)->nullable();
            $table->string('description')->nullable();
            $table->unsignedBigInteger('owner_employee_id')->nullable();
            $table->timestamps();
            $table->foreign('department_id')->references('id')->on('departments')->nullOnDelete();
            $table->foreign('owner_employee_id')->references('id')->on('employees')->nullOnDelete();
        });

        Schema::create('access_memberships', function (Blueprint $table) {
            $table->id();
            $table->string('resource_type');
            $table->unsignedBigInteger('resource_id');
            $table->unsignedBigInteger('employee_id');
            $table->string('access_level')->nullable();
            $table->string('purpose')->nullable();
            $table->date('granted_at');
            $table->unsignedBigInteger('granted_by')->nullable();
            $table->date('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['employee_id', 'revoked_at']);
            $table->index(['resource_type', 'resource_id']);
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->foreign('granted_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('group_roles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedBigInteger('role_id')->nullable();
            $table->timestamps();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });

        Schema::create('group_role_employee', function (Blueprint $table) {
            $table->unsignedBigInteger('group_role_id');
            $table->unsignedBigInteger('employee_id');
            $table->primary(['group_role_id', 'employee_id']);
            // An employee belongs to at most one group, so the pivot is unique on them.
            $table->unique('employee_id');
            $table->foreign('group_role_id')->references('id')->on('group_roles')->cascadeOnDelete();
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('group_role_employee');
        Schema::dropIfExists('group_roles');
        Schema::dropIfExists('access_memberships');
        Schema::dropIfExists('file_shares');
        Schema::dropIfExists('email_groups');
        Schema::dropIfExists('softwares');
    }
};
