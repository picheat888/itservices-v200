<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 3/18 — who can sign in and what they may do: roles, the login
 * accounts attached to an employee record, the per-role permission grants, and
 * the audit trail.
 *
 * role_permissions holds one row per (role, permission key) with an explicit
 * allowed flag rather than only the granted ones, so revoking is a value change.
 * The catalogue of keys itself lives in App\Support\Permissions, which is what
 * the seeder reads — no migration needs to know the list.
 */
return new class extends Migration
{
    private const ORG_ACTOR_TABLES = ['departments', 'positions', 'sections', 'employees'];

    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->string('color')->default('#64748b');
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable()->unique();
            $table->string('username')->nullable()->unique();
            $table->longText('preferences')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->timestamp('password_changed_at')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->string('remember_token', 100)->nullable();
            $table->timestamps();
            $table->unsignedBigInteger('employee_id')->nullable()->unique();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->foreign('employee_id')->references('id')->on('employees')->nullOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('permission');
            $table->boolean('allowed')->default(false);
            $table->timestamps();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->unique(['role_id', 'permission']);
            // No index on `allowed` on purpose. Both queries that read it were measured:
            // the per-request lookup (role_id + allowed) takes the unique index above,
            // and the permission-matrix page (allowed alone, half the table) is a scan the
            // optimizer chooses over any index. One on `allowed` is only a false signal.
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('user_name')->nullable();
            $table->string('action');
            $table->string('target')->nullable();
            $table->string('subject_type', 120)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->longText('details')->nullable();
            $table->timestamps();
            $table->index(['created_at'], 'audit_created_at_idx');
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['subject_type', 'subject_id']);
        });

        // Who created / last changed an org record — the columns live in 000001, created before users.
        foreach (self::ORG_ACTOR_TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
                $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (self::ORG_ACTOR_TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropForeign(['created_by']);
                $table->dropForeign(['updated_by']);
            });
        }
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('users');
        Schema::dropIfExists('roles');
    }
};
