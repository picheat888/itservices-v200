<?php

// Moves the stored bell wording to the reworded standard (no " - " separators, one word per module).
// Only a column still holding the old standard text changes; an administrator's own wording stays.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var array<string, array<string, array{0: string, 1: string}>> key => column => [old, new] */
    private const WORDING = [
        'notif_cred_required' => [
            'message_en' => ['Needs login account - set username & password', 'No login account yet. Set a username and password.'],
            'message_th' => ['ยังไม่มีบัญชี - กรุณาตั้ง Username/Password', 'ยังไม่มีบัญชีเข้าใช้งาน ตั้ง Username และ Password ให้'],
        ],
        'notif_resigned' => [
            'message_en' => ['Resigned - revoke login account & reclaim assets', 'Resigned. Revoke the login account and reclaim assets.'],
            'message_th' => ['ลาออก - โปรดเพิกถอนบัญชีและเรียกคืนทรัพย์สิน', 'ลาออกแล้ว ปิดบัญชีและเรียกคืนทรัพย์สิน'],
        ],
        'notif_departure' => [
            'message_en' => ['Has resigned - review anything routed through them', 'Resigned. Review anything routed through them.'],
            'message_th' => ['พนักงานลาออก - โปรดตรวจสอบงานที่เกี่ยวข้อง', 'ลาออกแล้ว ตรวจสอบงานที่ผ่านพนักงานคนนี้'],
        ],
        'notif_access_offboarding' => [
            'message_en' => ['Offboarding - please clear {total} access item(s)', 'Resigned but still holds {total} access items. Clear them.'],
            'message_th' => ['ลาออก แต่ยังถือสิทธิ์ทั้งหมด {total} รายการ', 'ลาออกแล้ว แต่ยังมีสิทธิ์อยู่ {total} รายการ'],
        ],
        'notif_contract_expired' => [
            'message_en' => ['Overdue by {days} days - review, renew or close', 'Overdue by {days} days. Renew or close it.'],
            'message_th' => ['เกินกำหนดมาแล้ว {days} วัน', 'เกินกำหนดมาแล้ว {days} วัน ต่อสัญญาหรือปิดสัญญา'],
        ],
        'notif_stock_out' => [
            'message_th' => ['สินค้าหมดสต็อก', 'หมดสต็อก'],
        ],
        'notif_stock_low' => [
            'message_en' => ['Below minimum - reorder', 'Below minimum. Reorder.'],
            'message_th' => ['ต่ำกว่าขั้นต่ำ - ควรเติม', 'ต่ำกว่าขั้นต่ำ ควรสั่งเพิ่ม'],
        ],
        'notif_stock_over' => [
            'message_th' => ['สต็อกเกิน', 'เกินขั้นสูง'],
        ],
        'notif_stock_req_waiting' => [
            'message_en' => ['Awaiting approval / fulfilment', 'Waiting for approval or fulfilment'],
            'message_th' => ['รออนุมัติ / จ่ายของ', 'รออนุมัติหรือรอจ่ายอะไหล่'],
        ],
        'notif_stock_req_approved' => [
            'message_en' => ['Your request was approved', 'Your stock request was approved'],
            'message_th' => ['คำขอของคุณได้รับการอนุมัติ', 'คำขอเบิกของคุณได้รับอนุมัติแล้ว'],
        ],
        'notif_stock_req_rejected' => [
            'message_en' => ['Your request was rejected', 'Your stock request was not approved'],
            'message_th' => ['คำขอของคุณถูกปฏิเสธ', 'คำขอเบิกของคุณไม่ได้รับอนุมัติ'],
        ],
        'notif_stock_req_fulfilled' => [
            'message_en' => ['Your request was fulfilled', 'Your stock request has been fulfilled'],
            'message_th' => ['คำขอของคุณถูกจ่ายแล้ว', 'จ่ายอะไหล่ตามคำขอของคุณแล้ว'],
        ],
        'notif_request_blocked_no_account' => [
            'message_en' => ['Waiting on {actor}, who has no login yet. Create one so the request can move.', 'Waiting on {actor}, who has no login yet. Create one to move the request on.'],
            'message_th' => ['รอ {actor} อนุมัติ แต่ยังไม่มีบัญชีเข้าใช้งาน', 'รอ {actor} อนุมัติ แต่ยังไม่มีบัญชีเข้าใช้งาน สร้างบัญชีให้ก่อน'],
        ],
        'notif_asset_assigned' => [
            'message_en' => ['The asset has been transferred to you - tap to check', 'An asset was transferred to you. Check and accept it.'],
            'message_th' => ['โอนทรัพย์สินให้คุณแล้ว - กดเพื่อตรวจสอบ', 'โอนทรัพย์สินให้คุณแล้ว รอคุณตรวจรับ'],
        ],
        'notif_asset_return_requested' => [
            'message_en' => ['Return asset, wait for your check.', 'An asset is being returned. Check it in.'],
            'message_th' => ['มีทรัพย์สินส่งคืน - รอตรวจสอบ', 'มีทรัพย์สินส่งคืน รอคุณตรวจรับ'],
        ],
        'notif_asset_recalled_cancelled' => [
            'message_en' => ['The asset transfer canceled', 'The asset transfer was cancelled'],
        ],
        'notif_asset_recalled_taken_back' => [
            'message_en' => ['Recalled the asset to IT', 'IT took the asset back'],
            'message_th' => ['ถูกเรียกคืนกลับแผนกไอที', 'IT เรียกคืนทรัพย์สินนี้แล้ว'],
        ],
        'notif_asset_offboarding' => [
            'message_en' => ['Offboarding - {count} assets waiting to be collected', 'Resigned with {count} assets still to collect'],
            'message_th' => ['ลาออก, มีทรัพย์สิน {count} รายการรอรับคืน', 'ลาออกแล้ว มีทรัพย์สิน {count} รายการรอเรียกคืน'],
        ],
        'notif_ticket_sla_response_near_due' => [
            'message_en' => ['Nearly overdue for pickup - take it now', 'Almost past the pickup time. Take it now.'],
            'message_th' => ['ใกล้เกินเวลารับเคส - รีบกดรับ', 'ใกล้เกินเวลารับเคส รับเคสนี้เลย'],
        ],
        'notif_ticket_sla_response_over_sla' => [
            'message_en' => ['Pickup overdue - no one has taken this ticket', 'Past the pickup time and nobody has taken it'],
            'message_th' => ['เกินเวลารับเคสแล้ว - ยังไม่มีใครรับ Ticket นี้', 'เกินเวลารับเคสแล้ว ยังไม่มีใครรับ'],
        ],
        'notif_ticket_sla_resolve_over_sla' => [
            'message_en' => ['Resolution overdue - this case is past its SLA', 'Past the resolution time'],
            'message_th' => ['เกินกำหนดปิดเคสแล้ว - เคสนี้เกิน SLA', 'เกินกำหนดปิดเคสแล้ว'],
        ],
        'notif_ticket_forwarded' => [
            'message_en' => ['Case forwarded to you by {from}', '{from} forwarded this case to you'],
            'message_th' => ['ส่งต่อเคสมาให้คุณ จาก {from}', '{from} ส่งต่อเคสนี้ให้คุณ'],
        ],
        'notif_ticket_forwarded_away' => [
            'message_en' => ['Your case was forwarded to {to}', 'This case was forwarded to {to}'],
            'message_th' => ['เคสของคุณถูกส่งต่อให้ {to}', 'ส่งต่อเคสนี้ให้ {to} แล้ว'],
        ],
        'notif_ticket_new' => [
            'message_en' => ['New case waiting to be taken - tap to view', 'New case waiting to be taken'],
            'message_th' => ['เคสใหม่รอการรับ - แตะเพื่อดู', 'เคสใหม่ รอคนรับ'],
        ],
        'notif_ticket_assigned' => [
            'message_en' => ['A case was assigned to you', 'This case was assigned to you'],
            'message_th' => ['เคสถูกมอบหมายให้คุณ', 'มอบหมายเคสนี้ให้คุณแล้ว'],
        ],
        'notif_ticket_owner_taken' => [
            'message_en' => ['Your ticket is now handled by {name}', '{name} is now handling your ticket'],
            'message_th' => ['Ticket ของคุณมีผู้รับผิดชอบแล้ว - {name}', '{name} รับผิดชอบ Ticket ของคุณแล้ว'],
        ],
        'notif_ticket_owner_resolved' => [
            'message_en' => ['Your ticket has been closed - tap to see the resolution', 'Your ticket is completed. Open it to see the resolution.'],
            'message_th' => ['เคสของคุณปิดแล้ว - แตะเพื่อดูผลการแก้ไข', 'Ticket ของคุณเสร็จสิ้นแล้ว เปิดดูวิธีแก้ได้'],
        ],
        'notif_ticket_owner_cancelled' => [
            'message_en' => ['Your ticket was cancelled - tap to see why', 'Your ticket was cancelled. Open it to see why.'],
            'message_th' => ['Ticket ของคุณถูกยกเลิก - แตะเพื่อดูเหตุผล', 'Ticket ของคุณถูกยกเลิก เปิดดูเหตุผลได้'],
        ],
        'notif_password_expiring' => [
            'message_en' => ['Your password expires in {days} days - change it before you are locked out', 'Your password expires in {days} days. Change it before you are locked out.'],
            'message_th' => ['รหัสผ่านจะหมดอายุในอีก {days} วัน - กรุณาเปลี่ยนก่อนถูกล็อก', 'รหัสผ่านจะหมดอายุในอีก {days} วัน เปลี่ยนก่อนเข้าระบบไม่ได้'],
        ],
        'notif_report_export_ready' => [
            'message_en' => ['Your {format} file is ready - download it from "My exports"', 'Your {format} file is ready. Download it from "My exports".'],
            'message_th' => ['ไฟล์ {format} พร้อมแล้ว - ดาวน์โหลดได้ที่ "ไฟล์ส่งออกของฉัน"', 'ไฟล์ {format} พร้อมแล้ว ดาวน์โหลดได้ที่ "ไฟล์ส่งออกของฉัน"'],
        ],
        'notif_report_export_failed' => [
            'message_en' => ['The {format} file could not be created - try again from "My exports"', 'The {format} file could not be created. Try again from "My exports".'],
            'message_th' => ['สร้างไฟล์ {format} ไม่สำเร็จ - ลองอีกครั้งได้ที่ "ไฟล์ส่งออกของฉัน"', 'สร้างไฟล์ {format} ไม่สำเร็จ ลองใหม่ได้ที่ "ไฟล์ส่งออกของฉัน"'],
        ],
        'notif_report_schedule_failed' => [
            'message_en' => ['The scheduled report was not sent - check it on the Reports page', 'The scheduled report was not sent. Check it on the Reports page.'],
            'message_th' => ['ส่งรายงานตามเวลาไม่สำเร็จ - ตรวจสอบได้ที่หน้ารายงาน', 'ส่งรายงานตามเวลาไม่สำเร็จ ตรวจสอบได้ที่หน้ารายงาน'],
        ],
    ];

    public function up(): void
    {
        $this->swap(from: 0, to: 1);
    }

    public function down(): void
    {
        $this->swap(from: 1, to: 0);
    }

    private function swap(int $from, int $to): void
    {
        foreach (self::WORDING as $key => $columns) {
            foreach ($columns as $column => $pair) {
                DB::table('notification_templates')
                    ->where('key', $key)
                    ->where($column, $pair[$from])
                    ->update([$column => $pair[$to]]);
            }
        }
    }
};
