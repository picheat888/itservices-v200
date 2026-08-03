<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ordered steps of a workflow. actor_type decides HOW the step resolves to a
 * person at submit time (chain = requester's manager line, owner = resource
 * owner, it_staff = fulfillment queue); label is the display text only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained('workflows')->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->string('actor_type', 20); // chain | owner | it_staff
            $table->string('label', 120);
            $table->string('kind', 20); // approval | fulfillment
            $table->decimal('sla_days', 5, 2)->default(1);
            $table->timestamps();
            $table->unique(['workflow_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_steps');
    }
};
