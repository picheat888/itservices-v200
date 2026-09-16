<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records who handed the stock over.
 *
 * The request already stored who approved it (approver_name) and when it was fulfilled
 * (fulfilled_at), but not by whom — that name existed only on the issue movement, and only
 * for as long as somebody was willing to go looking for it. The mail that tells a requester
 * their items are ready cannot name the person who released them without it.
 *
 * Nullable, and left null on rows fulfilled before this: a name that was never captured
 * cannot be invented, and the template prints a dash rather than a guess.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->string('fulfilled_by')->nullable()->after('fulfilled_at');
        });
    }

    public function down(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->dropColumn('fulfilled_by');
        });
    }
};
