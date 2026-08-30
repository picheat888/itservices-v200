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
     * @return list<array{key:string,name:string,subject:string,body_html:string,enabled:bool,cadence:string,width?:int}>
     */
    public static function all(): array
    {
        return [
            [
                'key' => 'ticket.created',
                'name' => 'Ticket created',
                'subject' => 'Your ticket {{ticket.id}} has been created',
                // Ticket templates say {{ticket.id}} throughout. reference.id carries the same
                // ticket number, and offering an editor two names for one value invited them
                // to be used as if they were different things.
                //
                // The receipt repeats what was filed — subject, type and the description in
                // the requester's own words — so they can check it arrived as they meant it
                // without signing in.
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket and assigned it to our team.<br>
You can track progress in {{app.name}}.</p>
<br>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Goes to the IT staff who are allowed to take this type of case, not to the
                // requester — hence {{ticket.requester}}, the one field the receipt has no use
                // for. The bell fires at the same moment; this reaches whoever is not looking
                // at the portal, which is exactly when a case sits unclaimed.
                'key' => 'ticket.new_case',
                'name' => 'New case waiting to be taken',
                'subject' => 'New ticket {{ticket.id}} is waiting to be taken',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new case has been created and is waiting for support</p>
<br>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Requester:</strong> {{ticket.requester}}<br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.assigned',
                'name' => 'Ticket assigned',
                'subject' => 'Ticket {{ticket.id}} has been assigned',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket and assigned it to our team. You can track progress in {{app.name}}.</p>
<p style="color:#64748b">Reference: <strong>{{ticket.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.forwarded',
                'name' => 'Ticket forwarded',
                'subject' => 'Ticket {{ticket.id}} was forwarded to you',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Ticket <strong>{{ticket.id}}</strong> - {{ticket.subject}} was forwarded to you by {{from.name}}. Its SLA clock keeps running, so please pick it up in {{app.name}}.</p>
<p style="color:#64748b">Reference: <strong>{{ticket.id}}</strong></p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.resolved',
                'name' => 'Ticket has been completed (Ticket ถูกแก้ไขเรียบร้อยแล้ว)',
                'subject' => 'The ticket {{ticket.id}} has been completed',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} has been completed ✅</p>
<p>You can track progress in {{app.name}}.</p>
<br>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>
<p>---</p>
<p><strong>Resolution:</strong> {{ticket.resolution}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Sits where ticket.sla_breach used to. The SLA sweep is bell-only now, and a
                // case closed WITHOUT being fixed is the outcome the requester most needs told.
                'key' => 'ticket.cancelled',
                'name' => 'Ticket has been Cancelled (Ticket ถูกยกเลิก)',
                'subject' => 'The ticket {{ticket.id}} has been Cancelled',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} has been Cancelled ❌</p>
<p>You can track progress in {{app.name}}.</p>
<br>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>
<p>---</p>
<p><strong>Resolution:</strong> {{ticket.resolution}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Monday morning's picture of the board. Both tables arrive as ready-made HTML;
                // an administrator rewords the message around them. The two lists answer
                // different questions — what nobody has picked up, and what the team is
                // holding — so they are separate variables rather than one merged table.
                'key' => 'ticket.weekly_digest',
                'name' => 'Weekly summary of open cases',
                'subject' => '{{digest.open_count}} case(s) waiting to be taken',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Here is where the team\'s cases stand this morning.</p>
<p><strong>Waiting to be taken ({{digest.open_count}})</strong></p>
{{digest.open_table}}
<p><strong>Taken but not closed ({{digest.working_count}})</strong></p>
{{digest.working_table}}
<p style="color:#64748b">Open a case in {{app.name}} to take it or finish it.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
            ],
            [
                'key' => 'request.approval_needed',
                'name' => 'Request awaiting your approval',
                'subject' => 'A request is awaiting your approval',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Your service request requires your attention. Please review and take action in {{app.name}}.</p>
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
<p style="color:#64748b">Approving or rejecting each one takes a moment in {{app.name}}.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
            ],
            [
                // The bell fires at the same moment and links to My Assets; this reaches the
                // recipient who is not in the portal — which is most people, most of the time,
                // and a hand-over nobody accepts sits in limbo until they do.
                'key' => 'asset.assigned',
                'name' => 'Asset transferred to you (ทรัพย์สินที่โอนไปยังผู้ใช้งาน)',
                'subject' => 'Asset Management: Your new asset is ready: {{asset.code}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>An asset has been transferred to you.</p>
<p>Please confirm receipt in {{app.name}}.</p>
<br>
<p><u><strong>Information</strong></u></p>
<p><strong style="color:#64748b">Asset:</strong> <strong>{{asset.code}}</strong><br>
<strong style="color:#64748b">Model:</strong> {{asset.model}}<br>
<strong style="color:#64748b">Tag:</strong> {{asset.tag}}<br>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Goes to whoever can receive assets back into the pool, not to the holder —
                // the holder already knows, they are the one sending it back.
                'key' => 'asset.return_requested',
                'name' => 'The assets have been returned to the IT department. (ส่งคืนทรัพย์สินโดยผู้ใช้งาน)',
                'subject' => 'Asset Management: Asset returned by {{asset.holder}} ({{asset.code}})',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>An asset has been returned and is waiting to be received into the inventory.</p>
<p>Please review and confirm receipt in the system.</p>
<br>
<p><strong><u>Return Details</u>:</strong></p>
<p><strong style="color:#64748b">Asset:</strong> <strong>{{asset.code}}</strong><br>
<strong style="color:#64748b">Model:</strong> {{asset.model}}<br>
<strong style="color:#64748b">Tag:</strong> {{asset.tag}}<br>
<strong style="color:#64748b">Returned by:</strong> {{asset.holder}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // One mail per departure, matching the single bell — a leaver holding five
                // machines is one collection trip, not five separate pieces of news.
                //
                // It carries the devices themselves ({{asset.table}}, built in PHP like the
                // digests): whoever collects them walks the floor with this open, and a bare
                // count told them how many to look for but not what.
                'key' => 'asset.offboarding',
                'name' => 'Assets to Collect from Resigning Employees (ตรวจสอบทรัพย์สินพนักงานสิ้นสุดการทำงาน)',
                'subject' => 'Offboarding: {{employee.name}} - {{asset.count}} asset(s) to collect',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>{{employee.name}} has resigned, and we need to collect their company assets.</p>
<br>
<p><u><strong>Information</strong></u></p>
<p><strong style="color:#64748b">Employee ID:</strong> <strong>{{employee.code}}</strong><br>
<strong style="color:#64748b">Full name:</strong> {{employee.name}}<br>
<strong style="color:#64748b">Last working day:</strong> {{employee.last_working}}<br>
<strong style="color:#64748b">Assets to collect:</strong> {{asset.count}}</p>
{{asset.table}}
<p style="color:#64748b">The list is on the Assets management, filtered to Pending return.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Deliberately one template for both kinds of recall — a hand-over called off
                // before it was accepted and a device taken back out of someone\'s hands read
                // the same to the reader: it is not yours and there is nothing to do.
                'key' => 'asset.recalled',
                'name' => 'Asset recalled from you (บังคับเรียกคืนทรัพย์)',
                'subject' => 'Asset Management: {{asset.code}} has been recalled',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Just letting you know that the following asset has been returned to us and removed from your account. You don\'t need to confirm anything else.</p>
<br>
<p><u><strong>Information</strong></u></p>
<p><strong style="color:#64748b">Asset:</strong> <strong>{{asset.code}}</strong><br>
<p><strong style="color:#64748b">Type:</strong> {{asset.type}}<br>
<strong style="color:#64748b">Model:</strong> {{asset.model}}<br>
<strong style="color:#64748b">Tag:</strong> {{asset.tag}}</p>
<br>
<p style="color:#64748b">If you think an error has occurred, please contact IT.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'employee.account_needed',
                'name' => 'New employee (พนักงานใหม่)',
                'subject' => 'Employee Management: New employee',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>You have a new employee on {{app.name}}.</p>
<br>
<p><strong>Information</strong></p>
<p><strong style="color:#64748b">Employee ID:</strong> {{employee.code}}</p>
<p><strong style="color:#64748b">Name:</strong> {{employee.name}}</p>
<p><strong style="color:#64748b">Position:</strong> {{employee.position}}</p>
<p><strong style="color:#64748b">Section:</strong> {{employee.section}}</p>
<p><strong style="color:#64748b">Department:</strong> {{employee.department}}</p>
<p><strong style="color:#64748b">Working Start:</strong> {{employee.working}}</p>
<br>
<p>Please setup username and password for the Employee.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'employee.offboarding',
                'name' => 'Employee resigned (แจ้งพนักงานลาออก)',
                'subject' => 'Offboarding: {{employee.name}} has resigned',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>{{employee.name}} has resigned.</p>
<br>
<p><u><strong>Information</strong></u></p>
<p><strong style="color:#64748b">Employee ID:</strong> <strong>{{employee.code}}</strong><br>
<strong style="color:#64748b">Full name:</strong> {{employee.name}}<br>
<strong style="color:#64748b">Last working day:</strong> {{employee.last_working}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'access.offboarding',
                // A five-column table, two columns holding a long address. See widthFor().
                'width' => 860,
                'name' => 'Clear the access for a resigning employee (เคลียร์สิทธิ์พนักงานลาออก)',
                'subject' => 'Offboarding: {{employee.name}} - {{access.count}} access item(s) to clear',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>{{employee.name}} has resigned.</p>
<br>
<p><u><strong>Information</strong></u></p>
<p><strong style="color:#64748b">Employee ID:</strong> <strong>{{employee.code}}</strong><br>
<strong style="color:#64748b">Full name:</strong> {{employee.name}}<br>
<strong style="color:#64748b">Last working day:</strong> {{employee.last_working}}</p>
<br>
<p><strong>Access Directory</strong></p>
{{access.table}}
<p>Please disable and revoke all access rights.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'contract.expiry_alert',
                'name' => 'Contract expiring soon (เตือนสัญญาก่อนหมดอายุตาม Schedule)',
                'subject' => 'Contract Management: {{contract.vendor}} expires in {{contract.days_remaining}} days',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The contract is expiring.<br>
Please review and decide on renewal.</p>
<br>
<p><strong>Information</strong></p>
<p><strong style="color:#64748b">Expires in:</strong> <strong>{{contract.days_remaining}} days</strong> ({{contract.end_date}})<br>
<strong style="color:#64748b">Contract No.:</strong> {{contract.code}}<br>
<strong style="color:#64748b">Vendor/Supplier:</strong> {{contract.vendor}}<br>
<strong style="color:#64748b">Contract Name:</strong> {{contract.name}}<br>
<strong style="color:#64748b">Contract Details:</strong> {{contract.details}}</p>',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'contract.expired_alert',
                'name' => 'Contract overdue (เตือนสัญญาเกินกำหนดวันหมดอายุ)',
                'subject' => 'Contract Management: {{contract.vendor}} is overdue by {{contract.days_overdue}} days',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The contract has passed its end date and is still open.<br>
Please renew it or close it out.</p>
<br>
<p><strong>Information</strong></p>
<p><strong style="color:#64748b">Overdue by:</strong> <strong>{{contract.days_overdue}} days</strong> (ended {{contract.end_date}})<br>
<strong style="color:#64748b">Contract No.:</strong> {{contract.code}}<br>
<strong style="color:#64748b">Vendor / Supplier:</strong> {{contract.vendor}}<br>
<strong style="color:#64748b">Contract Name:</strong> {{contract.name}}<br>
<strong style="color:#64748b">Contract Details:</strong> {{contract.details}}</p>',
                'enabled' => true,
                'cadence' => 'daily',
            ],
            [
                'key' => 'contract.weekly_digest',
                // Six columns, two of them a vendor and a contract name. See widthFor().
                'width' => 980,
                'name' => 'Contract Weekly summary (เตือนสรุปประจำสัปดาห์)',
                'subject' => 'Contract Management: {{digest.expiring_count}} expiring, {{digest.overdue_count}} overdue',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Contracts are expiring and overdue.<br>
Please review the contracts.</p>
<br>
<p><strong>Expiring ({{digest.expiring_count}})</strong></p>
{{digest.expiring_table}}
<br>
<p><strong>Overdue ({{digest.overdue_count}})</strong></p>
{{digest.overdue_table}}',
                'enabled' => true,
                'cadence' => 'weekly',
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

    /** The layout width every template gets unless its own definition asks for more. */
    public const DEFAULT_WIDTH = 720;

    /**
     * How wide the branded frame is rendered for a given template, in pixels.
     *
     * A layout decision belonging to the template's design, not to its wording — which is
     * why it lives here and not on the email_templates row: an administrator rewording a
     * digest, or resetting it, must not be able to make its table stop fitting.
     *
     * Most mail is a paragraph and a reference, and 720 already suits the five-column
     * digests. The weekly contract summary carries six columns including a vendor and a
     * contract name, and at 720 both wrap to three lines each.
     */
    public static function widthFor(?string $key): int
    {
        return (int) (self::find((string) $key)['width'] ?? self::DEFAULT_WIDTH);
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
