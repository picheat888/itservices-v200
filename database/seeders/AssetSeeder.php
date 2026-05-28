<?php

namespace Database\Seeders;

use App\Models\Asset;
use Illuminate\Database\Seeder;

class AssetSeeder extends Seeder
{
    /**
     * Seeds demo assets mirroring the design bundle, with a couple of extra rows
     * to exercise the pending-acceptance / pending-return states. Idempotent via
     * updateOrCreate on the asset tag.
     */
    public function run(): void
    {
        // [tag, type, brand, model, owner, department, status, value, source, purchase/lease start, warranty/lease end, last_reason]
        $assets = [
            ['INB-LT-00231', 'laptop',  'Lenovo', 'Lenovo ThinkPad T14s',      'EMP-1042', 'Production',         'deployed',           38500,  'purchased', '2024-02-14', '2027-02-14', null],
            ['INB-LT-00232', 'laptop',  'Lenovo', 'Lenovo ThinkPad T14s',      'EMP-1108', 'Quality Assurance',  'deployed',           38500,  'purchased', '2024-02-14', '2027-02-14', null],
            ['INB-DK-00045', 'desktop', 'Dell',   'Dell OptiPlex 7000',        'EMP-1305', 'Finance',            'deployed',           28900,  'purchased', '2023-09-01', '2026-09-01', null],
            ['INB-PR-00112', 'printer', 'HP',     'HP LaserJet M404dw',        'Shared — HR', 'Human Resources', 'deployed',           12800,  'purchased', '2023-04-10', '2026-04-10', null],
            ['INB-SV-00003', 'server',  'Dell',   'Dell PowerEdge R750',       'Datacenter Rack 2', 'IT',         'deployed',           485000, 'purchased', '2022-11-20', '2027-11-20', null],
            ['INB-MB-00078', 'mobile',  'Apple',  'iPhone 15 (128GB)',         'EMP-1901', 'Sales',              'deployed',           32900,  'purchased', '2024-06-05', '2026-06-05', null],
            ['RNT-NW-00012', 'network', 'Cisco',  'Cisco Catalyst 9300 (24p)', 'Plant 1 IDF', 'IT',              'deployed',           8500,   'rented',    '2024-01-01', '2027-01-01', null],
            ['INB-LT-00214', 'laptop',  'Apple',  'MacBook Pro 14"',           'EMP-1213', 'Operations',         'deployed',           78900,  'purchased', '2023-12-12', '2026-12-12', null],
            ['INB-LT-00198', 'laptop',  'Dell',   'Dell Latitude 5440',        'EMP-1422', 'Logistics',          'deployed',           32100,  'purchased', '2023-07-22', '2026-07-22', null],
            ['INB-MB-00074', 'mobile',  'Samsung', 'Samsung Galaxy S24',       'EMP-1422', 'Logistics',          'deployed',           28500,  'purchased', '2024-03-01', '2026-03-01', null],
            ['INB-LT-00150', 'laptop',  'Lenovo', 'Lenovo IdeaPad 5',          'Pool — IT', 'IT',                'ready',              24200,  'purchased', '2024-08-12', '2027-08-12', null],
            ['INB-LT-00141', 'laptop',  'HP',     'HP EliteBook 840',          'EMP-2003', 'Engineering',        'deployed',           42000,  'purchased', '2023-05-18', '2026-05-18', null],
            ['RNT-LT-00027', 'laptop',  'Dell',   'Dell Latitude (rental)',    'EMP-1901', 'Sales',              'deployed',           1800,   'rented',    '2024-04-01', '2026-04-01', null],
            ['INB-PR-00118', 'printer', 'Canon',  'Canon imageRUNNER 2630',    'Shared — Plant 1', 'Production',  'maintenance',        58000,  'purchased', '2022-08-15', '2025-08-15', 'Paper feed jamming — sent to vendor'],
            ['INB-LT-00251', 'laptop',  'Dell',   'Dell Latitude 5440',        'EMP-2115', 'Sales',              'pending_acceptance', 32100,  'purchased', '2025-09-01', '2028-09-01', 'New hire onboarding'],
            ['INB-MB-00080', 'mobile',  'Apple',  'iPhone 14 (128GB)',         'EMP-1500', 'Marketing',          'pending_return',     30000,  'purchased', '2024-02-01', '2026-02-01', 'Employee resignation'],
        ];

        foreach ($assets as $row) {
            [$tag, $type, $brand, $model, $owner, $dept, $status, $value, $source, $startDate, $endDate, $reason] = $row;
            $rented = $source === 'rented';

            Asset::updateOrCreate(['tag' => $tag], [
                'type' => $type,
                'brand' => $brand,
                'model' => $model,
                'owner' => $owner,
                'initial_owner' => $owner,
                'department' => $dept,
                'status' => $status,
                'value' => $value,
                'source' => $source,
                'purchase_date' => $rented ? null : $startDate,
                'warranty_end' => $rented ? null : $endDate,
                'lease_start' => $rented ? $startDate : null,
                'lease_end' => $rented ? $endDate : null,
                'registered_date' => $startDate,
                'last_reason' => $reason,
            ]);
        }
    }
}
