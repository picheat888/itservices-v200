<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a ticket show the files its service request was filed with, without a second
 * copy of the bytes: the ticket row carries the same `path` and points at the request
 * attachment it mirrors.
 *
 * restrictOnDelete is the whole safety of the arrangement. Two rows now share one file
 * on disk, and the request's copy is the original — the database refuses to let it go
 * while a ticket is still showing it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ticket_attachments', function (Blueprint $table) {
            $table->unsignedBigInteger('request_attachment_id')->nullable()->after('ticket_id');
            $table->foreign('request_attachment_id')->references('id')->on('request_attachments')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ticket_attachments', function (Blueprint $table) {
            $table->dropForeign(['request_attachment_id']);
            $table->dropColumn('request_attachment_id');
        });
    }
};
