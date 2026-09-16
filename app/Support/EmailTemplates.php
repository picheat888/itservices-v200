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
                'name' => 'Your ticket has been created (สร้าง Ticket เรียบร้อย)',
                'subject' => 'Your ticket {{ticket.id}} has been created',
                // Ticket templates say {{ticket.id}} throughout. reference.id carries the same
                // ticket number, and offering an editor two names for one value invited them
                // to be used as if they were different things.
                //
                // The receipt repeats what was filed — subject, type and the description in
                // the requester's own words — so they can check it arrived as they meant it
                // without signing in.
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We\'ve received your ticket.<br>
You can tracking progress in {{app.name}}.</p>
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
                'name' => 'New ticket (Ticket ใหม่)',
                'subject' => 'New ticket {{ticket.id}} is waiting.',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new ticket has been created and is waiting for support</p>
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
                'name' => 'Ticket assigned to you (Ticket ที่ถูกมอบหมาย)',
                'subject' => 'The ticket {{ticket.id}} has been assigned to you',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} has been assigned to you.</p>
<p>Please check your ticket.</p>
<br>
<p><strong style="color:#64748b">Assigned by:</strong> <strong>{{actor.name}}</strong></p>
<p>---</p>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.forwarded',
                'name' => 'Forwarded ticket (Ticket ส่งต่อ)',
                'subject' => 'Ticket {{ticket.id}} was forwarded to you',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>You have the ticket {{ticket.id}} was forwarded to you</p>
<p>Please check your ticket because SLA clock keeps running.</p>
<br>
<p><strong style="color:#64748b">Forward by:</strong> <strong>{{from.name}}</strong></p>
<p>----</p>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.resolved',
                'name' => 'Ticket has been completed (Ticket ถูกแก้ไขเรียบร้อยแล้ว)',
                'subject' => 'The ticket {{ticket.id}} has been completed',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} has been completed ✅</p>
<p>You can tracking progress in {{app.name}}.</p>
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
                'key' => 'ticket.owner_taken',
                'name' => 'Your ticket is being handled (Ticket มี IT รับผิดชอบแล้ว)',
                'subject' => 'The ticket {{ticket.id}} is now being handled',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} is now being handled.</p>
<p>You can tracking progress in {{app.name}}.</p>
<br>
<p><strong style="color:#64748b">Responsible by:</strong> {{ticket.assignee}}</p>
<p>---</p>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'ticket.owner_forwarded',
                'name' => 'Your ticket changed hands (Ticket ถูกเปลี่ยน IT ผู้รับผิดชอบ)',
                'subject' => 'The ticket {{ticket.id}} has been transferred',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The ticket {{ticket.id}} has been transferred to another technician.</p>
