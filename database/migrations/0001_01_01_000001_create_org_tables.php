<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 2/17 — the org chart the whole system hangs off: departments, the
 * sections inside them, positions, and employees. Employees come last because
 * they point at all three (and at their own manager).
 *
 * Names are stored split (first/last) and in both languages; the Thai halves are
 * often null, so anything that searches or displays a name must handle both.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('code')->nullable()->unique();
            $table->string('tag')->unique();
            $table->string('name');
            $table->string('name_th')->nullable();
            $table->timestamps();
        });

        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('title');
            $table->boolean('allow_special_position')->default(false);
            $table->timestamps();
        });

        Schema::create('sections', function (Blueprint $table) {
            $table->id();
            $table->string('code')->nullable()->unique();
            $table->unsignedBigInteger('department_id');
            $table->string('name');
            $table->string('name_th')->nullable();
            $table->timestamps();
            $table->foreign('department_id')->references('id')->on('departments')->cascadeOnDelete();
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('first_name_th')->nullable();
            $table->string('last_name_th')->nullable();
            $table->string('photo_path')->nullable();
            $table->unsignedBigInteger('department_id')->nullable();
            $table->unsignedBigInteger('section_id')->nullable();
            $table->unsignedBigInteger('position_id')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable();
            // Unique, and nullable so the many employees without a company address stay
            // NULL — a unique index lets NULL repeat, an empty string it would not. The
            // Employee model normalises blank to NULL for exactly that reason.
            $table->string('email')->nullable()->unique();
            $table->string('phone')->nullable();
            // Mirror of users.username, which is unique itself — unique here too so the
            // two can never drift into naming the same login twice.
            $table->string('username')->nullable()->unique();
            $table->date('joined_at')->nullable();
            $table->string('status')->default('active');
            $table->string('resign_reason')->nullable();
            $table->date('last_day')->nullable();
            $table->timestamps();
            $table->index(['first_name', 'last_name'], 'emp_name_idx');
            $table->index(['status'], 'emp_status_idx');
            $table->foreign('department_id')->references('id')->on('departments')->nullOnDelete();
            $table->foreign('section_id')->references('id')->on('sections')->nullOnDelete();
            $table->foreign('position_id')->references('id')->on('positions')->nullOnDelete();
            $table->foreign('manager_id')->references('id')->on('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
        Schema::dropIfExists('sections');
        Schema::dropIfExists('positions');
        Schema::dropIfExists('departments');
    }
};
