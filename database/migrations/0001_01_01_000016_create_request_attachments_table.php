<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 17/17 — evidence filed with a service request — a floor plan for a camera, a quote for
 * a piece of hardware. Same shape as ticket_attachments: the binary lives on the
 * private disk at {path} and only this row says what it was called.
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
    }

    public function down(): void
    {
        Schema::dropIfExists('request_attachments');
    }
};
