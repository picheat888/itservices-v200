<?php

// Moves the stored Request bell wording to the reworded standard (no " - " separators).
// Only a column still holding the old standard text changes; an administrator's own wording stays.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var array<string, array<string, array{0: string, 1: string}>> key => column => [old, new] */
    private const WORDING = [
        'notif_request_submitted' => [
            'message_en' => ['Submitted - waiting for {step}', 'Submitted, waiting for {step}'],
            'message_th' => ['ส่งคำขอแล้ว - รอ {step} อนุมัติ', 'ส่งคำขอแล้ว รอ {step} อนุมัติ'],
        ],
        'notif_request_waiting' => [
            'message_en' => ['Awaiting your decision - {step}', 'Waiting for your decision ({step})'],
            'message_th' => ['รอการตัดสินจากคุณ - {step}', 'รอคุณพิจารณา ({step})'],
        ],
        'notif_request_stalled' => [
            'message_en' => ['Waiting {days} days for your decision - {step}', 'Waiting {days} days for your decision ({step})'],
            'message_th' => ['รอการตัดสินจากคุณมา {days} วันแล้ว - {step}', 'รอคุณพิจารณามา {days} วันแล้ว ({step})'],
        ],
        'notif_request_approved_step' => [
            'message_en' => ['{step} approved - moving to the next step', '{step} approved, on to the next step'],
            'message_th' => ['{step} อนุมัติแล้ว - ส่งต่อขั้นถัดไป', '{step} อนุมัติแล้ว ส่งต่อขั้นถัดไป'],
        ],
        'notif_request_approved_final' => [
            'message_en' => ['Fully approved - waiting for Admin/IT to pick up the case', 'Fully approved, waiting for the IT team to pick it up'],
            'message_th' => ['อนุมัติครบทุกขั้น - รอ Admin/IT รับเคส', 'อนุมัติครบทุกขั้นแล้ว รอทีม IT รับเรื่อง'],
        ],
        'notif_request_ready_case' => [
            'message_en' => ['A case has been opened for you - {ticket}', 'Case {ticket} has been opened for you'],
            'message_th' => ['เปิดเคสให้คุณเรียบร้อยแล้ว - {ticket}', 'เปิดเคส {ticket} ให้คุณแล้ว'],
        ],
        'notif_request_ready_manual' => [
            'message_en' => ['Fully approved - waiting for you to deliver and close it', 'Fully approved, waiting for you to deliver and close it'],
            'message_th' => ['อนุมัติครบทุกขั้นแล้ว - รอคุณส่งมอบและปิดคำขอ', 'อนุมัติครบแล้ว รอคุณดำเนินการและปิดงาน'],
        ],
        'notif_request_completed' => [
            'message_en' => ['Done - your request was completed', 'Your request is complete'],
        ],
        'notif_request_cancelled' => [
            'message_th' => ['ผู้ขอยกเลิกคำขอ', 'ผู้ขอยกเลิกคำขอแล้ว'],
        ],
        'notif_request_blocked_no_account' => [
            'message_en' => ['Waiting on {actor}, who has no login account yet - create one so this can move', 'Waiting on {actor}, who has no login yet. Create one so the request can move.'],
            'message_th' => ['รออนุมัติจาก {actor} ที่ยังไม่มีบัญชีเข้าใช้งาน', 'รอ {actor} อนุมัติ แต่ยังไม่มีบัญชีเข้าใช้งาน'],
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
