<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Vendor & service contracts with expiration tracking. The "days remaining"
     * and active/expired status are derived live from end_date — not stored — so
     * they never go stale. Monetary value is stored raw (decimal) with its billing
     * cycle; the formatted "฿x/yr" string is built on read.
     */
    public function up(): void
    {
        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();                 // CT-YYYY-NNN
            $table->string('vendor');
            $table->string('name');
            $table->string('type')->default('software');      // ContractType enum value
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('value', 15, 2)->default(0);
            $table->string('billing_cycle')->default('yearly'); // monthly|quarterly|yearly
            $table->boolean('auto_renew')->default(false);
            $table->foreignId('owner_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->boolean('notify_60')->default(true);
            $table->boolean('notify_30')->default(true);
            $table->boolean('notify_7')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('contracts');
    }
};
