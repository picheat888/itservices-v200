<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;

/** Perf step 4: vendors, brands, models, contracts with their alert ledgers, assets and their transfer history. */
class Assets implements PerfStep
{
    use FillsRows;

    private const BRANDS = [
        'Dell', 'HP', 'Lenovo', 'Acer', 'Asus', 'Apple', 'Samsung', 'LG', 'Canon', 'Epson', 'Brother', 'Ricoh', 'Cisco', 'Aruba',
        'Ubiquiti', 'TP-Link', 'D-Link', 'Hikvision', 'Dahua', 'Fortinet', 'MikroTik', 'Juniper', 'Huawei', 'Zebra', 'Logitech',
        'Microsoft', 'Xerox', 'Kyocera', 'Sharp', 'Konica Minolta', 'Synology', 'QNAP', 'APC', 'Eaton', 'Vertiv', 'Supermicro',
        'Western Digital', 'Seagate', 'Kingston', 'Intel', 'AMD', 'Nvidia', 'Netgear', 'Axis', 'Bosch', 'Panasonic', 'Sony',
        'Honeywell', 'Avaya', 'Yealink',
    ];

    private const SERIES = [
        'Latitude 5440', 'ThinkPad T14', 'EliteBook 840', 'ProBook 450', 'OptiPlex 7010', 'ThinkCentre M70', 'LaserJet Pro M404',
        'imageCLASS MF445', 'EcoTank L3250', 'Catalyst 2960', 'Aruba 2930F', 'UniFi AP AC', 'Archer AX55', 'DS-2CD2143', 'PowerEdge R650',
        'ProLiant DL380', 'Galaxy Tab A9', 'iPhone 14', 'ZT411 Printer', 'Smart-UPS 1500',
    ];

    private const VENDOR_PREFIX = ['Siam', 'Thai', 'Bangkok', 'Asia', 'Prime', 'Smart', 'Global', 'Inter', 'Metro', 'Alpha'];

    private const VENDOR_SUFFIX = ['Tech Co., Ltd.', 'Systems Co., Ltd.', 'Network Co., Ltd.', 'Computer Co., Ltd.', 'Solutions Co., Ltd.', 'Trading Co., Ltd.'];

    private const KIND_WEIGHTS = ['laptop' => 25, 'desktop' => 13, 'printer' => 8, 'network' => 12, 'mobile' => 15, 'server' => 3, 'cctv' => 9, 'other' => 15];

    private const VALUE_RANGE = [
        'laptop' => [25000, 60000], 'desktop' => [18000, 45000], 'printer' => [5000, 60000], 'network' => [3000, 150000],
        'mobile' => [8000, 45000], 'server' => [150000, 900000], 'cctv' => [2000, 30000], 'other' => [500, 20000],
    ];

    private const CONTRACT_NAMES = [
        'hardware' => ['Equipment rental', 'Hardware maintenance', 'Device lease'],
        'software' => ['Software subscription', 'Licence renewal', 'Cloud service'],
        'service' => ['Managed service', 'Support agreement', 'On-site service'],
        'connectivity' => ['Internet leased line', 'MPLS circuit', 'Mobile data plan'],
        'other' => ['Insurance', 'Consulting', 'Training'],
    ];

    private const SHARED_LABELS = ['Reception', 'Meeting Room', 'Production Line 1', 'Training Room', 'Warehouse Counter'];

    private const CYCLE_MONTHS = ['monthly' => 1, 'quarterly' => 3, 'yearly' => 12];

    private const THRESHOLDS = [150, 120, 90, 60, 45, 30, 7];

    /** @var array<int, string> */
    private array $itUsers = [];

    /** @var list<array<string, mixed>> */
    private array $employees = [];

    private CarbonImmutable $end;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->end = $ctx->clock->end();
        $this->employees = $ctx->reg->get('employees');
        foreach ($this->employees as $e) {
            if ($e['kind'] === 'it') {
                $this->itUsers[$e['user_id']] = $e['name'];
            }
        }

