<?php

// Sample values for the email preview and test sends, one for every placeholder any template offers.

namespace App\Support;

use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Access\AccessService;
use App\Services\Contract\ContractDigestService;
use App\Services\Request\RequestNotificationService;
use App\Services\Stock\StockNotificationService;
use App\Services\Ticket\TicketDigestService;

class EmailSampleVars
{
    /** @return array<string, mixed> */
    public static function for(?User $user): array
    {
        $name = (string) ($user->name ?? 'Kanya Phakdee');

        return [
            // Same value the send path injects
            'app.name' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'user.first_name' => explode(' ', $name)[0] ?: 'there',
            'user.email' => $user->email ?? 'user@example.com',
            'count' => 3,
            // report.scheduled — a weekly schedule set by the person previewing.
            'report.name' => 'ทะเบียนทรัพย์สิน',
            'report.period' => DateDisplay::range('2026-09-21', '2026-09-27', null, 'en'),
            'report.rows' => '1,248',
            'report.frequency' => 'Every Monday at 07:00',
            'report.owner' => $name,
            'report.attachment_note' => 'The report file is attached.',
            'report.format' => 'Excel',
            'report.file' => 'Report_assets-overview_2026-10-18.xlsx',
            'report.expires' => '17 Nov 2026',
            'stock.sku' => 'SKU-1042',
            'stock.name' => 'USB-C Docking Station',
            'stock.qty' => 2,
            'stock.min' => 5,
            'stock.max' => 40,
            'stock.request_no' => 'REQ-2026-0001',
            'stock.request_by' => 'Piches Srisuk',
            'stock.request_reason' => 'Replacing the dock on the 3rd floor meeting room.',
            'stock.request_date' => DateDisplay::emailDate('2026-08-18'),
            'stock.approver' => 'Anong Wattana',
            'stock.fulfilled_by' => 'Kankanok P',
            'stock.fulfilled_date' => DateDisplay::emailDate('2026-08-20'),
            'stock.request_summary_table' => EmailTable::render(
                StockNotificationService::REQUEST_SUMMARY_HEADERS,
                [['Pending Approval', '2'], ['Awaiting Completion', '1']],
                [1],
                StockNotificationService::REQUEST_SUMMARY_WIDTHS,
            ),
            'stock.requests_table' => EmailTable::render(
                StockNotificationService::REQUEST_HEADERS,
                [
                    ['REQ-2026-0001', 'Piches Srisuk', DateDisplay::emailDate('2026-08-18'), 'USB-C Docking Station ×2', 'Pending Approval'],
                    ['REQ-2026-0004', 'Manee Jaidee', DateDisplay::emailDate('2026-08-24'), 'Wireless mouse ×1', 'Awaiting Completion'],
                ],
                [],
                StockNotificationService::REQUEST_WIDTHS,
                [3],
            ),
            'stock.summary_table' => EmailTable::render(
                StockNotificationService::SUMMARY_HEADERS,
                [['Out of Stock', '1'], ['Low Stock', '2'], ['Overstock', '0']],
                [1],
                StockNotificationService::SUMMARY_WIDTHS,
            ),
            'stock.items_table' => EmailTable::render(
                StockNotificationService::ITEM_HEADERS,
                [
                    ['SKU-1088', 'HDMI cable 2 m', '0', '10', '80', 'Out of Stock'],
                    ['SKU-1042', 'USB-C Docking Station', '2', '5', '40', 'Low Stock'],
                    ['SKU-1103', 'Wireless mouse', '4', '6', '60', 'Low Stock'],
                ],
                StockNotificationService::ITEM_NUMERIC,
                StockNotificationService::ITEM_WIDTHS,
                [1],
            ),
            'asset.code' => 'INK-IT-26-0042',
            'asset.model' => 'ThinkCentre Neo 55a 24 G6',
            'asset.tag' => 'PC042',
            'asset.type' => 'Computer',
            'asset.from' => 'Store IT',
            'asset.holder' => 'Somchai Suksawat',
            'asset.count' => 3,
            'employee.last_working' => DateDisplay::emailDate('2026-12-31'),
            // Built in PHP by AssetService, so the preview needs a stand-in
            'asset.table' => EmailTable::render(
                ['Device', 'Type', 'Serial', 'Tag'],
                [
                    ['ThinkCentre Neo 55a 24 G6', 'Computer', 'DN2312123', 'PC042'],
                    ['ThinkPad E14 Gen 5', 'Notebook', 'PF3X9K21', 'NB018'],
                    ['Dell P2422H 24"', 'Monitor', 'CN0J7T44', 'MN107'],
                ],
                [],
                ['38%', '20%', '24%', '18%'],
            ),
            'access.count' => 4,
            'access.table' => EmailTable::render(
                AccessService::ACCESS_HEADERS,
                [
                    ['MG-0007', 'Email group', 'Sales TH', 'sales-th@inaba-foods.co.th', 'Member'],
                    ['FS-0012', 'File share', 'Sales reports', '\\server\sales\reports', 'Read/Write'],
                    ['SM-0003', 'Social platform', 'Company LINE OA', 'https://line.me/R/ti/p/@inaba', 'Member'],
                    ['SW-0021', 'Software', 'Microsoft 365 E3', '-', 'Member'],
                ],
                [],
                AccessService::ACCESS_WIDTHS,
                AccessService::ACCESS_WRAP,
            ),
            'ticket.id' => 'TKT-2856',
            'ticket.subject' => 'Printer not responding',
            'ticket.category' => 'Hardware',
            'ticket.details' => 'The printer on the 3rd floor shows a paper jam error,<br>but there is no paper stuck inside.',
            'ticket.resolution' => 'Replaced the fuser roller and cleared the jam sensor.',
            'ticket.update' => 'The replacement fuser roller is on order,<br>expected within three working days.',
            'ticket.requester' => 'Somchai Suksawat',
            'ticket.assignee' => 'Piches Srisuk',
            'from.name' => 'Anong Wattana',
            'contract.vendor' => 'Acme Co.',
            'contract.name' => 'Annual support',
            'contract.code' => 'CT-2026-014',
            'contract.days_remaining' => 30,
            'contract.expires_in' => 'in 30 days',
            'contract.days_overdue' => 5,
            'contract.end_date' => DateDisplay::emailDate('2026-12-31'),
            'contract.details' => 'Microsoft 365 E3 License Agreement, 320 seats',
            'reference.id' => 'REF-0001',
            'request.title' => 'Request: Mail group',
            'request.type' => 'Email group',
            'request.date' => DateDisplay::emailDate('2026-08-18'),
            'request.approved_date' => DateDisplay::emailDate('2026-08-20'),
            'request.rejected_date' => DateDisplay::emailDate('2026-08-20'),
            'request.cancelled_date' => DateDisplay::emailDate('2026-08-22'),
            'request.ticket_no' => 'TKT-2856',
            'request.completed_date' => DateDisplay::emailDate('2026-08-22'),
            'request.completed_by' => 'Kankanok P',
            'request.reason' => 'Onboarding request with the new employee,<br />
first day 01-09-2026.',
            'request.details' => 'Device type: Desktop PC<br>Mailbox address: somchai@inaba-foods.co.th',
            'request.approval_history' => EmailTable::render(
                RequestNotificationService::HISTORY_HEADERS,
                [
                    ['Supervisor', '⏭️ Skipped - the requester has no manager', '-', '-'],
                    ['Department Manager', '✅ Approved', 'Anong Wattana', DateDisplay::emailDate('2026-08-19')],
                ],
                [],
                RequestNotificationService::HISTORY_WIDTHS,
                [1],
            ),
            'approver.name' => 'Anong Wattana',
            'approver.position' => 'Manager',
            'approver.department' => 'Information Technology',
            'requester.name' => 'Manee Jaidee',
            'actor.name' => 'Anong Wattana',
            'step.label' => 'Department manager',
            'remark' => 'The licence is not available on the current agreement.',
            'employee.name' => 'Somchai Suksawat',
            'employee.code' => 'EMP-1042',
            'employee.position' => 'Asst. Manager',
            'employee.section' => 'System analyst',
            'employee.department' => 'Information Technology',
            'employee.working' => DateDisplay::emailDate('2026-09-01'),
            'digest.count' => 2,
            'digest.open_count' => 2,
            'digest.working_count' => 1,
            // open_count + working_count.
            'digest.total' => 3,
            // Digest tables built through the same renderer the real mail uses
            'digest.table' => EmailTable::render(
                ['Reference', 'Request', 'Requested by', 'Days waiting'],
                [
                    [EmailTable::link('#', 'RQ-2026-0018'), 'Request: Mail group', 'Somchai Suksawat', '14'],
                    [EmailTable::link('#', 'RQ-2026-0021'), 'Request: Computer', 'Manee Jaidee', '9'],
                ],
                [3],
                ['18%', '40%', '26%', '16%'],
            ),
            'digest.expiring_count' => 2,
            'digest.overdue_count' => 1,
            'digest.expiring_table' => EmailTable::render(
                ContractDigestService::HEADERS,
                [
                    [EmailTable::link('#', 'CT-2026-014'), 'Acme Co.', 'Annual support', '฿120,000.00', DateDisplay::emailDate('2026-09-29'), '90, 30, 7 days'],
                    [EmailTable::link('#', 'CT-2026-021'), 'Lenovo (Thailand)', 'Notebook rental', '฿1,450,000.00', DateDisplay::emailDate('2026-10-31'), '150, 60, 30 days'],
                ],
                ContractDigestService::NUMERIC,
                ContractDigestService::WIDTHS,
            ),
            'digest.overdue_table' => EmailTable::render(
                ContractDigestService::HEADERS,
                [
                    [EmailTable::link('#', 'CT-2025-008'), 'Microsoft', 'Microsoft 365 E3', '฿980,000.00', DateDisplay::emailDate('2026-08-25'), '30, 7 days'],
                ],
                ContractDigestService::NUMERIC,
                ContractDigestService::WIDTHS,
            ),            'digest.open_table' => EmailTable::render(
                TicketDigestService::HEADERS_OPEN,
                [
                    [EmailTable::link('#', 'TKT-2856'), 'Printer not responding', 'Hardware', 'Somchai Suksawat', '4'],
                    [EmailTable::link('#', 'TKT-2861'), 'Cannot open shared drive', 'Network', 'Manee Jaidee', '2'],
                ],
                TicketDigestService::NUMERIC,
                TicketDigestService::WIDTHS,
            ),
            'digest.working_table' => EmailTable::render(
                TicketDigestService::HEADERS_WORKING,
                [
                    [EmailTable::link('#', 'TKT-2840'), 'Email signature missing', 'Software', 'Thanapon', '7'],
                ],
                TicketDigestService::NUMERIC,
                TicketDigestService::WIDTHS,
            ),
        ];
    }
}
