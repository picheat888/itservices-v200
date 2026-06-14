<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();          // MG-####
            $table->string('name');
            $table->string('email')->unique();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description')->nullable();
            $table->foreignId('owner_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_groups');
    }
};
