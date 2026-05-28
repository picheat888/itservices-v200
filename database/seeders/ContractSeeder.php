<?php

namespace Database\Seeders;

use App\Models\Contract;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class ContractSeeder extends Seeder
{
    /**
     * Seeds demo contracts. Idempotent via updateOrCreate on the contract code.
     *
     * Two groups:
     *  1. The 8 design-bundle contracts (fixed dates — design fidelity).
     *  2. A coverage set with end dates relative to "today" so the module shows
     *     every state: each reminder window (150/120/60/45/30/7 days), far-out
     *     active, and several delayed/overdue (expired) contracts — across all
     *     contract types and billing cycles.
     */
    public function run(): void
    {
        // Group 1 — the original design contracts (fixed dates).
        $design = [
            ['code' => 'CT-2024-018', 'vendor' => 'Microsoft Thailand', 'name' => 'Microsoft 365 E3 — 320 seats',       'type' => 'software',     'start_date' => '2024-07-01', 'end_date' => '2026-06-30', 'value' => 2140000, 'billing_cycle' => 'yearly'],
            ['code' => 'CT-2024-022', 'vendor' => 'AIS Business',        'name' => 'Fiber dedicated — Plant 1',          'type' => 'connectivity', 'start_date' => '2024-01-01', 'end_date' => '2026-06-15', 'value' => 42000,   'billing_cycle' => 'monthly'],
            ['code' => 'CT-2023-041', 'vendor' => 'SAP SE',              'name' => 'SAP Business One support',           'type' => 'service',      'start_date' => '2023-10-01', 'end_date' => '2026-09-30', 'value' => 820000,  'billing_cycle' => 'yearly'],
            ['code' => 'CT-2023-008', 'vendor' => 'Cisco Meraki',        'name' => 'Cloud network license — 18 APs',     'type' => 'connectivity', 'start_date' => '2023-04-15', 'end_date' => '2026-04-14', 'value' => 196000,  'billing_cycle' => 'yearly'],
            ['code' => 'CT-2024-005', 'vendor' => 'Adobe',               'name' => 'Creative Cloud — 12 seats',          'type' => 'software',     'start_date' => '2024-03-01', 'end_date' => '2027-02-28', 'value' => 324000,  'billing_cycle' => 'yearly'],
            ['code' => 'CT-2025-001', 'vendor' => 'Dell Technologies',   'name' => 'Server hardware support — 4 nodes',  'type' => 'hardware',     'start_date' => '2025-01-15', 'end_date' => '2027-01-14', 'value' => 412000,  'billing_cycle' => 'yearly'],
            ['code' => 'CT-2024-031', 'vendor' => 'Trend Micro',         'name' => 'Endpoint security — 380 seats',      'type' => 'software',     'start_date' => '2024-08-01', 'end_date' => '2026-07-31', 'value' => 285000,  'billing_cycle' => 'yearly'],
            ['code' => 'CT-2023-019', 'vendor' => 'AutoDesk',            'name' => 'AutoCAD LT — 6 seats',               'type' => 'software',     'start_date' => '2023-06-01', 'end_date' => '2026-05-31', 'value' => 126000,  'billing_cycle' => 'yearly'],
        ];

        foreach ($design as $c) {
            Contract::updateOrCreate(['code' => $c['code']], $c + ['notify_60' => true, 'notify_30' => true, 'notify_7' => true]);
        }

        // Group 2 — coverage set, end dates relative to today.
        $today = Carbon::now();

        // [code, vendor, name, type, billing, value, days_to_end, auto_renew, [reminders]]
        $coverage = [
            ['CT-DEMO-150', 'Oracle',            'Oracle DB enterprise — 8 cores',    'software',     'yearly',    1450000, 150,  true,  [150, 60, 30]],
            ['CT-DEMO-120', 'True Corporation',  'MPLS link — HQ ↔ Plant 2',          'connectivity', 'quarterly', 168000,  120,  false, [120, 60, 30, 7]],
            ['CT-DEMO-075', 'Fortinet',          'FortiGate firewall subscription',   'service',      'yearly',    240000,  75,   true,  [60, 30, 7]],
            ['CT-DEMO-045', 'Zoom',              'Zoom One Business — 50 hosts',      'software',     'monthly',   38000,   45,   false, [45, 30, 7]],
            ['CT-DEMO-030', 'Iron Mountain',     'Off-site records storage',          'other',        'yearly',    96000,   30,   false, [30, 7]],
            ['CT-DEMO-007', 'Lenovo',            'Workstation lease — design team',   'hardware',     'monthly',   54000,   7,    false, [30, 7]],
            ['CT-DEMO-365', 'Atlassian',         'Jira + Confluence — 120 users',     'software',     'yearly',    198000,  365,  true,  [60]],
            ['CT-DEMO-240', 'Veeam',             'Backup & replication — 6 sockets',  'service',      'quarterly', 132000,  240,  true,  [60, 30]],
            // Delayed / overdue (expired) contracts awaiting renewal action.
            ['CT-DEMO-D10', 'Sophos',            'Email gateway — overdue renewal',   'service',      'yearly',    144000,  -10,  false, [60, 30, 7]],
            ['CT-DEMO-D60', 'Canon Marketing',   'Printer fleet lease — lapsed',      'hardware',     'monthly',   28000,   -60,  false, [30, 7]],
            ['CT-DEMO-D200', 'Symantec',          'Legacy AV — decommissioning',       'software',     'yearly',    72000,   -200, false, [30]],
        ];

        foreach ($coverage as $row) {
            [$code, $vendor, $name, $type, $billing, $value, $daysToEnd, $autoRenew, $reminders] = $row;

            $end = $today->copy()->addDays($daysToEnd);
            $start = $end->copy()->subYear();

            Contract::updateOrCreate(['code' => $code], [
                'vendor' => $vendor,
                'name' => $name,
                'type' => $type,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'value' => $value,
                'billing_cycle' => $billing,
                'auto_renew' => $autoRenew,
                'notify_150' => in_array(150, $reminders, true),
                'notify_120' => in_array(120, $reminders, true),
                'notify_90' => in_array(90, $reminders, true),
                'notify_60' => in_array(60, $reminders, true),
                'notify_45' => in_array(45, $reminders, true),
                'notify_30' => in_array(30, $reminders, true),
                'notify_7' => in_array(7, $reminders, true),
            ]);
        }
    }
}
