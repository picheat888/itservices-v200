<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;

/** Perf step 5: stock items and a chronological replay of receipts, requests, transfers, returns and counts. */
class Stock implements PerfStep
{
    use FillsRows;

    // [category name => [names, cost range]]
    private const CATALOGUE = [
        'Toner / Cartridge' => [['HP 79A Toner', 'Canon 337 Toner', 'Brother TN-2480', 'Epson 003 Ink', 'Ricoh SP 201 Toner'], [800, 4000]],
        'Computer parts' => [['DDR4 8GB RAM', 'DDR4 16GB RAM', 'SSD 512GB', 'SSD 1TB', 'HDD 2TB', 'PSU 500W', 'CPU Cooler'], [300, 6000]],
        'Cable' => [['Cat6 Patch Cable 2m', 'HDMI Cable 3m', 'DisplayPort Cable', 'USB-C Cable', 'Power Cable'], [50, 600]],
        'Accessories' => [['Wireless Mouse', 'USB Keyboard', 'USB Hub 4-port', 'Laptop Charger 65W', 'Webcam'], [150, 2500]],
        'Consumables' => [['A4 Paper Ream', 'CD-R Pack', 'USB Flash Drive 32GB', 'Cleaning Wipes', 'Label Roll'], [30, 500]],
    ];

    private const TRACKED_NAMES = ['Spare Laptop 14"', 'Monitor 24"', 'Network Switch 24-port', 'Access Point', 'Docking Station Pro', 'Handheld Scanner'];

    private const REASONS = ['Replace a broken part', 'New employee setup', 'Out of supplies', 'Spare for the department', 'Project rollout', 'Monthly supplies'];

    private const RECEIPT_SHARE = 0.40;

    private const TRANSFER_SHARE = 0.26;

    private const RETURN_SHARE = 0.18;

    /** @var array<int, array<string, mixed>> items by id */
    private array $items = [];

    /** @var list<string> */
    private array $warehouses = [];

    /** @var list<array{0: int, 1: string}> IT staff: user id and name */
    private array $it = [];

    /** @var list<array<string, mixed>> */
    private array $users = [];

    /** @var array<int, array<int, int>> balance by item then warehouse index */
    private array $bal = [];

    /** @var array<int, list<array<string, mixed>>> */
    private array $lots = [];

    /** @var array<int, list<array<string, mixed>>> */
    private array $serials = [];

    /** @var array<int, int> */
    private array $issuedTotal = [];

    /** @var array<int, int> */
    private array $returnedTotal = [];

    /** @var array<int, string> */
    private array $alertState = [];

    /** @var array<int, CarbonImmutable> */
    private array $lastMove = [];

    /** @var list<array<string, mixed>> */
    private array $requests = [];

    private int $seq = 0;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->warehouses = $ctx->reg->get('warehouse_names');
        $employees = $ctx->reg->get('employees');
        foreach ($employees as $e) {
            if ($e['kind'] === 'it') {
                $this->it[] = [$e['user_id'], $e['name']];
            }
            if ($e['user_id'] !== null) {
                $this->users[] = $e;
            }
        }

        $this->makeItems();
        $events = [];
        $this->makeRequests($events);
        $this->makeInflow($events);
        $this->makeCounts($events);

        usort($events, fn (array $a, array $b): int => [$a['at'], $a['seq']] <=> [$b['at'], $b['seq']]);
        foreach ($events as $event) {
            match ($event['kind']) {
                'receive' => $this->receive($event['item'], $event['wh'], $event['qty'], $event['at']),
                'transfer' => $this->transfer($event['item'], $event['at']),
                'return' => $this->returnItem($event['item'], $event['at']),
                'fulfil' => $this->fulfil($this->requests[$event['request']], $event['at']),
                'count' => $this->count($event['at'], $event['draft']),
            };
        }

