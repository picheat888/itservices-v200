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
     *
     * Timestamps are relative to "now" so the dashboard SLA metrics have data:
     *   created_h  — hours ago the ticket was created
     *   resp_m     — minutes after creation it was first responded to (taken/assigned)
     *   resolve_h  — hours after creation it was closed (completed tickets only)
     */
    public function run(): void
    {
        $empId = Employee::pluck('id', 'code');
        $userId = User::pluck('id', 'username');

        $tickets = [
            // Open & unassigned — no priority, no response yet.
            [
                'ticket_no' => 'TKT-2861', 'subject' => 'Cannot connect to production VPN', 'subject_th' => 'เชื่อมต่อ VPN ฝ่ายผลิตไม่ได้',
                'description' => 'VPN client fails to authenticate since this morning.', 'category' => 'network',
                'priority' => null, 'status' => 'open', 'requester' => 'EMP-1042', 'assignee' => null, 'created_h' => 2,
            ],
            [
                'ticket_no' => 'TKT-2859', 'subject' => 'QA scanner barcode reader unresponsive', 'subject_th' => 'เครื่องสแกนบาร์โค้ดฝ่าย QA ไม่ตอบสนอง',
                'description' => 'Barcode scanner at the QA lab does not respond when triggered.', 'category' => 'hardware',
                'priority' => null, 'status' => 'open', 'requester' => 'EMP-2115', 'assignee' => null, 'created_h' => 3,
            ],

            // In progress — taken, so responded_at is set (drives Avg. response).
            [
                'ticket_no' => 'TKT-2860', 'subject' => 'Outlook crashing on launch — finance laptop', 'subject_th' => 'Outlook เปิดไม่ได้ — โน้ตบุ๊กฝ่ายการเงิน',
                'description' => 'Outlook closes immediately on open after the latest update.', 'category' => 'software',
                'priority' => 'medium', 'status' => 'in_progress', 'requester' => 'EMP-1305', 'assignee' => 'super', 'created_h' => 5, 'resp_m' => 32,
            ],
            [
                'ticket_no' => 'TKT-2858', 'subject' => 'Plant 1 Wi-Fi intermittent — line 3', 'subject_th' => 'Wi-Fi โรงงาน 1 ขาดๆ หายๆ — ไลน์ 3',
                'description' => 'Wi-Fi at production line 3 keeps dropping every few minutes.', 'category' => 'network',
                'priority' => 'critical', 'status' => 'in_progress', 'requester' => 'EMP-1834', 'assignee' => 'it', 'created_h' => 8, 'resp_m' => 12,
            ],
            [
                'ticket_no' => 'TKT-2857', 'subject' => 'Need SAP B1 reinstall', 'subject_th' => 'ต้องการติดตั้ง SAP B1 ใหม่',
                'description' => 'SAP Business One needs a clean reinstall after the disk swap.', 'category' => 'software',
                'priority' => 'medium', 'status' => 'in_progress', 'requester' => 'EMP-1213', 'assignee' => 'super', 'created_h' => 10, 'resp_m' => 48,
            ],

            // Completed — resolved_at set (drives SLA met %). Targets: critical 4h,
            // high 8h, medium 24h. 2856 & 2855 beat target (met); 2854 misses.
            [
                'ticket_no' => 'TKT-2856', 'subject' => 'Email signature not updating', 'subject_th' => 'ลายเซ็นอีเมลไม่อัปเดต',
                'description' => 'Company signature template did not roll out to Outlook.', 'category' => 'software',
                'priority' => 'high', 'status' => 'completed', 'requester' => 'EMP-1509', 'assignee' => 'super', 'created_h' => 30, 'resp_m' => 20, 'resolve_h' => 5,
                'resolution' => 'Pushed the signature template via GPO and confirmed it applied on the user’s Outlook.',
            ],
            [
                'ticket_no' => 'TKT-2855', 'subject' => 'New monitor request — design desk', 'subject_th' => 'ขอจอใหม่ — โต๊ะออกแบบ',
                'description' => 'Second monitor flickering, needs replacement.', 'category' => 'hardware',
                'priority' => 'medium', 'status' => 'completed', 'requester' => 'EMP-1901', 'assignee' => 'it', 'created_h' => 50, 'resp_m' => 40, 'resolve_h' => 18,
                'resolution' => 'Replaced the faulty monitor with a spare from stock and tested for flicker.',
            ],
            [
                'ticket_no' => 'TKT-2854', 'subject' => 'ERP server unreachable', 'subject_th' => 'เข้าเซิร์ฟเวอร์ ERP ไม่ได้',
                'description' => 'Production ERP was unreachable for the afternoon shift.', 'category' => 'network',
                'priority' => 'critical', 'status' => 'completed', 'requester' => 'EMP-1213', 'assignee' => 'super', 'created_h' => 20, 'resp_m' => 15, 'resolve_h' => 6,
                'resolution' => 'Restarted the core switch and the ERP service; restored access after a VLAN fix.',
            ],

            // Canceled — taken then closed without a fix (responded_at set, so they
            // still count toward Avg. response; canceled tickets are excluded from SLA met %).
            [
                'ticket_no' => 'TKT-2853', 'subject' => 'Duplicate VPN access request', 'subject_th' => 'คำขอ VPN ซ้ำ',
                'description' => 'User opened a second ticket for the same VPN issue.', 'category' => 'network',
                'priority' => 'low', 'status' => 'canceled', 'requester' => 'EMP-1042', 'assignee' => 'it', 'created_h' => 40, 'resp_m' => 55, 'resolve_h' => 3,
                'resolution' => 'Duplicate of TKT-2861 — consolidated into the original ticket and canceled this one.',
            ],
            [
                'ticket_no' => 'TKT-2852', 'subject' => 'Replace keyboard — resigned staff', 'subject_th' => 'เปลี่ยนคีย์บอร์ด — พนักงานลาออก',
                'description' => 'Keyboard replacement requested for a desk being vacated.', 'category' => 'hardware',
                'priority' => 'medium', 'status' => 'canceled', 'requester' => 'EMP-1422', 'assignee' => 'super', 'created_h' => 26, 'resp_m' => 25, 'resolve_h' => 4,
                'resolution' => 'Requester is leaving and the device was decommissioned — canceling per the department head.',
            ],
        ];

        foreach ($tickets as $t) {
            $requesterId = $empId[$t['requester']] ?? null;
            if ($requesterId === null) {
                continue;
            }

            $createdAt = now()->subHours($t['created_h']);
            $respondedAt = isset($t['resp_m']) ? $createdAt->copy()->addMinutes($t['resp_m']) : null;
            $resolvedAt = isset($t['resolve_h']) ? $createdAt->copy()->addHours($t['resolve_h']) : null;

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
                    'resolution' => $t['resolution'] ?? null,
                    'created_at' => $createdAt,
                    'responded_at' => $respondedAt,
                    'resolved_at' => $resolvedAt,
                ],
            );
        }
    }
}
