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
                'message_en' => 'Needs login account - set username & password',
                'message_th' => 'ยังไม่มีบัญชี - กรุณาตั้ง Username/Password',
                'enabled' => true,
            ],
            [
                'key' => 'notif_resigned',
                'module' => 'employees',
                'name' => 'Resignation - offboarding task',
                'trigger' => 'A resignation is recorded',
                'audience' => 'Whoever can set credentials',
                'message_en' => 'Resigned - revoke login account & reclaim assets',
                'message_th' => 'ลาออก - โปรดเพิกถอนบัญชีและเรียกคืนทรัพย์สิน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_departure',
                'module' => 'employees',
                'name' => 'Resignation - for information',
                'trigger' => 'A resignation is recorded',
                'audience' => 'Everyone who can view employees',
                'message_en' => 'Has resigned - review anything routed through them',
                'message_th' => 'พนักงานลาออก - โปรดตรวจสอบงานที่เกี่ยวข้อง',
                'enabled' => true,
            ],
            [
                'key' => 'notif_access_offboarding',
                'module' => 'access',
                'name' => 'Leaver still holds access',
                'trigger' => 'A resignation leaves grants open or a resource without an owner',
                'audience' => 'Whoever can edit an access registry',
                'message_en' => 'Left with {total} still to clear - {grants} to revoke, {owned} needing an owner',
                'message_th' => 'ลาออกแล้วยังถือสิทธิ์ {total} รายการ - สิทธิ์ค้าง {grants} · ต้องหาผู้ดูแล {owned}',
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
                'message_en' => 'Overdue by {days} days - review, renew or close',
                'message_th' => 'เกินกำหนดมาแล้ว {days} วัน - โปรดตรวจสอบ ต่ออายุ หรือปิดสัญญา',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_out',
                'module' => 'stock',
                'name' => 'Out of stock',
                'trigger' => 'An item reaches zero on hand',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Out of stock',
                'message_th' => 'สินค้าหมดสต็อก',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_low',
                'module' => 'stock',
                'name' => 'Below minimum',
                'trigger' => 'An item falls under its minimum',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Below minimum - reorder',
                'message_th' => 'ต่ำกว่าขั้นต่ำ - ควรเติม',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_over',
                'module' => 'stock',
                'name' => 'Overstock',
                'trigger' => 'An item rises above its maximum',
                'audience' => 'Everyone who can view stock',
                'message_en' => 'Overstock',
                'message_th' => 'สต็อกเกิน',
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
                'message_en' => 'Awaiting approval / fulfilment',
                'message_th' => 'รออนุมัติ / จ่ายของ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_approved',
                'module' => 'stock',
                'name' => 'Stock request approved',
                'trigger' => 'A stock request is approved',
                'audience' => 'The person who filed it',
                'message_en' => 'Your request was approved',
                'message_th' => 'คำขอของคุณได้รับการอนุมัติ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_rejected',
                'module' => 'stock',
                'name' => 'Stock request rejected',
                'trigger' => 'A stock request is rejected',
                'audience' => 'The person who filed it',
                'message_en' => 'Your request was rejected',
                'message_th' => 'คำขอของคุณถูกปฏิเสธ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_stock_req_fulfilled',
                'module' => 'stock',
                'name' => 'Stock request fulfilled',
                'trigger' => 'A stock request is handed over',
                'audience' => 'The person who filed it',
                'message_en' => 'Your request was fulfilled',
                'message_th' => 'คำขอของคุณถูกจ่ายแล้ว',
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
                'message_en' => 'Submitted - waiting for {step}',
                'message_th' => 'ส่งคำขอแล้ว - รอ {step} อนุมัติ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_waiting',
                'module' => 'requests',
                'name' => 'Waiting on your approval',
                'trigger' => 'A chain step reaches an approver',
                'audience' => 'The approver on that step',
                'message_en' => 'Awaiting your decision - {step}',
                'message_th' => 'รอการตัดสินจากคุณ - {step}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_stalled',
                'module' => 'requests',
                'name' => 'Approval still waiting',
                'trigger' => 'A step has sat undecided for days',
                'audience' => 'The approver on that step',
                'message_en' => 'Waiting {days} days for your decision - {step}',
                'message_th' => 'รอการตัดสินจากคุณมา {days} วันแล้ว - {step}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_approved_step',
                'module' => 'requests',
                'name' => 'Step approved',
                'trigger' => 'An approver signs a step',
                'audience' => 'The requester and followers',
                'message_en' => '{step} approved - moving to the next step',
                'message_th' => '{step} อนุมัติแล้ว - ส่งต่อขั้นถัดไป',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_approved_final',
                'module' => 'requests',
                'name' => 'Fully approved',
                'trigger' => 'The last approval lands',
                'audience' => 'The requester and followers',
                'message_en' => 'Fully approved - waiting for Admin/IT to pick up the case',
                'message_th' => 'อนุมัติครบทุกขั้น - รอ Admin/IT รับเคส',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_ready_case',
                'module' => 'requests',
                'name' => 'Ready to fulfil - case opened',
                'trigger' => 'Final approval opens a ticket automatically',
                'audience' => 'The fulfilment queue',
                'message_en' => 'A case has been opened for you - {ticket}',
                'message_th' => 'เปิดเคสให้คุณเรียบร้อยแล้ว - {ticket}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_ready_manual',
                'module' => 'requests',
                'name' => 'Ready to fulfil - no case',
                'trigger' => 'Final approval lands on a workflow that opens no ticket',
                'audience' => 'The fulfilment queue',
                'message_en' => 'Fully approved - waiting for you to deliver and close it',
                'message_th' => 'อนุมัติครบทุกขั้นแล้ว - รอคุณส่งมอบและปิดคำขอ',
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
                'key' => 'notif_request_fulfilled',
                'module' => 'requests',
                'name' => 'Request fulfilled',
                'trigger' => 'A request is delivered and closed',
                'audience' => 'The requester and followers',
                'message_en' => 'Done - your request was fulfilled',
                'message_th' => 'ดำเนินการเสร็จแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_cancelled',
                'module' => 'requests',
                'name' => 'Request cancelled',
                'trigger' => 'The requester withdraws a request',
                'audience' => 'Followers',
                'message_en' => 'Cancelled by the requester',
                'message_th' => 'ผู้ขอยกเลิกคำขอ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_request_blocked_no_account',
                'module' => 'requests',
                'name' => 'Approver has no login',
                'trigger' => 'A request cannot move because its approver has no account',
                'audience' => 'Whoever can set credentials',
                'message_en' => 'Waiting on {actor}, who has no login account yet - create one so this can move',
                'message_th' => 'รออนุมัติจาก {actor} ที่ยังไม่มีบัญชีเข้าใช้งาน - ตั้งบัญชีให้เพื่อให้คำขอเดินต่อ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_assigned',
                'module' => 'assets',
                'name' => 'Asset handed over to you',
                'trigger' => 'IT transfers an asset to an employee',
                'audience' => 'The recipient',
                'message_en' => 'Assigned to you - tap to accept',
                'message_th' => 'มอบหมายให้คุณ - แตะเพื่อกดรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_return_requested',
                'module' => 'assets',
                'name' => 'Asset being returned',
                'trigger' => 'A holder asks to send an asset back',
                'audience' => 'Whoever can receive assets',
                'message_en' => 'Return requested - awaiting your receipt',
                'message_th' => 'มีการขอส่งคืน - รอคุณยืนยันรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_recalled_cancelled',
                'module' => 'assets',
                'name' => 'Hand-over cancelled',
                'trigger' => 'A hand-over is recalled before it was accepted',
                'audience' => 'The intended recipient',
                'message_en' => 'Hand-over cancelled - nothing left to accept',
                'message_th' => 'ยกเลิกการมอบหมายแล้ว - ไม่ต้องกดรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_recalled_taken_back',
                'module' => 'assets',
                'name' => 'Asset taken back',
                'trigger' => 'An asset is force-recalled from its holder',
                'audience' => 'The former holder',
                'message_en' => 'Recalled to the warehouse - no longer yours',
                'message_th' => 'ถูกเรียกคืนเข้าคลัง - ไม่ได้อยู่กับคุณแล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_asset_offboarding',
                'module' => 'assets',
                'name' => 'Leaver has assets to collect',
                'trigger' => 'A resignation flags every device the leaver held',
                'audience' => 'Whoever can receive assets',
                'message_en' => 'Resigned - {count} assets waiting to be collected',
                'message_th' => 'พนักงานลาออก - มีทรัพย์สิน {count} รายการรอรับคืน',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_response_at_risk',
                'module' => 'tickets',
                'name' => 'SLA - pickup nearly overdue',
                'trigger' => 'A case approaches its response deadline',
                'audience' => 'IT staff',
                'message_en' => 'Nearly overdue for pickup - take it now',
                'message_th' => 'ใกล้เกินเวลารับเคส - รีบกดรับ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_response_breached',
                'module' => 'tickets',
                'name' => 'SLA - pickup overdue',
                'trigger' => 'A case passes its response deadline',
                'audience' => 'IT staff',
                'message_en' => 'Pickup overdue - no one has taken this ticket',
                'message_th' => 'เกินเวลารับเคสแล้ว - ยังไม่มีใครรับ Ticket นี้',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_resolve_at_risk',
                'module' => 'tickets',
                'name' => 'SLA - resolution closing in',
                'trigger' => 'A case approaches its resolution deadline',
                'audience' => 'IT staff',
                'message_en' => 'Resolution deadline is closing in',
                'message_th' => 'ใกล้ครบกำหนดปิดเคส',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_sla_resolve_breached',
                'module' => 'tickets',
                'name' => 'SLA - resolution overdue',
                'trigger' => 'A case passes its resolution deadline',
                'audience' => 'IT staff',
                'message_en' => 'Resolution overdue - SLA breached',
                'message_th' => 'เกินกำหนดปิดเคส - SLA breach แล้ว',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_forwarded',
                'module' => 'tickets',
                'name' => 'Case forwarded to you',
                'trigger' => 'A case is passed to another technician',
                'audience' => 'The receiving technician',
                'message_en' => 'Case forwarded to you by {from}',
                'message_th' => 'ส่งต่อเคสมาให้คุณ จาก {from}',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_new',
                'module' => 'tickets',
                'name' => 'New case waiting',
                'trigger' => 'A case is created and nobody has taken it',
                'audience' => 'IT staff who can take that type',
                'message_en' => 'New case waiting to be taken - tap to view',
                'message_th' => 'เคสใหม่รอการรับ - แตะเพื่อดู',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_assigned',
                'module' => 'tickets',
                'name' => 'Case assigned to you',
                'trigger' => 'A case is assigned to a technician',
                'audience' => 'The assigned technician',
                'message_en' => 'A case was assigned to you',
                'message_th' => 'เคสถูกมอบหมายให้คุณ',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_taken',
                'module' => 'tickets',
                'name' => 'Your case was taken',
                'trigger' => 'A technician picks up your case',
                'audience' => 'The requester',
                'message_en' => 'Your ticket is now handled by {name}',
                'message_th' => 'Ticket ของคุณมีผู้รับผิดชอบแล้ว - {name}',
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
                'key' => 'notif_ticket_owner_resolved',
                'module' => 'tickets',
                'name' => 'Your case was closed',
                'trigger' => 'Your case is resolved',
                'audience' => 'The requester',
                'message_en' => 'Your ticket has been closed - tap to see the resolution',
                'message_th' => 'Ticket ของคุณปิดงานแล้ว - แตะเพื่อดูผลการแก้ไข',
                'enabled' => true,
            ],
            [
                'key' => 'notif_ticket_owner_cancelled',
                'module' => 'tickets',
                'name' => 'Your case was cancelled',
                'trigger' => 'Your case is cancelled',
                'audience' => 'The requester',
                'message_en' => 'Your ticket was cancelled - tap to see why',
                'message_th' => 'Ticket ของคุณถูกยกเลิก - แตะเพื่อดูเหตุผล',
                'enabled' => true,
            ],        ];
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
