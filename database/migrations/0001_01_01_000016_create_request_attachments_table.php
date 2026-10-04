<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 17/18 — evidence filed with a service request — a floor plan for a camera, a quote for
 * a piece of hardware. Same shape as ticket_attachments: the binary lives on the
 * private disk at {path} and only this row says what it was called.
 *
 * A ticket a request opened gets copies of these files: ticket_attachments.request_attachment_id
 * points back at the row it came from. Added here, not in the ticket baseline, because this
 * table has to exist first; restrictOnDelete keeps a request file from vanishing under a ticket.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('request_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_request_id');
            $table->string('original_name');
            $table->string('path');
            $table->unsignedBigInteger('size');
            $table->string('mime', 100);
            $table->timestamps();
            $table->foreign('service_request_id')->references('id')->on('service_requests')->cascadeOnDelete();
        });

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
        Schema::dropIfExists('request_attachments');
    }
};
