<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Library of automated system emails. Each template is keyed by the event
     * that triggers it (e.g. ticket.created). Body holds {{variables}} that are
     * substituted at send time. Seeded with the design's 12 templates plus the
     * one real event that exists today (employee.account_needed).
     */
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();      // = trigger, e.g. "ticket.created"
            $table->string('name');
            $table->string('subject');
            $table->text('body_html');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });

        $body = function (string $line): string {
            return "<p>Hi {{user.first_name}},</p>\n<p>{$line}</p>\n"
                . "<p style=\"color:#64748b\">Reference: <strong>{{reference.id}}</strong></p>";
        };

        $ticket   = "We've received your ticket and assigned it to our team. You can track progress in the IT portal.";
        $request  = 'Your service request requires your attention. Please review and take action in the IT portal.';
        $contract = 'A vendor contract is approaching its expiration date. Please review and decide on renewal.';
        $asset    = 'An asset has been assigned to you. Please confirm receipt at your earliest convenience.';
        $digest   = 'Here is your weekly summary of IT service activity across the organization.';

        $rows = [
            ['key' => 'ticket.created',           'name' => 'Ticket created',                 'subject' => 'Your ticket {{ticket.id}} has been created',     'body_html' => $body($ticket),   'enabled' => true],
            ['key' => 'ticket.assigned',          'name' => 'Ticket assigned',                'subject' => 'Ticket {{ticket.id}} has been assigned',         'body_html' => $body($ticket),   'enabled' => true],
            ['key' => 'ticket.resolved',          'name' => 'Ticket resolved',                'subject' => 'Ticket {{ticket.id}} has been resolved',         'body_html' => $body($ticket),   'enabled' => true],
            ['key' => 'request.approval_needed',  'name' => 'Request awaiting your approval', 'subject' => 'A request is awaiting your approval',            'body_html' => $body($request),  'enabled' => true],
            ['key' => 'request.approved',         'name' => 'Request approved',               'subject' => 'Your request has been approved',                 'body_html' => $body($request),  'enabled' => true],
            ['key' => 'request.rejected',         'name' => 'Request rejected',               'subject' => 'Your request has been rejected',                 'body_html' => $body($request),  'enabled' => true],
            ['key' => 'contract.expire.60d',      'name' => 'Contract expiring (60 days)',    'subject' => 'Contract {{contract.vendor}} expires in 60 days', 'body_html' => $body($contract), 'enabled' => true],
            ['key' => 'contract.expire.30d',      'name' => 'Contract expiring (30 days)',    'subject' => 'Contract {{contract.vendor}} expires in 30 days', 'body_html' => $body($contract), 'enabled' => true],
            ['key' => 'contract.expire.7d',       'name' => 'Contract expiring (7 days)',     'subject' => 'Contract {{contract.vendor}} expires in 7 days',  'body_html' => $body($contract), 'enabled' => true],
            ['key' => 'asset.assigned',           'name' => 'Asset assigned to you',          'subject' => 'An asset has been assigned to you',              'body_html' => $body($asset),    'enabled' => true],
            ['key' => 'asset.transferred',        'name' => 'Asset transfer confirmation',    'subject' => 'Asset transfer confirmation',                    'body_html' => $body($asset),    'enabled' => false],
            ['key' => 'schedule.weekly',          'name' => 'Weekly digest',                  'subject' => 'Your weekly IT service summary',                 'body_html' => $body($digest),   'enabled' => true],
            ['key' => 'employee.account_needed',  'name' => 'New employee — set credentials', 'subject' => 'New employee {{employee.code}} needs a login account', 'body_html' => "<p>Hi {{user.first_name}},</p>\n<p>A new employee <strong>{{employee.name}} ({{employee.code}})</strong> needs a login account. Please set their username and password from the Employee list.</p>", 'enabled' => true],
        ];

        $now = now();
        DB::table('email_templates')->insert(array_map(fn ($r) => $r + ['created_at' => $now, 'updated_at' => $now], $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};