        $this->finish();
    }

    private function addEvent(array &$events, CarbonImmutable $at, string $kind, array $data): void
    {
        $events[] = ['at' => $at, 'seq' => $this->seq++, 'kind' => $kind] + $data;
    }

    /** @return array{0: int, 1: string} */
    private function itStaff(): array
    {
        return $this->ctx->rng->pick($this->it);
    }

    private function makeItems(): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $stockIds = $reg->get('stock_category_ids');
        $n = $this->ctx->targets->of('stock_items');
        $stamp = $this->stamp();
        $names = array_keys(self::CATALOGUE);

        for ($i = 0; $i < $n; $i++) {
            $tracked = $i % 5 === 0;
            $category = $tracked ? 'Computer parts' : $names[$i % count($names)];
            [$pool, [$lo, $hi]] = self::CATALOGUE[$category];
            $base = $tracked ? self::TRACKED_NAMES[($i / 5) % count(self::TRACKED_NAMES)] : $pool[intdiv($i, count($names)) % count($pool)];
            $id = $reg->nextId('stock_items');
            $warehouseCount = $rng->int(2, 3);
            $this->items[$id] = [
                'id' => $id, 'sku' => sprintf('SKU-%07d', $id), 'name' => $base.' '.$rng->pick(['Standard', 'Plus', 'Pro', 'Lite']),
                'tracked' => $tracked, 'cost' => $tracked ? $rng->int(30, 400) * 100 : $rng->int($lo, $hi),
                'category_id' => $stockIds[$i % count($stockIds)] ?? null, 'brand_id' => $rng->pick($reg->get('brand_ids')),
                'unit_id' => $rng->pick($reg->get('unit_ids')), 'warranty_type_id' => $rng->chance(0.5) ? $rng->pick($reg->get('warranty_type_ids')) : null,
                'main' => array_slice($rng->shuffle(range(0, count($this->warehouses) - 1)), 0, $warehouseCount),
                'pop' => $tracked ? $rng->int(1, 3) : $rng->int(1, 10), 'demand' => 0, 'creator' => $this->itStaff()[0], 'created_at' => $stamp,
            ];
            $this->bal[$id] = [];
            $this->lots[$id] = [];
            $this->serials[$id] = [];
            $this->issuedTotal[$id] = 0;
            $this->returnedTotal[$id] = 0;
            $this->alertState[$id] = 'ok';
        }
    }

    private function pickItem(): int
    {
        $total = array_sum(array_column($this->items, 'pop'));
        $r = $this->ctx->rng->float() * $total;
        foreach ($this->items as $id => $item) {
            $r -= $item['pop'];
            if ($r < 0) {
                return $id;
            }
        }

        return array_key_last($this->items);
    }

    /** @param list<array<string, mixed>> $events */
    private function makeRequests(array &$events): void
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $reg = $this->ctx->reg;

        $drafts = [];
        for ($i = 0; $i < $this->ctx->targets->of('stock_requests'); $i++) {
            $drafts[] = ['at' => $clock->moment($rng), 'item' => $this->pickItem()];
        }
        usort($drafts, fn (array $a, array $b): int => $a['at'] <=> $b['at']);

        foreach ($drafts as $d) {
            $item = $this->items[$d['item']];
            $at = $d['at'];
            $who = $this->requester($at);
            $qty = $item['tracked'] ? $rng->int(1, 2) : $rng->int(1, 10);
            $recent = $at > $clock->end()->subDays(30);
            $outcome = $recent
                ? $rng->weighted(['pending' => 30, 'approved' => 20, 'fulfilled' => 40, 'rejected' => 10])
                : $rng->weighted(['fulfilled' => 88, 'rejected' => 12]);

            [$approverId, $approver] = $this->itStaff();
            $approvedAt = $rejectedAt = $fulfilledAt = null;
            if ($outcome !== 'pending') {
                $decided = $clock->after($at, $rng, 60, 2 * 1440);
                $outcome === 'rejected' ? $rejectedAt = $decided : $approvedAt = $decided;
            }
            if ($outcome === 'fulfilled') {
                $fulfilledAt = $clock->after($approvedAt, $rng, 60, 3 * 1440);
            }
            $id = $reg->nextId('stock_requests');
            $reference = $reg->yearNo('REQ', $at->year, 4);
            $request = [
                'id' => $id, 'reference' => $reference, 'item' => $d['item'], 'qty' => $qty, 'requester' => $who, 'at' => $at,
                'fulfiller' => $this->itStaff(), 'fulfilled_at' => $fulfilledAt,
            ];
            $this->requests[] = $request;
            if ($outcome === 'fulfilled') {
                $this->items[$d['item']]['demand'] += $qty;
                $this->addEvent($events, $fulfilledAt, 'fulfil', ['request' => count($this->requests) - 1]);
            }

            $this->ctx->sql->insert('stock_requests', $this->fill('stock_requests', [
                'id' => $id, 'reference' => $reference, 'stock_item_id' => $d['item'], 'user_id' => $who['user_id'], 'requester_name' => $who['name'],
                'qty' => $qty, 'reason' => $rng->pick(self::REASONS), 'status' => $outcome,
                'approver_name' => $outcome === 'pending' ? null : $approver, 'approved_at' => $approvedAt, 'fulfilled_at' => $fulfilledAt,
                'fulfilled_by' => $fulfilledAt ? $request['fulfiller'][1] : null, 'rejected_at' => $rejectedAt,
                'created_at' => $at, 'updated_at' => $fulfilledAt ?? $approvedAt ?? $rejectedAt ?? $at,
            ]));

            $base = ['request_id' => $id, 'reference' => $reference, 'sku' => $item['sku'], 'name' => $item['name'], 'qty' => $qty, 'requester_user_id' => $who['user_id'], 'approver_user_ids' => array_column($this->it, 0)];
            $reg->event('stock.request', $base + ['subtype' => 'created', 'at' => $at, 'actor_user_id' => $who['user_id'], 'actor_name' => $who['name']]);
            $reg->event('stock.request', $base + ['subtype' => 'waiting', 'at' => $at, 'actor_user_id' => $who['user_id'], 'actor_name' => $who['name']]);
            if ($approvedAt) {
                $reg->event('stock.request', $base + ['subtype' => 'approved', 'at' => $approvedAt, 'actor_user_id' => $approverId, 'actor_name' => $approver]);
            }
            if ($rejectedAt) {
                $reg->event('stock.request', $base + ['subtype' => 'rejected', 'at' => $rejectedAt, 'actor_user_id' => $approverId, 'actor_name' => $approver]);
            }
        }
    }

    /** @return array<string, mixed> an employee with a login who could have asked at $at */
    private function requester(CarbonImmutable $at): array
    {
        for ($try = 0; $try < 10; $try++) {
            $e = $this->ctx->rng->pick($this->users);
            if ($e['joined_at'] <= $at && ($e['last_day'] === null || $e['last_day'] > $at)) {
                return $e;
            }
        }

        return $this->users[0];
    }

    /** @param list<array<string, mixed>> $events */
    private function makeInflow(array &$events): void
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $movements = $this->ctx->targets->of('stock_movements');
        $count = count($this->items);
        $receipts = max(2, (int) round(self::RECEIPT_SHARE * $movements / $count));
        $transfers = (int) round(self::TRANSFER_SHARE * $movements / $count);
        $returns = (int) round(self::RETURN_SHARE * $movements / $count);

        foreach ($this->items as $id => &$item) {
            $nr = $item['tracked'] ? min($receipts, 10) : $receipts;
            $typical = max($item['tracked'] ? 2 : 1, (int) ceil(1.05 * $item['demand'] / $nr));
            $typical = $item['tracked'] ? min($typical, 8) : $typical;
            $item['typical'] = $typical;
            $item['min'] = max(1, (int) round($typical * 0.3));
            $item['max'] = max($item['min'] + 1, (int) round($typical * 2.5));

            $first = $clock->start()->addDays($rng->int(0, 20))->setTime(10, 0);
            $this->addEvent($events, $first, 'receive', ['item' => $id, 'wh' => $item['main'][0], 'qty' => (int) round($typical * 1.5), 'tracked' => $item['tracked']]);
            for ($i = 1; $i < $nr; $i++) {
                $this->addEvent($events, $clock->moment($rng), 'receive', ['item' => $id, 'wh' => $rng->pick($item['main']), 'qty' => max(1, (int) round($typical * (0.7 + 0.6 * $rng->float())))]);
            }
            for ($i = 0; $i < $transfers; $i++) {
                $this->addEvent($events, $clock->moment($rng), 'transfer', ['item' => $id]);
            }
            for ($i = 0; $i < $returns; $i++) {
                $this->addEvent($events, $clock->moment($rng), 'return', ['item' => $id]);
            }
        }
        unset($item);
    }

    /** @param list<array<string, mixed>> $events */
    private function makeCounts(array &$events): void
    {
        $n = $this->ctx->targets->of('stock_counts');
        $clock = $this->ctx->clock;
        for ($k = 0; $k < $n; $k++) {
            $draft = $k === $n - 1;
            $at = $draft
                ? $clock->end()->subDay()->setTime(17, 0)
                : min($clock->start()->addMonths(intdiv($k * 36, $n))->endOfMonth()->setTime(17, 0), $clock->end()->subDays(2));
            $this->addEvent($events, $at, 'count', ['k' => $k, 'draft' => $draft]);
        }
    }

    /** @param array<string, mixed> $row */
    private function movement(array $row): int
    {
        $reg = $this->ctx->reg;
        $id = $reg->nextId('stock_movements');
        $at = $row['moved_at'];
        $this->ctx->sql->insert('stock_movements', $this->fill('stock_movements', $row + [
            'id' => $id, 'created_at' => $at, 'updated_at' => $at,
        ]));
        $item = $this->items[$row['stock_item_id']];
        $reg->event('stock.movement', [
            'movement_id' => $id, 'type' => $row['type'], 'sku' => $item['sku'], 'qty' => $row['qty'], 'at' => $at,
            'user_id' => $row['user_id'], 'by_name' => $row['recorded_by'],
        ]);
        $this->lastMove[$row['stock_item_id']] = $at;

        return $id;
    }

    private function total(int $item): int
    {
        return array_sum($this->bal[$item]);
    }

    private function adjustBalance(int $item, int $wh, int $delta): void
    {
        $this->bal[$item][$wh] = ($this->bal[$item][$wh] ?? 0) + $delta;
    }

    private function addLot(int $item, int $qty, float $cost, int $movementId, CarbonImmutable $at): void
    {
        $this->lots[$item][] = [
            'id' => $this->ctx->reg->nextId('stock_lots'), 'movement' => $movementId, 'cost' => $cost,
            'received' => $qty, 'remaining' => $qty, 'at' => $at,
        ];
    }

    private function consume(int $item, int $qty): void
    {
        foreach ($this->lots[$item] as &$lot) {
            if ($qty === 0) {
                break;
            }
            $take = min($qty, $lot['remaining']);
            $lot['remaining'] -= $take;
            $qty -= $take;
        }
        unset($lot);
    }

    private function serialEvent(int $serialId, int $item, string $event, int $movementId, ?string $reference, string $warehouse, ?string $from, ?string $to, array $by, CarbonImmutable $at): void
    {
        $this->ctx->sql->insert('stock_item_serial_events', $this->fill('stock_item_serial_events', [
            'id' => $this->ctx->reg->nextId('stock_item_serial_events'), 'stock_item_serial_id' => $serialId, 'stock_item_id' => $item,
            'event' => $event, 'stock_movement_id' => $movementId, 'reference' => $reference, 'warehouse' => $warehouse,
            'from_label' => $from, 'to_label' => $to, 'user_id' => $by[0], 'recorded_by' => $by[1], 'occurred_at' => $at,
            'created_at' => $at, 'updated_at' => $at,
        ]));
    }

    private function receive(int $item, int $wh, int $qty, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $it = $this->items[$item];
        $by = $this->itStaff();
        $reference = $reg->yearNo('PO', $at->year, 4);
        $cost = round($it['cost'] * (0.9 + 0.2 * $rng->float()), 2);

        $id = $this->movement([
            'doc_no' => $reg->docNo('RCV', $at->year), 'type' => 'receive', 'stock_item_id' => $item, 'qty' => $qty, 'unit_cost' => $cost,
            'from_label' => null, 'to_label' => $this->warehouses[$wh], 'reference' => $reference, 'recorded_by' => $by[1], 'user_id' => $by[0],
            'notes' => null, 'moved_at' => $at,
        ]);
        $this->addLot($item, $qty, $cost, $id, $at);
        $this->adjustBalance($item, $wh, $qty);

        if ($it['tracked']) {
            for ($u = 0; $u < $qty; $u++) {
                $sid = $reg->nextId('stock_item_serials');
                $this->serials[$item][] = ['id' => $sid, 'no' => $it['sku'].'-S'.(count($this->serials[$item]) + 1), 'status' => 'in_stock', 'wh' => $wh, 'movement' => $id, 'ref' => $reference, 'at' => $at];
                $this->serialEvent($sid, $item, 'received', $id, $reference, $this->warehouses[$wh], null, $this->warehouses[$wh], $by, $at);
            }
        }
        $this->refreshAlert($item, $at);
    }

    private function transfer(int $item, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $balances = $this->bal[$item];
        arsort($balances);
        $from = array_key_first($balances);
        if ($from === null || $balances[$from] < 2) {
            return;
        }
        $targets = array_values(array_diff(range(0, count($this->warehouses) - 1), [$from]));
        $to = $rng->pick($targets);
        $qty = $rng->int(1, max(1, intdiv($balances[$from], 2)));
        $by = $this->itStaff();

        $id = $this->movement([
            'doc_no' => $reg->docNo('TRF', $at->year), 'type' => 'transfer', 'stock_item_id' => $item, 'qty' => $qty, 'unit_cost' => null,
            'from_label' => $this->warehouses[$from], 'to_label' => $this->warehouses[$to], 'reference' => null, 'recorded_by' => $by[1], 'user_id' => $by[0],
            'notes' => null, 'moved_at' => $at,
        ]);
        $this->adjustBalance($item, $from, -$qty);
        $this->adjustBalance($item, $to, $qty);

        if ($this->items[$item]['tracked']) {
            $left = $qty;
            foreach ($this->serials[$item] as &$serial) {
                if ($left > 0 && $serial['status'] === 'in_stock' && $serial['wh'] === $from) {
                    $serial['wh'] = $to;
                    $left--;
                    $this->serialEvent($serial['id'], $item, 'transferred', $id, null, $this->warehouses[$to], $this->warehouses[$from], $this->warehouses[$to], $by, $at);
                }
            }
            unset($serial);
        }
    }

    private function returnItem(int $item, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $available = $this->issuedTotal[$item] - $this->returnedTotal[$item];
        if ($available < 1) {
            return;
        }
        $qty = min($rng->int(1, 3), $available);
        $wh = $rng->pick($this->items[$item]['main']);
        $by = $this->itStaff();

        $id = $this->movement([
            'doc_no' => $reg->docNo('RET', $at->year), 'type' => 'return', 'stock_item_id' => $item, 'qty' => $qty, 'unit_cost' => null,
            'from_label' => null, 'to_label' => $this->warehouses[$wh], 'reference' => null, 'recorded_by' => $by[1], 'user_id' => $by[0],
            'notes' => 'Returned unused', 'moved_at' => $at,
        ]);
        $this->addLot($item, $qty, (float) $this->items[$item]['cost'], $id, $at);
        $this->adjustBalance($item, $wh, $qty);
        $this->returnedTotal[$item] += $qty;

        if ($this->items[$item]['tracked']) {
            $left = $qty;
            foreach ($this->serials[$item] as &$serial) {
                if ($left > 0 && $serial['status'] === 'issued') {
                    $serial['status'] = 'in_stock';
                    $serial['wh'] = $wh;
                    $left--;
                    $this->serialEvent($serial['id'], $item, 'returned', $id, null, $this->warehouses[$wh], null, $this->warehouses[$wh], $by, $at);
                }
            }
            unset($serial);
        }
        $this->refreshAlert($item, $at);
    }

    /** @param array<string, mixed> $request */
    private function fulfil(array $request, CarbonImmutable $at): void
    {
        $reg = $this->ctx->reg;
        $item = $request['item'];
        $it = $this->items[$item];
        $need = $request['qty'];
        [$byId, $byName] = $request['fulfiller'];

        // Restock first when the shelves cannot cover the request
        if ($this->total($item) < $need) {
            $this->receive($item, $it['main'][0], $need * 2 + $it['typical'], $at->subMinute());
        }

        $sources = $this->bal[$item];
        arsort($sources);
        foreach ($sources as $wh => $available) {
            if ($need === 0) {
                break;
            }
            $take = min($need, $available);
            if ($take < 1) {
                continue;
            }
            $id = $this->movement([
                'doc_no' => $reg->docNo('ISS', $at->year), 'type' => 'issue', 'stock_item_id' => $item, 'qty' => $take, 'unit_cost' => null,
                'from_label' => $this->warehouses[$wh], 'to_label' => $request['requester']['name'], 'reference' => $request['reference'],
                'recorded_by' => $byName, 'user_id' => $byId, 'notes' => null, 'moved_at' => $at,
            ]);
            $this->adjustBalance($item, $wh, -$take);
            $this->consume($item, $take);
            $this->issuedTotal[$item] += $take;
            $need -= $take;

            if ($it['tracked']) {
                $left = $take;
                foreach ($this->serials[$item] as &$serial) {
                    if ($left > 0 && $serial['status'] === 'in_stock' && $serial['wh'] === $wh) {
                        $serial['status'] = 'issued';
                        $left--;
                        $this->serialEvent($serial['id'], $item, 'issued', $id, $request['reference'], $this->warehouses[$wh], $this->warehouses[$wh], $request['requester']['name'], [$byId, $byName], $at);
                    }
                }
                unset($serial);
            }
        }

        $reg->event('stock.request', [
            'request_id' => $request['id'], 'reference' => $request['reference'], 'sku' => $it['sku'], 'name' => $it['name'], 'qty' => $request['qty'],
            'requester_user_id' => $request['requester']['user_id'], 'approver_user_ids' => [], 'subtype' => 'fulfilled', 'at' => $at,
            'actor_user_id' => $byId, 'actor_name' => $byName,
        ]);
        $this->refreshAlert($item, $at);
    }

    private function stateOf(int $item): string
    {
        $total = $this->total($item);

        return match (true) {
            $total === 0 => 'out',
            $total < $this->items[$item]['min'] => 'low',
            $total > $this->items[$item]['max'] => 'over',
            default => 'ok',
        };
    }

    // A bell only when stock newly drops to low or out
    private function refreshAlert(int $item, CarbonImmutable $at): void
    {
        $state = $this->stateOf($item);
        if ($state !== $this->alertState[$item] && in_array($state, ['low', 'out'], true)) {
            $it = $this->items[$item];
            $this->ctx->reg->event('stock.alert', ['stock_item_id' => $item, 'sku' => $it['sku'], 'name' => $it['name'], 'qty' => $this->total($item), 'subtype' => $state, 'at' => $at]);
        }
        $this->alertState[$item] = $state;
    }

    private function count(CarbonImmutable $at, bool $draft): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $wh = $rng->int(0, count($this->warehouses) - 1);
        $by = $this->itStaff();
        $id = $reg->nextId('stock_counts');
        $reference = $reg->yearNo('SC', $at->year, 3);
        $opened = $at->subDays(1)->setTime(9, 0);

        $this->ctx->sql->insert('stock_counts', $this->fill('stock_counts', [
            'id' => $id, 'reference' => $reference, 'warehouse' => $this->warehouses[$wh], 'category' => null, 'status' => $draft ? 'draft' : 'committed',
            'adjust_mode' => 'auto', 'note' => null, 'counted_by' => $by[0], 'committed_at' => $draft ? null : $at, 'created_at' => $opened, 'updated_at' => $at,
        ]));
        $reg->event('stock.count_opened', ['stock_count_id' => $id, 'reference' => $reference, 'at' => $opened, 'user_id' => $by[0], 'by_name' => $by[1], 'draft' => $draft]);
        if (! $draft) {
            $reg->event('stock.count_committed', ['stock_count_id' => $id, 'reference' => $reference, 'at' => $at, 'user_id' => $by[0], 'by_name' => $by[1]]);
        }

        $lines = (int) round(count($this->items) * 0.46);
        foreach (array_slice($rng->shuffle(array_keys($this->items)), 0, $lines) as $item) {
            $system = $this->bal[$item][$wh] ?? 0;
            $counted = $system;
            if (! $draft && ! $this->items[$item]['tracked'] && $rng->chance(0.10)) {
                $counted = max(0, $system + $rng->pick([-3, -2, -1, 1, 2, 3]));
            }
            $this->ctx->sql->insert('stock_count_lines', $this->fill('stock_count_lines', [
                'id' => $reg->nextId('stock_count_lines'), 'stock_count_id' => $id, 'stock_item_id' => $item,
                'system_qty' => $system, 'counted_qty' => $counted, 'created_at' => $opened, 'updated_at' => $at,
            ]));
            if ($counted !== $system) {
                $this->adjust($item, $wh, $counted - $system, $reference, $by, $at);
            }
        }
    }

    /** @param array{0: int, 1: string} $by */
    private function adjust(int $item, int $wh, int $diff, string $reference, array $by, CarbonImmutable $at): void
    {
        $up = $diff > 0;
        $qty = abs($diff);
        $id = $this->movement([
            'doc_no' => null, 'type' => $up ? 'adjust_up' : 'adjust_down', 'stock_item_id' => $item, 'qty' => $qty, 'unit_cost' => null,
            'from_label' => $up ? null : $this->warehouses[$wh], 'to_label' => $up ? $this->warehouses[$wh] : null, 'reference' => $reference,
            'recorded_by' => $by[1], 'user_id' => $by[0], 'notes' => 'Stock count adjustment', 'moved_at' => $at,
        ]);
        $this->adjustBalance($item, $wh, $diff);
        $up ? $this->addLot($item, $qty, (float) $this->items[$item]['cost'], $id, $at) : $this->consume($item, $qty);
        $this->refreshAlert($item, $at);
    }

    private function finish(): void
    {
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $end = $this->ctx->clock->end();

        foreach ($this->items as $id => $it) {
            $state = $this->stateOf($id);
            $sql->insert('stock_items', $this->fill('stock_items', [
                'id' => $id, 'sku' => $it['sku'], 'name' => $it['name'], 'serial' => null, 'track_serial' => $it['tracked'],
                'category_id' => $it['category_id'], 'brand_id' => $it['brand_id'], 'model_id' => null, 'unit_id' => $it['unit_id'],
                'cost' => $it['cost'], 'current_stock' => $this->total($id), 'min_stock' => $it['min'], 'max_stock' => $it['max'],
                'warranty_type_id' => $it['warranty_type_id'], 'last_move_at' => isset($this->lastMove[$id]) ? $this->lastMove[$id]->toDateString() : null,
                'created_at' => $it['created_at'], 'updated_at' => $this->lastMove[$id] ?? $it['created_at'], 'created_by' => $it['creator'], 'updated_by' => $it['creator'],
            ]));
            foreach ($this->bal[$id] as $wh => $qty) {
                $sql->insert('stock_balances', $this->fill('stock_balances', [
                    'id' => $reg->nextId('stock_balances'), 'stock_item_id' => $id, 'warehouse_id' => $wh + 1, 'qty' => $qty,
                    'created_at' => $it['created_at'], 'updated_at' => $this->lastMove[$id] ?? $it['created_at'],
                ]));
            }
            foreach ($this->lots[$id] as $lot) {
                $sql->insert('stock_lots', $this->fill('stock_lots', [
                    'id' => $lot['id'], 'stock_item_id' => $id, 'stock_movement_id' => $lot['movement'], 'unit_cost' => $lot['cost'],
                    'qty_received' => $lot['received'], 'qty_remaining' => $lot['remaining'], 'received_at' => $lot['at'],
                    'created_at' => $lot['at'], 'updated_at' => $lot['at'],
                ]));
            }
            foreach ($this->serials[$id] as $serial) {
                $sql->insert('stock_item_serials', $this->fill('stock_item_serials', [
                    'id' => $serial['id'], 'stock_item_id' => $id, 'stock_movement_id' => $serial['movement'], 'serial' => $serial['no'],
                    'status' => $serial['status'], 'warehouse_id' => $serial['wh'] + 1, 'reference' => $serial['ref'], 'received_at' => $serial['at'],
                    'created_at' => $serial['at'], 'updated_at' => $serial['at'],
                ]));
            }
            if ($state !== 'ok') {
                $sql->insert('stock_alert_logs', $this->fill('stock_alert_logs', [
                    'id' => $reg->nextId('stock_alert_logs'), 'stock_item_id' => $id, 'alert_type' => $state, 'last_alerted_on' => $end->toDateString(),
                    'created_at' => $end, 'updated_at' => $end,
                ]));
                if ($state === 'over') {
                    $reg->event('stock.alert', ['stock_item_id' => $id, 'sku' => $it['sku'], 'name' => $it['name'], 'qty' => $this->total($id), 'subtype' => 'over', 'at' => $end]);
                }
            }
        }
        $reg->remember('stock_items', array_map(fn (array $i): array => ['id' => $i['id'], 'sku' => $i['sku'], 'name' => $i['name']], array_values($this->items)));
    }
}
