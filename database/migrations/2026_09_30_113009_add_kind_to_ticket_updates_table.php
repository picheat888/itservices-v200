<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets the case timeline carry what happened to a case, not only what somebody wrote on it.
 *
 * `kind` = 'note' (a progress note someone typed — every existing row) or 'forwarded' (the
 * case changed hands). `meta` holds the facts an event row names ({from, to} for a
 * forward), so the SPA words it in the reader's language instead of the row storing a
 * sentence in one of them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ticket_updates', function (Blueprint $table) {
            $table->string('kind', 20)->default('note')->after('author_name');
            $table->json('meta')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_updates', function (Blueprint $table) {
            $table->dropColumn(['kind', 'meta']);
        });
    }
};
