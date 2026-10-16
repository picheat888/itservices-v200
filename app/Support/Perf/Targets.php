<?php

namespace App\Support\Perf;

/** Row targets per table for the perf dataset, scaled by --scale (fixed master tables are not scaled). */
class Targets
{
    private const BASE = [
        'employees' => 1000, 'users' => 150, 'assets' => 2350, 'contracts' => 300, 'stock_items' => 300,
        'tickets' => 60000, 'ticket_updates' => 150000, 'ticket_attachments' => 9000,
        'service_requests' => 24000, 'request_approvals' => 72000, 'request_attachments' => 6000,
        'asset_transfers' => 6000, 'stock_movements' => 25000, 'stock_requests' => 6000,
        'stock_counts' => 36, 'stock_serials' => 3000, 'access_memberships' => 6000,
        'notifications' => 200000, 'email_logs' => 70000, 'audit_logs' => 300000,
        'report_exports' => 500, 'report_schedules' => 20,
        'softwares' => 40, 'social_platforms' => 8, 'email_groups' => 60, 'file_shares' => 40,
        'vendors' => 40, 'brands' => 50, 'asset_models' => 120, 'sections' => 45, 'locations' => 15, 'warehouses' => 5,
    ];

    private const FIXED = ['departments' => 15, 'positions' => 25];

    public function __construct(private readonly float $scale) {}

    public function of(string $key): int
    {
        return max(1, (int) round(self::BASE[$key] * $this->scale));
    }

    public function fixed(string $key): int
    {
        return self::FIXED[$key];
    }
}
