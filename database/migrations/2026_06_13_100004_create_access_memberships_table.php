<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_memberships', function (Blueprint $table) {
            $table->id();
            $table->morphs('resource'); // resource_type + resource_id (+ index)
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('access_level')->nullable();
            $table->string('purpose')->nullable();
            $table->date('granted_at');
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['employee_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_memberships');
    }
};
