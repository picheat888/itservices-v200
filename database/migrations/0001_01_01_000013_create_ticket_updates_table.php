<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 14/17 — progress notes on a ticket between being taken and being closed.
 *
 * The desk had two places to write: a note when taking the case and a resolution when closing
 * it. Everything in between — the part that was ordered, the answer that never came — was said
 * out loud and written nowhere, so the person who filed the case heard nothing for days and
 * whoever picked it up next had to ask.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ticket_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            // The account that wrote it, and its name at the time: an update has to stay
            // readable after that person leaves, the way approval rows already do.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('author_name', 160);
            $table->text('body');
            $table->timestamps();

            // The only way this table is ever read: one ticket's updates, oldest first.
            $table->index(['ticket_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_updates');
    }
};
