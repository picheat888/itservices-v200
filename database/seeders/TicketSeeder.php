<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Database\Seeder;

class TicketSeeder extends Seeder
{
    /**
     * Seed demo tickets mirroring the design prototype. Requesters resolve to the
     * seeded employees by code and assignees to the demo IT login accounts by
     * username; rows are keyed on ticket_no so reseeding is idempotent.
     */
    public function run(): void
    {
        $empId = Employee::pluck('id', 'code');
        $userId = User::pluck('id', 'username');

        $tickets = [
            [
                'ticket_no' => 'TKT-2861', 'subject' => 'Cannot connect to production VPN', 'subject_th' => 'เชื่อมต่อ VPN ฝ่ายผลิตไม่ได้',
                'description' => 'VPN client fails to authenticate since this morning.', 'category' => 'network',
                'priority' => null, 'status' => 'open', 'requester' => 'EMP-1042', 'assignee' => null,
            ],
            [
                'ticket_no' => 'TKT-2860', 'subject' => 'Outlook crashing on launch — finance laptop', 'subject_th' => 'Outlook เปิดไม่ได้ — โน้ตบุ๊กฝ่ายการเงิน',
                'description' => 'Outlook closes immediately on open after the latest update.', 'category' => 'software',
                'priority' => 'medium', 'status' => 'in_progress', 'requester' => 'EMP-1305', 'assignee' => 'super',
            ],
            [
                'ticket_no' => 'TKT-2859', 'subject' => 'QA scanner barcode reader unresponsive', 'subject_th' => 'เครื่องสแกนบาร์โค้ดฝ่าย QA ไม่ตอบสนอง',
                'description' => 'Barcode scanner at the QA lab does not respond when triggered.', 'category' => 'hardware',
                'priority' => null, 'status' => 'open', 'requester' => 'EMP-2115', 'assignee' => null,
            ],
            [
                'ticket_no' => 'TKT-2858', 'subject' => 'Plant 1 Wi-Fi intermittent — line 3', 'subject_th' => 'Wi-Fi โรงงาน 1 ขาดๆ หายๆ — ไลน์ 3',
                'description' => 'Wi-Fi at production line 3 keeps dropping every few minutes.', 'category' => 'network',
                'priority' => 'critical', 'status' => 'in_progress', 'requester' => 'EMP-1834', 'assignee' => 'it',
            ],
            [
                'ticket_no' => 'TKT-2857', 'subject' => 'Need SAP B1 reinstall', 'subject_th' => 'ต้องการติดตั้ง SAP B1 ใหม่',
                'description' => 'SAP Business One needs a clean reinstall after the disk swap.', 'category' => 'software',
                'priority' => 'medium', 'status' => 'in_progress', 'requester' => 'EMP-1213', 'assignee' => 'super',
            ],
        ];

        foreach ($tickets as $t) {
            $requesterId = $empId[$t['requester']] ?? null;
            if ($requesterId === null) {
                continue;
            }

            Ticket::updateOrCreate(
                ['ticket_no' => $t['ticket_no']],
                [
                    'subject' => $t['subject'],
                    'subject_th' => $t['subject_th'],
                    'description' => $t['description'],
                    'category' => $t['category'],
                    'priority' => $t['priority'],
                    'status' => $t['status'],
                    'requester_id' => $requesterId,
                    'assignee_id' => $t['assignee'] ? ($userId[$t['assignee']] ?? null) : null,
                    'callback_phone' => '+66 81 000 0000',
                ],
            );
        }
    }
}
