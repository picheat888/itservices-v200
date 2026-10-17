<?php

namespace App\Support;

use App\Models\Notification\NotificationTemplate;

/**
 * Canonical definition of every in-app notification — the counterpart to EmailTemplates.
 *
 * Keyed on the SPA's own message key (`notif_asset_assigned`, …) because that is already
 * the exact granularity of one distinct message: the front end resolves a notification to
 * one of these keys today, so an administrator's override slots straight in without
 * touching that resolution.
 *
 * Only `message_en` / `message_th` / `enabled` are stored (see the notification_templates table).
 * Everything else here is descriptive and lives in code, so rewording a trigger or adding
 * a notification never needs a migration.
 *
 * `audience` is written in words rather than as a permission key. Who hears a notification is
 * decided by the permission check at the send site, and repeating the key here would be a
 * second source of truth that silently goes stale; a sentence cannot be mistaken for one.
 */
class NotificationCatalogue
{
    /**
     * Every bell in display order, grouped by module.
     *
     * @return list<array{key:string,module:string,name:string,trigger:string,audience:string,message_en:string,message_th:string,enabled:bool}>
     */
    public static function all(): array
    {
        return [
            [
                'key' => 'notif_cred_required',
                'module' => 'employees',
                'name' => 'Login account needed',
                'trigger' => 'An employee record is created without a login account',
                'audience' => 'Whoever can set credentials',
                'message_en' => 'No login account yet. Set a username and password.',
                'message_th' => 'ยังไม่มีบัญชีเข้าใช้งาน ตั้ง Username และ Password ให้',
                'enabled' => true,
            ],
            [
                'key' => 'notif_resigned',
                'module' => 'employees',
                'name' => 'Resignation - offboarding task',
                'trigger' => 'A resignation is recorded',
                'audience' => 'Whoever can set credentials',
                'message_en' => 'Resigned. Revoke the login account and reclaim assets.',
                'message_th' => 'ลาออกแล้ว ปิดบัญชีและเรียกคืนทรัพย์สิน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_departure',
                'module' => 'employees',
                'name' => 'Resignation - for information',
                'trigger' => 'A resignation is recorded',
                'audience' => 'Everyone who can view employees',
                'message_en' => 'Resigned. Review anything routed through them.',
                'message_th' => 'ลาออกแล้ว ตรวจสอบงานที่ผ่านพนักงานคนนี้',
                'enabled' => true,
            ],
            [
                'key' => 'notif_access_offboarding',
                'module' => 'access',
                'name' => 'Leaver still holds access',
                'trigger' => 'A resignation leaves grants open or a resource without an owner',
                'audience' => 'Whoever can edit an access registry',
                // {grants} and {owned} are still passed by the sender; this wording chose not
                // to spend the tray's one line on the breakdown, which the screen behind it has.
                'message_en' => 'Resigned but still holds {total} access items. Clear them.',
                'message_th' => 'ลาออกแล้ว แต่ยังมีสิทธิ์อยู่ {total} รายการ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_contract_expiring',
                'module' => 'contracts',
                'name' => 'Contract expiring',
                'trigger' => 'A contract enters its reminder window',
                'audience' => 'Whoever has contract alerts switched on',
                'message_en' => 'Expires in {days} days',
                'message_th' => 'หมดอายุในอีก {days} วัน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_contract_expired',
                'module' => 'contracts',
                'name' => 'Contract overdue',
                'trigger' => 'A contract passes its end date',
                'audience' => 'Whoever has contract alerts switched on',
                'message_en' => 'Overdue by {days} days. Renew or close it.',
                'message_th' => 'เกินกำหนดมาแล้ว {days} วัน ต่อสัญญาหรือปิดสัญญา',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_out',
                'module' => 'stock',
                'name' => 'Out of stock',
                'trigger' => 'An item reaches zero on hand',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Out of stock',
                'message_th' => 'หมดสต็อก',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_low',
                'module' => 'stock',
                'name' => 'Below minimum',
                'trigger' => 'An item falls under its minimum',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Below minimum. Reorder.',
                'message_th' => 'ต่ำกว่าขั้นต่ำ ควรสั่งเพิ่ม',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_over',
                'module' => 'stock',
                'name' => 'Overstock',
                'trigger' => 'An item rises above its maximum',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Overstock',
                'message_th' => 'เกินขั้นสูง',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_created',
                'module' => 'stock',
                'name' => 'Stock request submitted',
                'trigger' => 'Somebody files a stock request',
                'audience' => 'Whoever can approve stock requests',
                'message_en' => 'New stock request',
                'message_th' => 'มีคำขอเบิกใหม่',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_waiting',
                'module' => 'stock',
                'name' => 'Stock request waiting',
                'trigger' => 'A stock request still needs approving or fulfilling',
                'audience' => 'Whoever can approve stock requests',
                'message_en' => 'Waiting for approval or fulfilment',
                'message_th' => 'รออนุมัติหรือรอจ่ายอะไหล่',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_approved',
                'module' => 'stock',
                'name' => 'Stock request approved',
                'trigger' => 'A stock request is approved',
                'audience' => 'The person who filed it',
                'message_en' => 'Your stock request was approved',
                'message_th' => 'คำขอเบิกของคุณได้รับอนุมัติแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_rejected',
                'module' => 'stock',
                'name' => 'Stock request rejected',
                'trigger' => 'A stock request is rejected',
                'audience' => 'The person who filed it',
                'message_en' => 'Your stock request was not approved',
                'message_th' => 'คำขอเบิกของคุณไม่ได้รับอนุมัติ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_fulfilled',
                'module' => 'stock',
                'name' => 'Stock request fulfilled',
                'trigger' => 'A stock request is handed over',
                'audience' => 'The person who filed it',
                'message_en' => 'Your stock request has been fulfilled',
                'message_th' => 'จ่ายอะไหล่ตามคำขอของคุณแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_count_draft',
                'module' => 'stock',
                'name' => 'Stock count left in draft',
                'trigger' => 'A stock count is saved but never posted',
                'audience' => 'Whoever can run a stock count',
                'message_en' => 'Stock count still in draft',
                'message_th' => 'การนับสต็อกยังเป็นฉบับร่าง',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_submitted',
                'module' => 'requests',
                'name' => 'Request submitted',
                'trigger' => 'A request is filed and enters its chain',
                'audience' => 'The requester and followers',
                'message_en' => 'Submitted, waiting for {step}',
                'message_th' => 'ส่งคำขอแล้ว รอ {step} อนุมัติ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_waiting',
                'module' => 'requests',
                'name' => 'Waiting on your approval',
                'trigger' => 'A chain step reaches an approver',
                'audience' => 'The approver on that step',
                'message_en' => 'Waiting for your decision ({step})',
                'message_th' => 'รอคุณพิจารณา ({step})',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_stalled',
                'module' => 'requests',
                'name' => 'Approval still waiting',
                'trigger' => 'A step has sat undecided for days',
                'audience' => 'The approver on that step',
                'message_en' => 'Waiting {days} days for your decision ({step})',
                'message_th' => 'รอคุณพิจารณามา {days} วันแล้ว ({step})',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_approved_step',
                'module' => 'requests',
                'name' => 'Step approved',
                'trigger' => 'An approver signs a step',
                'audience' => 'The requester and followers',
                'message_en' => '{step} approved, on to the next step',
                'message_th' => '{step} อนุมัติแล้ว ส่งต่อขั้นถัดไป',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_approved_final',
                'module' => 'requests',
                'name' => 'Fully approved',
                'trigger' => 'The last approval lands',
                'audience' => 'The requester and followers',
                'message_en' => 'Fully approved, waiting for the IT team to pick it up',
                'message_th' => 'อนุมัติครบทุกขั้นแล้ว รอทีม IT รับเรื่อง',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_ready_case',
                'module' => 'requests',
                'name' => 'Ready to complete (case opened)',
                'trigger' => 'Final approval opens a ticket automatically',
                'audience' => 'The completion queue',
                'message_en' => 'Case {ticket} has been opened for you',
                'message_th' => 'เปิดเคส {ticket} ให้คุณแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_ready_manual',
                'module' => 'requests',
                'name' => 'Ready to complete (no case)',
                'trigger' => 'Final approval lands on a workflow that opens no ticket',
                'audience' => 'The completion queue',
                'message_en' => 'Fully approved, waiting for you to deliver and close it',
                'message_th' => 'อนุมัติครบแล้ว รอคุณดำเนินการและปิดงาน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_rejected',
                'module' => 'requests',
                'name' => 'Request rejected',
                'trigger' => 'An approver rejects a request',
                'audience' => 'The requester and followers',
                'message_en' => 'Rejected by {actor}: {remark}',
                'message_th' => 'ไม่อนุมัติโดย {actor}: {remark}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_completed',
                'module' => 'requests',
                'name' => 'Request completed',
                'trigger' => 'A request is delivered and closed',
                'audience' => 'The requester and followers',
                'message_en' => 'Your request is complete',
                'message_th' => 'คำขอเสร็จสิ้นแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_cancelled',
                'module' => 'requests',
                'name' => 'Request cancelled',
                'trigger' => 'The requester withdraws a request',
                'audience' => 'Followers',
                'message_en' => 'Cancelled by the requester',
                'message_th' => 'ผู้ขอยกเลิกคำขอแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_cancelled_for_owner',
                'module' => 'requests',
                'name' => 'Request cancelled for the requester',
                'trigger' => 'Someone else cancels a pending request for the requester',
                'audience' => 'The approver it was waiting on',
                'message_en' => 'Cancelled by {actor} for the requester',
                'message_th' => '{actor} ยกเลิกคำขอแทนผู้ขอแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_blocked_no_account',
                'module' => 'requests',
                'name' => 'Approver has no login',
                'trigger' => 'A request cannot move because its approver has no account',
                'audience' => 'Whoever can set credentials',
                'message_en' => 'Waiting on {actor}, who has no login yet. Create one to move the request on.',
                'message_th' => 'รอ {actor} อนุมัติ แต่ยังไม่มีบัญชีเข้าใช้งาน สร้างบัญชีให้ก่อน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_assigned',
                'module' => 'assets',
                'name' => 'Asset handed over to you',
                'trigger' => 'IT transfers an asset to an employee',
                'audience' => 'The recipient',
                'message_en' => 'IT handed you an asset. Accept it in My Profile.',
                'message_th' => 'IT โอนทรัพย์สินให้คุณแล้ว กดรับมอบในโปรไฟล์ของฉัน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_return_requested',
                'module' => 'assets',
                'name' => 'Asset being returned',
                'trigger' => 'A holder asks to send an asset back',
                'audience' => 'Whoever can receive assets',
                'message_en' => 'An asset is being returned. Check it in.',
                'message_th' => 'มีทรัพย์สินส่งคืน รอคุณตรวจรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_recalled_cancelled',
                'module' => 'assets',
                'name' => 'Hand-over cancelled',
                'trigger' => 'A hand-over is recalled before it was accepted',
                'audience' => 'The intended recipient',
                'message_en' => 'The asset transfer was cancelled',
                'message_th' => 'ยกเลิกการโอนทรัพย์สินแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_recalled_taken_back',
                'module' => 'assets',
                'name' => 'Asset taken back',
                'trigger' => 'An asset is force-recalled from its holder',
                'audience' => 'The former holder',
                'message_en' => 'IT took the asset back',
                'message_th' => 'IT เรียกคืนทรัพย์สินนี้แล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_offboarding',
                'module' => 'assets',
                'name' => 'Leaver has assets to collect',
                'trigger' => 'A resignation flags every device the leaver held',
                'audience' => 'Whoever can receive assets',
                'message_en' => 'Resigned with {count} assets still to collect',
                'message_th' => 'ลาออกแล้ว มีทรัพย์สิน {count} รายการรอเรียกคืน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_response_near_due',
                'module' => 'tickets',
                'name' => 'SLA - pickup nearly overdue',
                'trigger' => 'A case approaches its response deadline',
                'audience' => 'IT staff',
                'message_en' => 'Almost past the pickup time. Take it now.',
                'message_th' => 'ใกล้เกินเวลารับเคส รับเคสนี้เลย',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_response_over_sla',
                'module' => 'tickets',
                'name' => 'SLA - pickup overdue',
                'trigger' => 'A case passes its response deadline',
                'audience' => 'IT staff',
                'message_en' => 'Past the pickup time and nobody has taken it',
                'message_th' => 'เกินเวลารับเคสแล้ว ยังไม่มีใครรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_resolve_near_due',
                'module' => 'tickets',
                'name' => 'SLA - resolution closing in',
                'trigger' => 'A case approaches its resolution deadline',
                'audience' => 'IT staff',
                'message_en' => 'Resolution deadline is closing in',
                'message_th' => 'ใกล้ครบกำหนดปิดเคส',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_resolve_over_sla',
                'module' => 'tickets',
                'name' => 'SLA - resolution overdue',
                'trigger' => 'A case passes its resolution deadline',
                'audience' => 'IT staff',
                'message_en' => 'Past the resolution time',
                'message_th' => 'เกินกำหนดปิดเคสแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_forwarded',
                'module' => 'tickets',
                'name' => 'Case forwarded to you',
                'trigger' => 'A case is passed to another technician',
                'audience' => 'The receiving technician',
                'message_en' => '{from} forwarded this case to you',
                'message_th' => '{from} ส่งต่อเคสนี้ให้คุณ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_forwarded_away',
                'module' => 'tickets',
                'name' => 'Your case was forwarded',
                'trigger' => 'Somebody else passes a case you hold to another technician',
                'audience' => 'The technician who held the case',
                'message_en' => 'This case was forwarded to {to}',
                'message_th' => 'ส่งต่อเคสนี้ให้ {to} แล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_new',
                'module' => 'tickets',
                'name' => 'New case waiting',
                'trigger' => 'A case is created and nobody has taken it',
                'audience' => 'IT staff who can take that type',
                'message_en' => 'New case waiting to be taken',
                'message_th' => 'เคสใหม่ รอคนรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_assigned',
                'module' => 'tickets',
                'name' => 'Case assigned to you',
                'trigger' => 'A case is assigned to a technician',
                'audience' => 'The assigned technician',
                'message_en' => 'This case was assigned to you',
                'message_th' => 'มอบหมายเคสนี้ให้คุณแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_taken',
                'module' => 'tickets',
                'name' => 'Your case was taken',
                'trigger' => 'A technician picks up your case',
                'audience' => 'The requester',
                'message_en' => '{name} is now handling your ticket',
                'message_th' => '{name} รับผิดชอบ Ticket ของคุณแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_forwarded',
                'module' => 'tickets',
                'name' => 'Your case was passed on',
                'trigger' => 'Your case moves to another technician',
                'audience' => 'The requester',
                'message_en' => 'Your ticket was passed on to {name}',
                'message_th' => 'Ticket ของคุณเปลี่ยนผู้รับผิดชอบเป็น {name}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_updated',
                'module' => 'tickets',
                'name' => 'Progress on your case',
                'trigger' => 'The technician writes a progress note on your case',
                'audience' => 'The requester',
                'message_en' => 'There is an update on your ticket from {name}',
                'message_th' => 'Ticket ของคุณมีความคืบหน้าใหม่จาก {name}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_resolved',
                'module' => 'tickets',
                'name' => 'Your case was closed',
                'trigger' => 'Your case is resolved',
                'audience' => 'The requester',
                'message_en' => 'Your ticket is completed. Open it to see the resolution.',
                'message_th' => 'Ticket ของคุณเสร็จสิ้นแล้ว เปิดดูวิธีแก้ได้',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_cancelled',
                'module' => 'tickets',
                'name' => 'Your case was cancelled',
                'trigger' => 'Your case is cancelled',
                'audience' => 'The requester',
                'message_en' => 'Your ticket was cancelled. Open it to see why.',
                'message_th' => 'Ticket ของคุณถูกยกเลิก เปิดดูเหตุผลได้',
                'enabled' => true,
            ],
            // 'system' is the module for notices that belong to no business module —
            // the account itself, and whatever else the platform has to say.
            [
                'key' => 'notif_password_expiring',
                'module' => 'system',
                'name' => 'Password expiring',
                'trigger' => 'Signing in with fewer than 14 days left on the password expiry policy',
                'audience' => 'The account itself',
                'message_en' => 'Your password expires in {days} days. Change it before you are locked out.',
                'message_th' => 'รหัสผ่านจะหมดอายุในอีก {days} วัน เปลี่ยนก่อนเข้าระบบไม่ได้',
                'enabled' => true,
            ],
            [
                'key' => 'notif_report_export_ready',
                'module' => 'system',
                'name' => 'Report file ready',
                'trigger' => 'A report file asked for on the Reports page has finished building',
                'audience' => 'The person who asked for the file',
                'message_en' => 'Your {format} file is ready. Download it from "My exports".',
                'message_th' => 'ไฟล์ {format} พร้อมแล้ว ดาวน์โหลดได้ที่ "ไฟล์ส่งออกของฉัน"',
                'enabled' => true,
            ],
            [
                'key' => 'notif_report_export_failed',
                'module' => 'system',
                'name' => 'Report file failed',
                'trigger' => 'A report file asked for on the Reports page could not be built',
                'audience' => 'The person who asked for the file',
                'message_en' => 'The {format} file could not be created. Try again from "My exports".',
                'message_th' => 'สร้างไฟล์ {format} ไม่สำเร็จ ลองใหม่ได้ที่ "ไฟล์ส่งออกของฉัน"',
                'enabled' => true,
            ],
            [
                'key' => 'notif_report_schedule_failed',
                'module' => 'system',
                'name' => 'Scheduled report not sent',
                'trigger' => 'An auto-sent report could not be built or mailed',
                'audience' => 'The person who set the schedule',
                'message_en' => 'The scheduled report was not sent. Check it on the Reports page.',
                'message_th' => 'ส่งรายงานตามเวลาไม่สำเร็จ ตรวจสอบได้ที่หน้ารายงาน',
                'enabled' => true,
            ],
        ];
    }

