<?php

namespace App\Support;

/**
 * Canonical "standard" definitions for every system email template.
 *
 * Single source of truth shared by two places so they can never drift apart:
 *  - EmailTemplateSeeder — establishes the templates on a fresh install.
 *  - EmailTemplateController@reset / @resetAll — restores a template to standard
 *    after an admin has edited it.
 *
 * The array order also drives the seed order and the display order on the
 * Notifications screen. Each entry is the full standard state of one template.
 */
class EmailTemplates
{
    /**
     * Every standard template in display order.
     *
     * @return list<array{key:string,name:string,subject:string,body_html:string,enabled:bool,cadence:string}>
     */
    public static function all(): array
    {
        return [
            [
                'key' => 'ticket.created',
                'name' => 'Ticket created',
                'subject' => 'Your ticket {{ticket.id}} has been created',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket and assigned it to our team. You can track progress in the IT portal.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.assigned',
                'name' => 'Ticket assigned',
                'subject' => 'Ticket {{ticket.id}} has been assigned',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket and assigned it to our team. You can track progress in the IT portal.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.forwarded',
                'name' => 'Ticket forwarded',
                'subject' => 'Ticket {{ticket.id}} was forwarded to you',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Ticket <strong>{{ticket.id}}</strong> - {{ticket.subject}} was forwarded to you by {{from.name}}. Its SLA clock keeps running, so please pick it up in the IT portal.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.resolved',
                'name' => 'Ticket resolved',
                'subject' => 'Ticket {{ticket.id}} has been resolved',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket and assigned it to our team. You can track progress in the IT portal.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.sla_breach',
                'name' => 'Ticket SLA breached',
                'subject' => 'Ticket {{ticket.id}} has breached its SLA',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Ticket <strong>{{ticket.id}}</strong> - {{ticket.subject}} has passed its SLA target and needs attention.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.approval_needed',
                'name' => 'Request awaiting your approval',
                'subject' => 'A request is awaiting your approval',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your service request requires your attention. Please review and take action in the IT portal.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.approved',
                'name' => 'Request approved',
                'subject' => 'Your request has been approved',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your request <strong>{{request.title}}</strong> passed every approval step. The IT team will take it from here.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.rejected',
                'name' => 'Request rejected',
                'subject' => 'Your request has been rejected',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your request <strong>{{request.title}}</strong> was rejected by {{actor.name}}.</p>
<p>Remark: {{remark}}</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.submitted',
                'name' => 'Request submitted',
                'subject' => 'Your request {{reference.id}} has been submitted',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We received your request <strong>{{request.title}}</strong>. It is now waiting for {{step.label}} to approve.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.ready_to_fulfill',
                'name' => 'Request ready to fulfill',
                'subject' => 'Request {{reference.id}} is approved and ready for IT',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p><strong>{{request.title}}</strong> (by {{requester.name}}) cleared every approval step and is waiting for IT fulfillment.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.fulfilled',
                'name' => 'Request fulfilled',
                'subject' => 'Your request {{reference.id}} is done',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your request <strong>{{request.title}}</strong> has been fulfilled by the IT team.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Approved, then IT could not deliver it — a different message from
                // request.rejected, which is an approver saying no during the chain.
                'key' => 'request.not_delivered',
                'name' => 'Request could not be delivered',
                'subject' => 'Your request {{reference.id}} was closed without delivery',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your request <strong>{{request.title}}</strong> was approved, but the IT team could not deliver it.</p>
<p><strong>Reason:</strong> {{remark}}</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // The Monday summary of approvals somebody has left sitting. `digest.table`
                // arrives as ready-made HTML rows — an administrator rewords the message
                // around it, but nobody should have to hand-write table markup here.
                'key' => 'request.stalled_digest',
                'name' => 'Weekly summary of requests waiting on you',
                'subject' => '{{digest.count}} request(s) still waiting for your approval',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>These requests have been waiting for your approval for more than a week.</p>
{{digest.table}}
<p style="color:#64748b">Approving or rejecting each one takes a moment in the IT portal.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
            ],
            [
                'key' => 'asset.assigned',
                'name' => 'Asset assigned to you',
                'subject' => 'An asset has been assigned to you',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>An asset has been assigned to you. Please confirm receipt at your earliest convenience.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'asset.transferred',
                'name' => 'Asset transfer confirmation',
                'subject' => 'Asset transfer confirmation',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>An asset has been assigned to you. Please confirm receipt at your earliest convenience.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => false,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'schedule.weekly',
                'name' => 'Weekly digest',
                'subject' => 'Your weekly IT service summary',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Here is your weekly summary of IT service activity across the organization.</p>
<p style="color:#64748b">Reference: <strong>{{reference.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'employee.account_needed',
                'name' => 'New employee - set credentials',
                'subject' => 'New employee {{employee.code}} needs a login account',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new employee <strong>{{employee.name}} ({{employee.code}})</strong> needs a login account. Please set their username and password from the Employee list.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'contract.expiry_alert',
                'name' => 'Contract expiring soon',
                'subject' => 'Contract {{contract.vendor}} expires in {{contract.days_remaining}} days',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} expires in <strong>{{contract.days_remaining}}</strong> days (on {{contract.end_date}}). Please review and decide on renewal.</p>
<p style="color:#64748b">Reference: <strong>{{contract.code}}</strong></p>',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'contract.expired_alert',
                'name' => 'Contract overdue',
                'subject' => 'Contract {{contract.vendor}} is overdue ({{contract.days_overdue}} days past end date)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} passed its end date <strong>{{contract.days_overdue}}</strong> days ago (on {{contract.end_date}}) and is still open. Please renew it or close it out (mark as expired).</p>
<p style="color:#64748b">Reference: <strong>{{contract.code}}</strong></p>',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'stock.low_alert',
                'name' => 'Stock - Low alert',
                'subject' => 'Stock low: {{stock.sku}} ({{stock.qty}} left)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A stock item has dropped to or below its minimum level and may need reordering.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.out_of_stock',
                'name' => 'Stock - Out of stock alert',
                'subject' => 'Out of stock: {{stock.sku}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A stock item is now out of stock. Please reorder as soon as possible.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_approval_needed',
                'name' => 'Stock - waiting approve & fulfill',
                'subject' => 'Stock requests awaiting action - {{count}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>{{count}} stock request(s) awaiting approval or fulfilment:</p>
{{items}}',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'stock.request_approved',
                'name' => 'Stock - Respond to the request (Approved)',
                'subject' => 'Your stock request has been approved',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your stock request has been approved and is ready to be fulfilled.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_rejected',
                'name' => 'Stock - Respond to the request (Rejected)',
                'subject' => 'Your stock request has been rejected',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your stock request has been rejected. Please contact IT if you have questions.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_fulfilled',
                'name' => 'Stock - Respond to the request (fulfilled)',
                'subject' => 'Your stock request has been fulfilled',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your stock request has been fulfilled and the items have been issued.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.overstock_alert',
                'name' => 'Stock - Overstock alert',
                'subject' => 'Overstock: {{stock.sku}} ({{stock.qty}} on hand)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A stock item has risen above its maximum level (overstock).</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_created',
                'name' => 'Stock - New Request',
                'subject' => 'New stock request submitted: {{stock.sku}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new stock request has been submitted and is awaiting processing.</p>
<p style="color:#64748b">Item: <strong>{{stock.sku}}</strong> - {{stock.name}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.alert_digest',
                'name' => 'Stock - Daily alert digest',
                'subject' => 'Daily stock alert - {{count}} item(s) need attention',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>{{count}} stock item(s) need attention:</p>
{{items}}',
                'enabled' => true,
                'cadence' => 'daily',
            ],
        ];
    }

    /**
     * Look up one standard template by its event key.
     *
     * @return array{key:string,name:string,subject:string,body_html:string,enabled:bool,cadence:string}|null
     */
    public static function find(string $key): ?array
    {
        foreach (self::all() as $template) {
            if ($template['key'] === $key) {
                return $template;
            }
        }

        return null;
    }

    /**
     * Whether the given key has a standard definition (i.e. it can be reset).
     */
    public static function has(string $key): bool
    {
        return self::find($key) !== null;
    }

    /**
     * Flat list of every standard key.
     *
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_map(static fn (array $template): string => $template['key'], self::all());
    }
}
