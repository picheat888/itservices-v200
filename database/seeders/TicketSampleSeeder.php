<?php

namespace Database\Seeders;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class TicketSampleSeeder extends Seeder
{
    /**
     * Insert 10 demo tickets spread across statuses, priorities, categories, and
     * dates (a few in the last 7 days, more within 30, the rest within 90) so the
     * dashboard's 7/30/90 windows, backlog, SLA %, and trends all show real numbers.
     */
    public function run(): void
    {
        $emps = Employee::where('status', 'active')->pluck('id')->all();
        $staff = User::whereHas('role', fn ($q) => $q->whereIn('key', ['super', 'admin']))->value('id');

        if (empty($emps) || $staff === null) {
            $this->command?->warn('TicketSampleSeeder skipped — needs active employees and at least one super/admin user.');

            return;
        }

        // Round-robin the requesters so the demo tickets aren't all from one person.
        $pick = 0;
        $requester = function () use ($emps, &$pick) {
            return $emps[$pick++ % count($emps)];
        };

        $now = Carbon::now();

        /** @var list<array<string,mixed>> $rows */
        $rows = [
            // Fresh backlog — open & unassigned, waiting for IT to pick up.
            [
                'subject' => 'โน้ตบุ๊กเปิดไม่ติด',
                'description' => 'The laptop shows no lights and does not respond when pressing the power button.',
                'category' => 'hardware', 'priority' => null, 'status' => 'open',
                'callback_phone' => 'ext. 1204', 'created' => $now->copy()->subDays(2),
            ],
            [
                'subject' => 'Wi-Fi สำนักงานหลุดบ่อย',
                'description' => 'Wireless connection drops every few minutes on the 3rd floor since this morning.',
                'category' => 'network', 'priority' => null, 'status' => 'open',
                'callback_phone' => 'ext. 1330', 'created' => $now->copy()->subDays(5),
            ],
            // In progress — taken, priority set, responded to (counts toward backlog "working").
            [
                'subject' => 'Excel เด้งเมื่อเปิดรายงานยอดขาย',
                'description' => 'Excel closes unexpectedly whenever the monthly sales workbook is opened.',
                'category' => 'software', 'priority' => 'high', 'status' => 'in_progress',
                'callback_phone' => '081-234-5678', 'take_note' => 'Reproduced on the shared template; testing a repair install.',
                'created' => $now->copy()->subDays(3), 'responded' => $now->copy()->subDays(3)->addHours(2),
            ],
            [
                'subject' => 'ห้องเซิร์ฟเวอร์แจ้งเตือนอุณหภูมิแอร์',
                'description' => 'The server room cooling unit is beeping and the temperature reads higher than usual.',
                'category' => 'hardware', 'priority' => 'critical', 'status' => 'in_progress',
                'callback_phone' => 'ext. 1100', 'take_note' => 'On site, contacted the AC vendor for emergency service.',
                'created' => $now->copy()->subDays(1), 'responded' => $now->copy()->subDays(1)->addMinutes(45),
            ],
            // Completed within SLA (recent).
            [
                'subject' => 'เชื่อมต่อ VPN จากบ้านไม่ได้',
                'description' => 'VPN client rejects the credentials that work fine in the office.',
                'category' => 'network', 'priority' => 'medium', 'status' => 'completed',
                'callback_phone' => '089-111-2222', 'resolution' => 'Reset the MFA token and reissued the VPN profile — user reconnected successfully.',
                'created' => $now->copy()->subDays(6), 'responded' => $now->copy()->subDays(6)->addHours(1), 'resolved' => $now->copy()->subDays(5),
            ],
            [
                'subject' => 'เปลี่ยนจอมอนิเตอร์ที่เสีย',
                'description' => 'Monitor flickers and shows vertical lines across the screen.',
                'category' => 'hardware', 'priority' => 'high', 'status' => 'completed',
                'callback_phone' => 'ext. 1215', 'resolution' => 'Swapped in a spare 24" monitor from stock; the faulty unit was sent for repair.',
                'created' => $now->copy()->subDays(20), 'responded' => $now->copy()->subDays(20)->addHours(3), 'resolved' => $now->copy()->subDays(18),
            ],
            // Completed but older — inside the 90-day window only.
            [
                'subject' => 'ติดตั้งลิขสิทธิ์ Adobe Acrobat',
                'description' => 'Requesting Adobe Acrobat Pro installation for the marketing workstation.',
                'category' => 'software', 'priority' => 'low', 'status' => 'completed',
                'callback_phone' => 'ext. 1450', 'resolution' => 'Assigned a license seat and installed Acrobat Pro; activation confirmed.',
                'created' => $now->copy()->subDays(45), 'responded' => $now->copy()->subDays(45)->addHours(5), 'resolved' => $now->copy()->subDays(44),
            ],
            // Canceled — duplicate request.
            [
                'subject' => 'เครื่องพิมพ์ชั้น 2 หมึกหมด',
                'description' => 'The shared printer reports an empty toner cartridge.',
                'category' => 'other', 'priority' => 'low', 'status' => 'canceled',
                'callback_phone' => 'ext. 1220', 'resolution' => 'Duplicate of an existing request already handled by facilities — closing this one.',
                'created' => $now->copy()->subDays(10), 'responded' => $now->copy()->subDays(10)->addHours(2), 'resolved' => $now->copy()->subDays(9),
            ],
            // Completed but late — breaches the critical SLA target (drags SLA % below 100).
            [
                'subject' => 'ทีมการเงินเข้าไดรฟ์ที่แชร์ไม่ได้',
                'description' => 'The finance department cannot reach the shared network drive at all.',
                'category' => 'network', 'priority' => 'critical', 'status' => 'completed',
                'callback_phone' => 'ext. 1500', 'resolution' => 'Restarted the file service and repaired NTFS permissions; access restored after extended troubleshooting.',
                'created' => $now->copy()->subDays(25), 'responded' => $now->copy()->subDays(25)->addMinutes(30), 'resolved' => $now->copy()->subDays(20),
            ],
            // Old, still-open backlog — created inside 90 days but not the recent windows.
            [
                'subject' => 'ลิขสิทธิ์แอปคลังสินค้ารุ่นเก่าหมดอายุ',
                'description' => 'The old inventory application shows a license-expired message and will not open.',
                'category' => 'software', 'priority' => null, 'status' => 'open',
                'callback_phone' => 'ext. 1360', 'created' => $now->copy()->subDays(40),
            ],
        ];

        foreach ($rows as $row) {
            $assigned = in_array($row['status'], ['in_progress', 'completed', 'canceled'], true);

            $ticket = new Ticket;
            $ticket->fill([
                'subject' => $row['subject'],
                'description' => $row['description'],
                'category' => $row['category'],
                'priority' => $row['priority'],
                'status' => $row['status'],
                'requester_id' => $requester(),
                'assignee_id' => $assigned ? $staff : null,
                'callback_phone' => $row['callback_phone'] ?? null,
                'take_note' => $row['take_note'] ?? null,
                'resolution' => $row['resolution'] ?? null,
                'responded_at' => $row['responded'] ?? null,
                'resolved_at' => $row['resolved'] ?? null,
            ]);
            // created_at is not fillable — set it (and updated_at) explicitly so the
            // spread across the 7/30/90 windows is preserved instead of "now".
            $ticket->created_at = $row['created'];
            $ticket->updated_at = $row['resolved'] ?? $row['responded'] ?? $row['created'];
            $ticket->save();
        }

        $this->command?->info('Seeded '.count($rows).' sample tickets.');
    }
}
