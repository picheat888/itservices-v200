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
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_no')->unique();          // human ref e.g. TKT-2862
            $table->string('subject');
            $table->string('subject_th')->nullable();
            $table->text('description');
            $table->string('category');                     // TicketCategory enum value
            $table->string('priority')->nullable();         // TicketPriority enum value, null until taken
            $table->string('status')->default('open');      // TicketStatus enum value

            // Who reported it (an employee) and who handles it (an IT login account).
            $table->foreignId('requester_id')->constrained('employees')->cascadeOnDelete();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('callback_phone')->nullable();
            $table->foreignId('related_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->text('take_note')->nullable();          // IT staff's initial notes when taking the case
            $table->text('resolution')->nullable();         // resolution / cancellation detail
            $table->timestamp('resolved_at')->nullable();

            $table->timestamps();

            $table->index('status', 'tickets_status_idx');
            $table->index('category', 'tickets_category_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