    /**
     * One bell's standard definition, or null when the key is not a standard bell.
     *
     * @return array{key:string,module:string,name:string,trigger:string,audience:string,message_en:string,message_th:string,enabled:bool}|null
     */
    public static function find(string $key): ?array
    {
        foreach (self::all() as $bell) {
            if ($bell['key'] === $key) {
                return $bell;
            }
        }

        return null;
    }

    /**
     * Is this notification switched on?
     *
     * Resolved once per request: a single resignation asks about several bells, and a stock
     * sweep asks about the same one for every item it touches. An unknown key is ON — a notification
     * added in code but not yet seeded must not go silent, which would be a new feature
     * failing quietly rather than loudly.
     *
     * @var array<string, bool>|null
     */
    private static ?array $switches = null;

    public static function enabled(string $key): bool
    {
        if (self::$switches === null) {
            self::$switches = NotificationTemplate::pluck('enabled', 'key')
                ->map(fn ($on) => (bool) $on)
                ->all();
        }

        return self::$switches[$key] ?? true;
    }

    /**
     * Record that this notification just rang.
     *
     * At most one write per key per process: a stock sweep raises the same bell for every
     * item it touches, and a resignation raises several bells to several people. The figure
     * is read as "is this alert actually in use", so a stamp accurate to the run rather than
     * to the individual recipient is what it needs to be.
     *
     * Nothing happens when the notification has no row yet — the same case that leaves enabled()
     * defaulting to on.
     *
     * @var array<string, true>
     */
    private static array $stamped = [];

    public static function stampSent(string $key): void
    {
        if (isset(self::$stamped[$key])) {
            return;
        }

        self::$stamped[$key] = true;
        NotificationTemplate::where('key', $key)->update(['last_sent_at' => now()]);
    }

    /** Drops the per-request caches — for tests, and for the settings page after a save. */
    public static function forgetSwitches(): void
    {
        self::$switches = null;
        self::$stamped = [];
    }
}