        $this->writeVendorsBrandsModels();
        $contracts = $this->writeContracts();
        $this->writeAssets($contracts);
    }

    /** @return array{0: int, 1: string} a random IT user: id and name */
    private function itUser(): array
    {
        $id = $this->ctx->rng->pick(array_keys($this->itUsers));

        return [$id, $this->itUsers[$id]];
    }

    private function writeVendorsBrandsModels(): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $stamp = $this->stamp();

        $vendorIds = [];
        $vendorNames = [];
        for ($i = 0; $i < $this->ctx->targets->of('vendors'); $i++) {
            $id = $reg->nextId('vendors');
            $name = self::VENDOR_PREFIX[$i % 10].' '.self::VENDOR_SUFFIX[intdiv($i, 10) % 6].($i >= 60 ? ' '.$i : '');
            $contact = NamePool::first($rng).' '.NamePool::last($rng);
            $this->ctx->sql->insert('vendors', $this->fill('vendors', [
                'id' => $id, 'name' => $name, 'name_th' => null, 'contact' => $contact,
                'phone' => sprintf('02-%03d-%04d', $rng->int(100, 999), $rng->int(1000, 9999)),
                'email' => 'sales'.$id.'@vendor.perf.local', 'address' => $rng->int(1, 999).' Rama IV Road, Bangkok',
                'created_at' => $stamp, 'updated_at' => $stamp,
            ]));
            $vendorIds[] = $id;
            $vendorNames[$id] = $name;
        }

        $brandIds = [];
        foreach (array_slice(self::BRANDS, 0, $this->ctx->targets->of('brands')) as $name) {
            $id = $reg->nextId('brands');
            $this->ctx->sql->insert('brands', $this->fill('brands', ['id' => $id, 'name' => $name, 'description' => $name, 'created_at' => $stamp, 'updated_at' => $stamp]));
            $brandIds[$id] = $name;
        }

        $models = [];
        $perSeries = count(self::SERIES);
        for ($i = 0; $i < $this->ctx->targets->of('asset_models'); $i++) {
            $id = $reg->nextId('asset_models');
            $brandId = array_keys($brandIds)[$i % count($brandIds)];
            $name = self::SERIES[$i % $perSeries].($i >= $perSeries ? ' Gen'.(intdiv($i, $perSeries) + 1) : '');
            $this->ctx->sql->insert('asset_models', $this->fill('asset_models', ['id' => $id, 'name' => $name, 'brand_id' => $brandId, 'description' => $name, 'created_at' => $stamp, 'updated_at' => $stamp]));
            $models[$id] = ['brand_id' => $brandId, 'brand' => $brandIds[$brandId], 'name' => $name];
        }

        $reg->remember('vendor_ids', $vendorIds);
        $reg->remember('vendor_names', $vendorNames);
        $reg->remember('brand_ids', array_keys($brandIds));
        $reg->remember('model_ids', array_keys($models));
        $this->models = $models;
        $this->vendorIds = $vendorIds;
    }

    /** @var array<int, array{brand_id: int, brand: string, name: string}> */
    private array $models = [];

    /** @var list<int> */
    private array $vendorIds = [];

    /** @return list<array<string, mixed>> */
    private function writeContracts(): array
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $earliest = CarbonImmutable::parse('2023-01-01');
        $latest = CarbonImmutable::parse('2026-09-30');

        $contracts = [];
        for ($i = 0; $i < $this->ctx->targets->of('contracts'); $i++) {
            $type = $i === 0 ? 'hardware' : $rng->weighted(['hardware' => 45, 'software' => 20, 'service' => 15, 'connectivity' => 10, 'other' => 10]);
            $cycle = $rng->weighted(['monthly' => 50, 'quarterly' => 15, 'yearly' => 35]);
            $term = $rng->pick([12, 24, 36]);
            $start = $this->dateBetween($earliest, $latest);
            $endDate = $start->addMonths($term)->subDay();

            $expiredAt = null;
            $cancelledAt = null;
            if ($endDate < $this->end->subDays(30) && $rng->chance(0.9)) {
                $expiredAt = min($endDate->addDays($rng->int(1, 20))->setTime(10, 0), $this->end);
            } elseif ($endDate >= $this->end && $rng->chance(0.1) && $start->addDays(30) < $this->end) {
                $cancelledAt = $this->dateBetween($start->addDays(30), $this->end)->setTime(11, 0);
            }

            $value = $rng->int(5, 500) * 1000;
            $contracts[] = [
                'type' => $type, 'cycle' => $cycle, 'term' => $term, 'start' => $start, 'end_date' => $endDate,
                'value' => $value, 'total' => $value * intdiv($term, self::CYCLE_MONTHS[$cycle]),
                'expired_at' => $expiredAt, 'cancelled_at' => $cancelledAt,
                'vendor_id' => $rng->pick($this->vendorIds), 'creator' => $this->itUser(),
                'notify' => [150 => true, 120 => $rng->chance(0.3), 90 => true, 60 => $rng->chance(0.3), 45 => $rng->chance(0.3), 30 => true, 7 => true],
            ];
        }
        usort($contracts, fn (array $a, array $b): int => $a['start'] <=> $b['start']);

        foreach ($contracts as &$c) {
            $c['id'] = $this->ctx->reg->nextId('contracts');
            $c['code'] = sprintf('CT-%d-%03d', $c['start']->year, $c['id']);
            $createdAt = $c['start']->subDays($rng->int(0, 14))->setTime(9, $rng->int(0, 59));
            $label = $rng->pick(self::CONTRACT_NAMES[$c['type']]);
            $c['name'] = $label.' '.$c['code'];
            $this->ctx->sql->insert('contracts', $this->fill('contracts', [
                'id' => $c['id'], 'code' => $c['code'], 'vendor_id' => $c['vendor_id'], 'name' => $label.' '.$c['code'],
                'details' => $label, 'type' => $c['type'], 'start_date' => $c['start']->toDateString(), 'end_date' => $c['end_date']->toDateString(),
                'value' => $c['value'], 'total_value' => $c['total'], 'billing_cycle' => $c['cycle'],
                'cancelled_at' => $c['cancelled_at'], 'cancelled_by' => $c['cancelled_at'] ? $c['creator'][0] : null,
                'expired_at' => $c['expired_at'], 'cancel_reason' => $c['cancelled_at'] ? 'No longer needed' : null,
                'notify_150' => $c['notify'][150], 'notify_120' => $c['notify'][120], 'notify_90' => $c['notify'][90], 'notify_60' => $c['notify'][60],
                'notify_45' => $c['notify'][45], 'notify_30' => $c['notify'][30], 'notify_7' => $c['notify'][7],
                'created_at' => $createdAt, 'updated_at' => $c['expired_at'] ?? $c['cancelled_at'] ?? $createdAt,
                'created_by' => $c['creator'][0], 'updated_by' => $c['creator'][0],
            ]));
            $this->ctx->reg->event('contract.created', ['contract_id' => $c['id'], 'code' => $c['code'], 'at' => max($createdAt, $clock->start()), 'by_user_id' => $c['creator'][0], 'by_name' => $c['creator'][1]]);
            if ($c['expired_at']) {
                $this->ctx->reg->event('contract.expired', ['contract_id' => $c['id'], 'code' => $c['code'], 'at' => $c['expired_at'], 'by_user_id' => $c['creator'][0], 'by_name' => $c['creator'][1]]);
            }
            if ($c['cancelled_at']) {
                $this->ctx->reg->event('contract.cancelled', ['contract_id' => $c['id'], 'code' => $c['code'], 'at' => $c['cancelled_at'], 'by_user_id' => $c['creator'][0], 'by_name' => $c['creator'][1]]);
            }
            $this->writeContractLedgers($c);
        }
        unset($c);
        $this->ctx->reg->remember('contracts', array_map(fn (array $c): array => [
            'id' => $c['id'], 'code' => $c['code'], 'vendor_id' => $c['vendor_id'], 'type' => $c['type'], 'end_date' => $c['end_date'], 'expired_at' => $c['expired_at'],
        ], $contracts));

        return $contracts;
    }

    /** @param array<string, mixed> $c */
    private function writeContractLedgers(array $c): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $windowStart = $this->ctx->clock->start();
        $until = min($c['expired_at'] ?? $this->end, $c['cancelled_at'] ?? $this->end, $this->end);

        $alert = function (int $threshold, CarbonImmutable $at) use ($c, $reg, $windowStart, $until): void {
            if ($at < $windowStart || $at > $until || $at < $c['start']) {
                return;
            }
            $this->ctx->sql->insert('contract_alert_logs', ['id' => $reg->nextId('contract_alert_logs'), 'contract_id' => $c['id'], 'threshold' => $threshold, 'alerted_at' => $at]);
            $reg->event('contract.alert', ['contract_id' => $c['id'], 'code' => $c['code'], 'name' => $c['name'], 'vendor_id' => $c['vendor_id'], 'threshold' => $threshold, 'at' => $at]);
        };
        foreach (self::THRESHOLDS as $threshold) {
            if ($c['notify'][$threshold]) {
                $alert($threshold, $c['end_date']->subDays($threshold)->setTime(8, 5));
            }
        }
        if ($c['end_date'] < $this->end && $c['cancelled_at'] === null) {
            $alert(0, $c['end_date']->addDay()->setTime(8, 5));
        }

        $from = max($c['end_date']->subDays(150), $c['start'], $windowStart->startOfDay());
        for ($day = $from; $day <= min($c['end_date'], $until); $day = $day->addDay()) {
            if ($rng->chance(0.07) && $c['cancelled_at'] === null) {
                $this->ctx->sql->insert('contract_bell_logs', ['id' => $reg->nextId('contract_bell_logs'), 'contract_id' => $c['id'], 'bell_date' => $day->toDateString()]);
            }
        }

        $id = $reg->nextId('contract_attachments');
        $this->ctx->sql->insert('contract_attachments', $this->fill('contract_attachments', [
            'id' => $id, 'contract_id' => $c['id'], 'original_name' => 'contract-'.$c['code'].'.pdf', 'path' => 'contracts/'.$c['id'].'/contract.pdf',
            'size' => $rng->int(80000, 3000000), 'mime' => 'application/pdf', 'created_at' => $c['start'], 'updated_at' => $c['start'],
        ]));
    }

    /** @param list<array<string, mixed>> $contracts */
    private function writeAssets(array $contracts): void
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $categories = $this->ctx->reg->get('category_by_kind');
        $rentable = array_values(array_filter($contracts, fn (array $c): bool => in_array($c['type'], ['hardware', 'connectivity'], true)));

        $total = $this->ctx->targets->of('assets');
        $specs = [];
        for ($i = 0; $i < $total; $i++) {
            $kind = $rng->weighted(self::KIND_WEIGHTS);
            $modelId = $rng->pick(array_keys($this->models));
            $contract = $rentable !== [] && $rng->chance(0.30) ? $rng->pick($rentable) : null;
            if ($contract !== null) {
                $created = min(max($contract['start'], $clock->start())->addDays($rng->int(0, 30))->setTime($rng->int(9, 17), $rng->int(0, 59)), $this->end->subDay());
                $purchase = $contract['start'];
            } elseif ($rng->chance(0.45)) {
                $created = $clock->start()->addDays($rng->int(0, 30))->setTime($rng->int(9, 17), $rng->int(0, 59));
                $purchase = $this->dateBetween(CarbonImmutable::parse('2019-01-01'), $clock->start()->subDay());
            } else {
                $created = $clock->moment($rng);
                $purchase = $created->subDays($rng->int(0, 5))->startOfDay();
            }
            [$lo, $hi] = self::VALUE_RANGE[$kind];
            $specs[] = [
                'kind' => $kind, 'category_id' => $categories[$kind], 'model_id' => $modelId, 'contract' => $contract, 'created' => $created,
                'purchase' => $purchase, 'value' => $rng->int(intdiv($lo, 100), intdiv($hi, 100)) * 100, 'writeoff' => false,
                'returnAt' => $contract !== null && $contract['expired_at'] !== null ? $contract['expired_at']->subDays($rng->int(1, 10)) : null,
            ];
        }
        usort($specs, fn (array $a, array $b): int => $a['created'] <=> $b['created']);

        // Retired assets: a random 6.4% of those old enough to have run a full cycle
        $eligible = array_keys(array_filter($specs, fn (array $s): bool => $s['returnAt'] === null && $s['created'] < $this->end->subDays(90)));
        foreach (array_slice($this->ctx->rng->shuffle($eligible), 0, (int) round($total * 150 / 2350)) as $idx) {
            $specs[$idx]['writeoff'] = true;
        }

        $assets = [];
        foreach ($specs as $spec) {
            $assets[] = $this->simulateAndWrite($spec);
        }
        $this->ctx->reg->remember('assets', $assets);
    }

    /** @return array<string, mixed> a pool employee at time $t */
    private function pickEmployee(CarbonImmutable $t, bool $mustBeActive): array
    {
        for ($try = 0; $try < 12; $try++) {
            $e = $this->ctx->rng->pick($this->employees);
            if ($e['joined_at'] <= $t && ($e['last_day'] === null || $e['last_day'] > $t) && (! $mustBeActive || $e['status'] === 'active')) {
                return $e;
            }
        }
        foreach ($this->employees as $e) {
            if ($e['status'] === 'active' && $e['joined_at'] <= $t) {
                return $e;
            }
        }

        return $this->employees[0];
    }

    /** @param array<string, mixed> $spec @return array<string, mixed> */
    private function simulateAndWrite(array $spec): array
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $contract = $spec['contract'];
        $model = $this->models[$spec['model_id']];
        $id = $reg->nextId('assets');
        $code = $reg->assetCode($spec['created']);
        $warehouses = $reg->get('warehouse_names');
        $locations = $reg->get('location_ids');
        $locationNames = $reg->get('location_names');
        [$byId, $byName] = $this->itUser();

        $limit = $spec['returnAt'] !== null ? $spec['returnAt']->subDay() : $this->end;
        $forceReady = $spec['writeoff'] || $spec['returnAt'] !== null;
        $adv = fn (CarbonImmutable $from, int $min, int $max): ?CarbonImmutable => ($n = $from->addMinutes($rng->int($min, $max))) <= $limit ? $n : null;

        $warehouseIdx = $rng->int(0, count($warehouses) - 1);
        $s = [
            'status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'location_id' => null, 'warehouse_id' => $warehouseIdx + 1,
            'owned_since' => null, 'last_reason' => null, 'writeoff_reason_id' => null, 'written_off_at' => null, 'written_off_by' => null,
            'returned_to_vendor_at' => null, 'returned_to_vendor_by' => null,
        ];
        $where = $warehouses[$warehouseIdx];
        $t = $spec['created'];
        $reg->event('asset.registered', ['asset_id' => $id, 'code' => $code, 'model' => $model['name'], 'at' => $t, 'by_user_id' => $byId, 'by_name' => $byName]);

        $transfer = function (string $kind, string $from, string $to, string $reason, CarbonImmutable $at) use ($id, $code, $model, $byName, $sql, $reg): void {
            $sql->insert('asset_transfers', $this->fill('asset_transfers', [
                'id' => $reg->nextId('asset_transfers'), 'asset_id' => $id, 'asset_tag' => $code, 'asset_model' => $model['name'], 'kind' => $kind,
                'from_owner' => $from, 'to_owner' => $to, 'reason' => $reason, 'performed_by' => $byName, 'created_at' => $at, 'updated_at' => $at,
            ]));
        };
        $returnToPool = function (CarbonImmutable $at) use (&$s, &$where, $warehouses, $rng, $transfer, $reg, $id, $code, $byId, $byName): void {
            $idx = $rng->int(0, count($warehouses) - 1);
            $transfer('return', $where, $warehouses[$idx], 'Returned to pool', $at);
            $reg->event('asset.received', ['asset_id' => $id, 'code' => $code, 'at' => $at, 'by_user_id' => $byId, 'by_name' => $byName, 'warehouse' => $warehouses[$idx]]);
            $s = array_merge($s, ['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'owned_since' => null, 'location_id' => null, 'warehouse_id' => $idx + 1, 'last_reason' => 'Returned to pool']);
            $where = $warehouses[$idx];
        };

        $shared = ! $forceReady && $rng->chance(0.04);
        $cycles = $shared ? 0 : $rng->weighted([0 => 20, 1 => 35, 2 => 25, 3 => 15, 4 => 5]);
        if ($forceReady) {
            $cycles = ($limit->diffInDays($t) > 200) ? min($cycles, 1) : 0;
        }

        if ($shared && ($at = $adv($t, 1440, 40 * 1440))) {
            $label = $rng->pick(self::SHARED_LABELS);
            $transfer('handover', $where, $label, 'Common use', $at);
            $reg->event('asset.handover', ['asset_id' => $id, 'code' => $code, 'model' => $model['name'], 'employee_id' => null, 'label' => $label, 'at' => $at, 'by_user_id' => $byId, 'by_name' => $byName, 'from' => $where]);
            $s = array_merge($s, ['status' => 'common', 'owner' => $label, 'location_id' => $rng->pick($locations), 'warehouse_id' => null, 'last_reason' => 'Common use']);
            $where = $label;
            $t = $at;
        }

        for ($j = 1; $j <= $cycles; $j++) {
            $last = $j === $cycles;
            $at = $forceReady ? $adv($t, 1440, 30 * 1440) : $adv($t, 1440, 60 * 1440);
            if ($at === null) {
                break;
            }
            $t = $at;
            $emp = $this->pickEmployee($t, $last && ! $forceReady);
            $transfer('handover', $where, $emp['code'], 'Assigned', $t);
            $reg->event('asset.handover', ['asset_id' => $id, 'code' => $code, 'model' => $model['name'], 'employee_id' => $emp['id'], 'label' => null, 'at' => $t, 'by_user_id' => $byId, 'by_name' => $byName, 'from' => $where]);
            $s = array_merge($s, ['status' => 'pending_acceptance', 'owner' => null, 'owner_employee_id' => $emp['id'], 'location_id' => $rng->pick($locations), 'warehouse_id' => null, 'owned_since' => null, 'last_reason' => 'Assigned']);
            $where = $emp['code'];

            if ($rng->chance(0.03) && $t < $this->end->subDays(30)) {
                $at = $adv($t, 1440, 5 * 1440);
                if ($at !== null) {
                    $t = $at;
                    $transfer('recall', $where, $warehouses[$warehouseIdx], 'Recalled - transfer cancelled', $t);
                    $reg->event('asset.recalled', ['asset_id' => $id, 'code' => $code, 'employee_id' => $emp['id'], 'at' => $t, 'by_user_id' => $byId, 'by_name' => $byName]);
                    $s = array_merge($s, ['status' => 'ready', 'owner_employee_id' => null, 'location_id' => null, 'warehouse_id' => $warehouseIdx + 1, 'last_reason' => 'Recalled - transfer cancelled']);
                    $where = $warehouses[$warehouseIdx];

                    continue;
                }
            }
            if ($t > $this->end->subDays(30) && $rng->chance(0.03)) {
                break;
            }
            $at = $adv($t, 60, 3 * 1440);
            if ($at === null) {
                break;
            }
            $t = $at;
            $s['status'] = 'deployed';
            $s['owned_since'] = $t;
            $reg->event('asset.accepted', ['asset_id' => $id, 'code' => $code, 'employee_id' => $emp['id'], 'at' => $t]);

            if ($rng->chance(0.10) && ($at = $adv($t, 1440, 30 * 1440))) {
                $newLoc = $rng->pick($locations);
                $transfer('relocate', $locationNames[$s['location_id']], $locationNames[$newLoc], 'Moved', $at);
                $reg->event('asset.relocated', ['asset_id' => $id, 'code' => $code, 'at' => $at, 'by_user_id' => $byId, 'by_name' => $byName]);
                $s['location_id'] = $newLoc;
                $t = $at;
            }

            if ($last && ! $forceReady && ! $rng->chance(0.35)) {
                break;
            }
            $at = $forceReady ? $adv($t, 20 * 1440, 120 * 1440) : $adv($t, 30 * 1440, 400 * 1440);
            if ($at === null) {
                break;
            }
            $t = $at;
            $s['status'] = 'pending_return';
            $s['last_reason'] = 'Return requested';
            $reg->event('asset.return_requested', ['asset_id' => $id, 'code' => $code, 'employee_id' => $emp['id'], 'at' => $t, 'by_user_id' => $emp['user_id'], 'by_name' => $emp['name']]);
            $at = $adv($t, 1440, 5 * 1440);
            if ($at === null) {
                break;
            }
            $t = $at;
            $returnToPool($t);
        }

        if ($forceReady && $s['status'] !== 'ready') {
            $t = min($t->addMinutes($rng->int(60, 1440)), $limit);
            $returnToPool($t);
        }

        if ($spec['returnAt'] !== null) {
            $at = $spec['returnAt'];
            $s = array_merge($s, ['status' => 'writeoff', 'written_off_at' => $at, 'written_off_by' => $byId, 'returned_to_vendor_at' => $at, 'returned_to_vendor_by' => $byId, 'last_reason' => 'Returned to vendor']);
            $reg->event('asset.writeoff', ['asset_id' => $id, 'code' => $code, 'at' => $at, 'by_user_id' => $byId, 'by_name' => $byName, 'returned' => true]);
            $t = $at;
        } elseif ($spec['writeoff']) {
            $t = $adv($t, 5 * 1440, 400 * 1440) ?? min($t->addDay(), $this->end);
            $s = array_merge($s, ['status' => 'writeoff', 'written_off_at' => $t, 'written_off_by' => $byId, 'writeoff_reason_id' => $rng->pick($reg->get('writeoff_reason_ids')), 'last_reason' => 'Written off']);
            $reg->event('asset.writeoff', ['asset_id' => $id, 'code' => $code, 'at' => $t, 'by_user_id' => $byId, 'by_name' => $byName, 'returned' => false]);
        }

        $warranty = $rng->chance(0.03) ? null : $spec['purchase']->addYears($rng->int(1, 3));
        $sql->insert('assets', $this->fill('assets', [
            'id' => $id, 'asset_code' => $code, 'tag' => $model['brand'].' '.$model['name'], 'category_id' => $spec['category_id'],
            'brand_id' => $model['brand_id'], 'model_id' => $spec['model_id'], 'serial' => $this->serial(),
            'source' => $contract !== null ? 'rented' : 'purchased', 'status' => $s['status'], 'owner' => $s['owner'],
            'owner_employee_id' => $s['owner_employee_id'], 'location_id' => $s['location_id'], 'warehouse_id' => $s['warehouse_id'],
            'value' => $spec['value'], 'vendor_id' => $contract['vendor_id'] ?? $rng->pick($this->vendorIds),
            'purchase_date' => $spec['purchase']->toDateString(), 'warranty_end' => $warranty?->toDateString(), 'warranty_lifetime' => $warranty === null,
            'contract_id' => $contract['id'] ?? null, 'owned_since' => $s['owned_since']?->toDateString(), 'last_reason' => $s['last_reason'],
            'writeoff_reason_id' => $s['writeoff_reason_id'], 'written_off_at' => $s['written_off_at'], 'written_off_by' => $s['written_off_by'],
            'returned_to_vendor_at' => $s['returned_to_vendor_at'], 'returned_to_vendor_by' => $s['returned_to_vendor_by'],
            'created_at' => $spec['created'], 'updated_at' => $t, 'created_by' => $byId, 'updated_by' => $byId,
        ]));

        return ['id' => $id, 'code' => $code, 'status' => $s['status'], 'owner_employee_id' => $s['owner_employee_id'], 'category' => $spec['kind']];
    }

    private function serial(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
        $out = '';
        for ($i = 0; $i < 10; $i++) {
            $out .= $chars[$this->ctx->rng->int(0, strlen($chars) - 1)];
        }

        return $out;
    }
}
