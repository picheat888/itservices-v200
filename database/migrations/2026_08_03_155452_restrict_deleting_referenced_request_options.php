<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A choice a request already points at must not be deletable at all.
 *
 * ON DELETE SET NULL let a delete succeed and quietly cut the request loose from
 * what it had asked for — the label survived in the display snapshot, but the
 * link that answers "which requests wanted this?" was gone for good, and nothing
 * warned anybody. RESTRICT refuses the delete instead, so the controller's 409 is
 * backed by the database rather than being the only thing standing in the way.
 *
 * Retiring a choice is what `active` is for: it stops being offered and every
 * request that chose it keeps its reference.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropForeign(['request_option_id']);
            $table->foreign('request_option_id')->references('id')->on('request_options')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropForeign(['request_option_id']);
            $table->foreign('request_option_id')->references('id')->on('request_options')->nullOnDelete();
        });
    }
};