<p>There is nothing you need to do.</p>
<br>
<p><strong style="color:#64748b">Responsible by:</strong> <strong>{{ticket.assignee}}</strong><br>
<strong style="color:#64748b">Previously:</strong> {{from.name}}</p>
<p>---</p>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],            [
                // The middle of a case, which used to be silent: the requester heard "we have
                // it" and then nothing until "it is done". Carries the note itself, so "we are
                // waiting on a part" arrives as news rather than as something to go and look up.
                'key' => 'ticket.updated',
                'name' => 'Progress on your ticket (ความคืบหน้า Ticket)',
                'subject' => 'There is an update on the ticket {{ticket.id}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>There is an update on the ticket {{ticket.id}}.</p>
<p>You can tracking progress in {{app.name}}.</p>
<br>
<p><strong style="color:#64748b">Update:</strong> {{ticket.update}}</p>
<p><strong style="color:#64748b">Responsible by:</strong> {{ticket.assignee}}</p>
<p>---</p>
<p><strong style="color:#64748b">Ticket No.:</strong> <strong>{{ticket.id}}</strong><br>
<strong style="color:#64748b">Subject:</strong> {{ticket.subject}}<br>
<strong style="color:#64748b">Issue type:</strong> {{ticket.category}}<br>
<strong style="color:#64748b">Details:</strong> {{ticket.details}}</p>',
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
<p>You can tracking progress in {{app.name}}.</p>
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
                'name' => 'Ticket Weekly summary (สรุป Ticket ค้างประจำสัปดาห์)',
                'subject' => '{{digest.open_count}} case(s) waiting to be taken',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>We have some outstanding tickets from last week.</p>
<p><strong>Waiting({{digest.open_count}})</strong></p>
{{digest.open_table}}
<p><strong>Not closed ({{digest.working_count}})</strong></p>
{{digest.working_table}}
<p style="color:#64748b">Please resolve the tickets from last week.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
            ],
            [
                'key' => 'request.approval_needed',
                // Carries the approval-history table. See widthFor().
                'width' => 860,
                'name' => 'Request awaiting your approval (คำขอรออนุมัติ)',
                'subject' => 'Request {{reference.id}} is awaiting approval from {{requester.name}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new IT Service Request is waiting for your approval.</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request by: </strong>{{requester.name}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Reason: </strong>{{request.reason}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p><strong>Already approved</strong></p>
{{request.approval_history}}
<br>
<p>Please review the request and approve or reject in {{app.name}}.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.approved',
                'name' => 'Request approved (คำขอผ่านอนุมัติครบทุกขั้น)',
                'subject' => 'Your request {{reference.id}} has been fully approved',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>✅ Your request has been fully approved.</p>
<p><strong style="color:#64748b">Approved Date: </strong>{{request.approved_date}}</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Reason: </strong>{{request.reason}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p>All required approvals have been completed.</p>
<p>You can check the request status in {{app.name}} at any time.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.rejected',
                // Carries the approval-history table. See widthFor().
                'width' => 860,
                'name' => 'Request rejected (คำขอไม่ได้รับอนุมัติ)',
                'subject' => 'Your request {{reference.id}} has been rejected',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>❌ Your request has been rejected.</p>
<p><strong style="color:#64748b">Rejected Date: </strong>{{request.rejected_date}}<br>
<strong style="color:#64748b">Rejected By: </strong>{{actor.name}}<br>
<strong style="color:#64748b">Reason: </strong>{{remark}}</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p><strong>Already approved</strong></p>
{{request.approval_history}}
<br>
<p>Please review the reason above and submit a new request if needed.</p>
<p>You can check the request status in {{app.name}} at any time.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.submitted',
                'name' => 'Request submitted (ส่งคำขอเรียบร้อย)',
                'subject' => 'Your request {{reference.id}} has been submitted',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>✅ Your IT Service Request has been successfully submitted.</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Reason: </strong>{{request.reason}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<p>----</p>
<p><strong>Next Approver</strong></p>
<p><strong style="color:#64748b">Step: </strong>{{step.label}}<br>
<strong style="color:#64748b">Full Name: </strong>{{approver.name}}<br>
<strong style="color:#64748b">Position: </strong>{{approver.position}}<br>
<strong style="color:#64748b">Department: </strong>{{approver.department}}</p>
<br>
<p>You can check the request status in {{app.name}} at any time.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.ready_to_fulfill',
                // Carries the approval-history table. See widthFor().
                'width' => 860,
                'name' => 'Request ready for IT (คำขอพร้อมให้ IT ดำเนินการ)',
                'subject' => 'Request {{reference.id}} is approved and ready for IT',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>✅ A request has been fully approved and is ready for IT.</p>
<p>Please check the ticket and the request.</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request by: </strong>{{requester.name}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Ticket No.: </strong>{{request.ticket_no}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Reason: </strong>{{request.reason}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p><strong>Already approved</strong></p>
{{request.approval_history}}',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'request.fulfilled',
                'name' => 'Request fulfilled (คำขอดำเนินการเสร็จแล้ว)',
                'subject' => 'Your request {{reference.id}} has been completed',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>✅ Your request has been completed successfully.</p>
<p><strong style="color:#64748b">Completed Date: </strong>{{request.fulfilled_date}}<br>
<strong style="color:#64748b">Completed By: </strong>{{request.fulfilled_by}}</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Reason: </strong>{{request.reason}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p>If you have any questions or need further assistance, please contact the IT team.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // Approved, then IT cancelled it — a different message from request.rejected,
                // which is an approver saying no during the chain. The approval table stays:
                // this one cleared every step, and the reader should be able to see that.
                'key' => 'request.not_delivered',
                // Carries the approval-history table. See widthFor().
                'width' => 860,
                'name' => 'Request was cancelled by IT (คำขอผ่านอนุมัติ แต่ยกเลิกโดย IT)',
                'subject' => 'Your request {{reference.id}} has been cancelled by IT.',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>⚠️ Your request was fully approved, but the IT team has cancelled it.</p>
<p><strong style="color:#64748b">Cancelled Date: </strong>{{request.cancelled_date}}<br>
<strong style="color:#64748b">Cancelled By: </strong>{{actor.name}}<br>
<strong style="color:#64748b">Reason: </strong>{{remark}}</p>
<br>
<p><strong style="color:#64748b">Request title: </strong>{{request.title}}<br>
<strong style="color:#64748b">Request No.: </strong>{{reference.id}}<br>
<strong style="color:#64748b">Ticket No.: </strong>{{request.ticket_no}}<br>
<strong style="color:#64748b">Date: </strong>{{request.date}}<br>
<strong style="color:#64748b">Type: </strong>{{request.type}}<br>
<strong style="color:#64748b">Request details: </strong>{{request.details}}</p>
<br>
<p><strong>Already approved</strong></p>
{{request.approval_history}}
<br>
<p>If you still need this, please submit a new request or contact the IT team.</p>
<p>You can check the request status in {{app.name}} at any time.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                // The Monday summary of approvals somebody has left sitting. `digest.table`
                // arrives as ready-made HTML rows — an administrator rewords the message
                // around it, but nobody should have to hand-write table markup here.
                'key' => 'request.stalled_digest',
                'name' => 'Weekly summary of requests waiting on you (รอคุณอนุมัติ)',
                'subject' => '{{digest.count}} Request(s) still waiting for your approval',
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
<strong style="color:#64748b">Type:</strong> {{asset.type}}<br>
<strong style="color:#64748b">Model:</strong> {{asset.model}}<br>
<strong style="color:#64748b">Tag:</strong> {{asset.tag}}</p>
<br>
<p style="color:#64748b">If you think an error has occurred, please contact IT.</p>',
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
<strong style="color:#64748b">Type:</strong> {{asset.type}}<br>
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
                'name' => 'Weekly contracts alert summary (เตือนสรุปประจำสัปดาห์)',
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
                'name' => 'Low Stock Alert (เตือนสินค้าต่ำกว่า Min)',
                'subject' => 'Low Stock Alert: {{stock.sku}} ({{stock.qty}} left)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Some SKUs are below the minimum stock level and need to be reordered.</p>
<br>
<strong>Information</strong>
<p style="color:#64748b"><strong>SKU No.: </strong>{{stock.sku}} </p>
<p style="color:#64748b"><strong>Item Name: </strong>{{stock.name}} </p>
<p style="color:#64748b"><strong>Q\'ty (Current): </strong>{{stock.qty}} </p>
<p style="color:#64748b"><strong>Min Alert: </strong>{{stock.min}} </p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.out_of_stock',
                'name' => 'Out of stock alert (เตือนสินค้าหมด Stock)',
                'subject' => 'Out of stock alert: {{stock.sku}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Some SKUs are currently out of stock.</p>
<p>Please review the stock and arrange a reorder as needed.</p>
<br>
<strong>Information</strong>
<p style="color:#64748b"><strong>SKU No.: </strong>{{stock.sku}} </p>
<p style="color:#64748b"><strong>Item Name: </strong>{{stock.name}} </p>
<p style="color:#64748b"><strong>Q\'ty (Current): </strong>{{stock.qty}} </p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_approval_needed',
                // Two tables, the second of five columns. See widthFor().
                'width' => 980,
                'name' => 'Weekly open requests summary(สรุปคำขอเบิกค้างประจำสัปดาห์)',
                'subject' => 'Weekly stock requests - {{count}} still open',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Please find below the Weekly Stock Requests Alert Summary.<br>
This report summarizes all stock requests that are still open and have not yet been completed.</p>
<br>
<p><strong>Request Summary</strong></p>
{{stock.request_summary_table}}
<br>
<p><strong>Request Details</strong></p>
{{stock.requests_table}}
<p>Please review the open requests and take the necessary action to complete them.</p>
<p style="color:#64748b"><strong><u>Note</u></strong>: Requests with the status Fulfilled, Rejected, or Cancelled are not included in this report.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
            ],
            [
                'key' => 'stock.request_approved',
                'name' => 'Stock - Request approved (คำขอเบิกได้รับอนุมัติ)',
                'subject' => 'Your stock request has been approved',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>✅ Your stock request has been approved. </p>
<br>
<p><strong style="color:#64748b">Request No.: </strong>{{stock.request_no}}<br>
<strong style="color:#64748b">Request Date: </strong>{{stock.request_date}}<br>
<strong style="color:#64748b">Approved By: </strong>{{stock.approver}}<br>
<strong style="color:#64748b">Item: </strong>{{stock.name}} ×{{stock.qty}}</p>
<br>
<p>The request has been approved and will be processed accordingly.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_rejected',
                'name' => 'Stock - Request rejected (คำขอเบิกไม่ได้รับอนุมัติ)',
                'subject' => 'Your stock request has been rejected',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>❌ Your stock request has been rejected.</p>
<br>
<p><strong style="color:#64748b">Request No.: </strong>{{stock.request_no}}<br>
<strong style="color:#64748b">Request Date: </strong>{{stock.request_date}}<br>
<strong style="color:#64748b">Rejected By: </strong>{{stock.approver}}<br>
<strong style="color:#64748b">Item: </strong>{{stock.name}} ×{{stock.qty}}</p>
<br>
<p>Please contact {{stock.approver}} if you need to know why, and submit a new request if needed.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_fulfilled',
                'name' => 'Stock - Request fulfilled (จ่ายของตามคำขอแล้ว)',
                'subject' => 'Your stock request has been fulfilled',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>🎁 Your stock request has been fulfilled.</p>
<br>
<p><strong style="color:#64748b">Request No.: </strong>{{stock.request_no}}<br>
<strong style="color:#64748b">Request Date: </strong>{{stock.request_date}}<br>
<strong style="color:#64748b">Fulfilled By: </strong>{{stock.fulfilled_by}}<br>
<strong style="color:#64748b">Fulfilled Date: </strong>{{stock.fulfilled_date}}<br>
<strong style="color:#64748b">Item: </strong>{{stock.name}} ×{{stock.qty}}</p>
<br>
<p>The requested items have been issued as requested.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.overstock_alert',
                'name' => 'Overstock alert (เตือนสินค้าเกิน Max)',
                'subject' => 'Overstock: {{stock.sku}} ({{stock.qty}} on hand)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Some SKUs have stock levels above the maximum level.</p>
<p>Please review the stock.</p>
<br>
<strong>Information</strong>
<p style="color:#64748b"><strong>SKU No.: </strong>{{stock.sku}} </p>
<p style="color:#64748b"><strong>Item Name: </strong>{{stock.name}} </p>
<p style="color:#64748b"><strong>Q\'ty (Current): </strong>{{stock.qty}} </p>
<p style="color:#64748b"><strong>Max Alert: </strong>{{stock.max}} </p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.request_created',
                'name' => 'New Request (คำขอเบิกสินค้าใหม่)',
                'subject' => 'New stock request submitted: {{stock.request_by}}',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>A new stock request has been submitted.</p>
<p>Please review and approve the request.</p>
<br>
<strong>Stock request</strong>
<p>----</p>
<p style="color:#64748b"><strong>Request No.: </strong>{{stock.request_no}} </p>
<p style="color:#64748b"><strong>Requester by: </strong>{{stock.request_by}} </p>
<p style="color:#64748b"><strong>Reason: </strong>{{stock.request_reason}} </p>
<p style="color:#64748b"><strong>SKU No.: </strong>{{stock.sku}} </p>
<p style="color:#64748b"><strong>Item Name: </strong>{{stock.name}} </p>
<p style="color:#64748b"><strong>Request Q\'ty: </strong>{{stock.qty}} </p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
            [
                'key' => 'stock.alert_digest',
                // Two tables, the second of six columns. See widthFor().
                'width' => 980,
                'name' => 'Weekly stock alert summary (สรุปแจ้งเตือนสต็อกประจำสัปดาห์)',
                'subject' => 'Weekly stock alert - {{count}} item need attention',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>Please find below the Weekly Stock Alert Summary.<br>
This report summarizes all items that currently require attention:</p>
<p style="color:#64748b"><strong>Out of Stock</strong> - Items with no available stock<br>
<strong>Low Stock</strong> - Items below the minimum stock level<br>
<strong>Overstock</strong> - Items above the maximum stock level</p>
<br>
<p><strong>Stock Summary</strong></p>
{{stock.summary_table}}
<br>
<p><strong>Item Details</strong></p>
{{stock.items_table}}
<p>Please review the stock levels and take the necessary action where required.</p>',
                'enabled' => true,
                'cadence' => 'weekly',
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
