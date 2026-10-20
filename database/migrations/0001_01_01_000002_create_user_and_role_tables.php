<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 3/18 — who can sign in and what they may do: roles, login accounts, per-role
 * permission grants (keys live in App\Support\Permissions), the audit trail, signed-in devices
 * and the sign-in history.
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

        // One row per (role, key) incl. denied ones, so revoking is a value change
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('permission');
            $table->boolean('allowed')->default(false);
            $table->timestamps();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->unique(['role_id', 'permission']);
            // No index on `allowed`: measured, the unique index above serves every lookup
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
            $table->index('user_name', 'audit_user_name_idx');
        });

        // Who created / last changed an org record — the columns live in 000001, created before users.
        foreach (self::ORG_ACTOR_TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
                $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
            });
        }

        // One row per browser sign-in: what the device limit counts and the profile Devices tab lists
        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session_id')->nullable()->index();
            $table->char('remember_token_hash', 64)->nullable()->unique();
            $table->timestamp('remember_expires_at')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('location', 120)->nullable();
            $table->string('os', 20);
            $table->string('browser', 20);
            $table->string('user_agent', 300)->nullable();
            $table->timestamp('signed_in_at');
            $table->timestamp('last_active_at');
            $table->timestamp('ended_at')->nullable();
            $table->string('end_reason', 30)->nullable();
            $table->json('ended_by')->nullable();

            $table->index(['user_id', 'ended_at']);
        });

        // Append-only sign-in history behind the Login tabs
        Schema::create('login_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('login_name')->nullable();
            $table->string('event', 20);
            $table->string('reason', 30)->nullable();
            $table->boolean('remembered')->default(false);
            $table->foreignId('device_id')->nullable()->constrained('user_devices')->nullOnDelete();
            $table->string('ip', 45)->nullable();
            $table->string('location', 120)->nullable();
            $table->string('os', 20)->nullable();
            $table->string('browser', 20)->nullable();
            $table->timestamp('created_at')->index();

            $table->index(['user_id', 'created_at']);
            $table->index(['event', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_events');
        Schema::dropIfExists('user_devices');
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
