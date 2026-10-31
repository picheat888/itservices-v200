<?php

namespace Database\Seeders\Demo;

use App\Http\Controllers\Api\Stock\StockRequestController;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockCountService;
use App\Services\Stock\StockLotService;
use App\Services\Stock\StockNotificationService;
use App\Services\Stock\StockReceiveService;
use App\Services\Stock\StockReturnService;
use App\Services\Stock\StockTransferService;
use Illuminate\Http\Request;
use RuntimeException;

/** Demo spare-parts store in three warehouses: lots, transfers, requisitions in every status, a return and two counts, all through the real services. */
final class DemoStock implements DemoStep
{
    /** key => [name, category, unit, min, max, [[days ago, qty, unit cost, warehouse #], ...]] */
    private const ITEMS = [
        'toner-hp' => ['HP 58A Toner', 'Toner / Cartridge', 'cartridge', 4, 20, [[150, 10, 2350, 0], [60, 8, 2490, 0]]],
        'toner-ricoh' => ['Ricoh IM C3000 Toner Black', 'Toner / Cartridge', 'cartridge', 3, 12, [[120, 6, 1850, 0], [40, 6, 1920, 1]]],
        'toner-ricoh-c' => ['Ricoh IM C3000 Toner Cyan', 'Toner / Cartridge', 'cartridge', 2, 8, [[120, 3, 2100, 0]]],
        'mouse' => ['Wireless Mouse Logitech M185', 'Accessories', 'pc', 10, 40, [[170, 20, 390, 0], [168, 10, 390, 0], [45, 20, 350, 1]]],
        'keyboard' => ['USB Keyboard', 'Accessories', 'pc', 8, 30, [[170, 20, 290, 0]]],
        'headset' => ['USB Headset', 'Accessories', 'pc', 5, 20, [[100, 12, 850, 0]]],
        'usb-hub' => ['USB-C Hub 7-in-1', 'Accessories', 'pc', 3, 10, [[90, 6, 1290, 0]]],
        'webcam' => ['Webcam 1080p', 'Accessories', 'pc', 2, 10, [[80, 4, 1450, 1]]],
        'ssd' => ['SSD 512GB NVMe', 'Computer parts', 'pc', 5, 20, [[160, 10, 1690, 0], [30, 10, 1490, 0]]],
        'ram' => ['RAM DDR4 16GB', 'Computer parts', 'pc', 5, 20, [[160, 12, 1590, 0]]],
        'psu' => ['Desktop PSU 500W', 'Computer parts', 'pc', 2, 8, [[140, 4, 1350, 1]]],
        'battery' => ['Laptop Battery Latitude', 'Computer parts', 'pc', 3, 10, [[110, 5, 2200, 0]]],
        'lan-cable' => ['LAN Cable Cat6 (box 305m)', 'Cable', 'box', 2, 6, [[150, 4, 3200, 2]]],
        'patch' => ['Patch Cord Cat6 2m', 'Cable', 'pc', 20, 150, [[150, 60, 65, 2], [20, 60, 60, 2]]],
        'hdmi' => ['HDMI Cable 2m', 'Cable', 'pc', 10, 30, [[100, 25, 150, 0]]],
        'power' => ['Power Cord IEC', 'Cable', 'pc', 10, 30, [[100, 20, 90, 0]]],
        'label' => ['Label Tape 12mm', 'Consumables', 'roll', 5, 20, [[90, 15, 420, 0]]],
        'cleaner' => ['Screen Cleaner Kit', 'Consumables', 'set', 5, 20, [[90, 10, 120, 0]]],
        'battery-aa' => ['Battery AA (pack 4)', 'Consumables', 'pack', 10, 40, [[80, 30, 95, 0]]],
        'thermal' => ['Thermal Paste', 'Consumables', 'pc', 2, 8, [[70, 5, 250, 1]]],
        'adapter' => ['USB-C Power Adapter 65W', 'Accessories', 'pc', 3, 10, [[60, 6, 990, 0]]],
        'dock' => ['Dell WD19 Dock', 'Accessories', 'pc', 2, 6, [[50, 3, 6900, 0]]],
        'rj45' => ['RJ45 Connector (box 100)', 'Cable', 'box', 2, 8, [[40, 20, 450, 2]]],
        'monitor-arm' => ['Monitor Arm Dual', 'Accessories', 'pc', 2, 6, [[35, 2, 1890, 0]]],
        'toner-brother' => ['Brother TN-2460 Toner', 'Toner / Cartridge', 'cartridge', 2, 8, [[30, 2, 1650, 0]]],
    ];

    /** [item, from warehouse #, to warehouse #, qty, days ago] */
    private const TRANSFERS = [['mouse', 0, 1, 8, 50], ['patch', 2, 0, 20, 18], ['ssd', 0, 1, 3, 12]];

    /** [item, qty, days ago, outcome, warehouse # it is issued from] */
    private const REQUISITIONS = [
        ['toner-hp', 3, 40, 'fulfilled', 0], ['mouse', 5, 35, 'fulfilled', 0], ['ssd', 2, 28, 'fulfilled', 0],
        ['ram', 2, 20, 'fulfilled', 0], ['hdmi', 4, 14, 'fulfilled', 0], ['label', 3, 10, 'fulfilled', 0],
        ['toner-brother', 2, 8, 'fulfilled', 0],
        ['monitor-arm', 1, 6, 'fulfilled', 0],
        ['toner-ricoh', 2, 4, 'approved', 0], ['headset', 2, 3, 'approved', 0],
        ['dock', 1, 2, 'pending', 0], ['webcam', 1, 1, 'pending', 1], ['usb-hub', 2, 1, 'pending', 0],
        ['psu', 3, 9, 'rejected', 1], ['battery', 4, 5, 'rejected', 0],
    ];

    public function __construct(
        private readonly StockReceiveService $receives,
        private readonly StockRequestController $requests,
        private readonly StockCountService $counts,
        private readonly StockNotificationService $alerts,
        private readonly StockReturnService $returns,
        private readonly StockLotService $lots,
        private readonly StockTransferService $transfers,
    ) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $lead = $ctx->user('it.lead');
        $tech = $ctx->user('it.tech');
        $this->assertCan($lead, ['stock.receive', 'stock.transfer', 'stock.return', 'stock.approve', 'stock.fulfill']);
        $this->assertCan($tech, ['stock.request']);
        $ctx->actAs($lead);

        $warehouses = Warehouse::orderBy('id')->pluck('name')->all();

        $this->receive($ctx, $clock, $lead, $warehouses);
        $this->moveAround($ctx, $clock, $lead, $warehouses);
        $this->requisitions($ctx, $clock, $lead, $tech, $warehouses);
        $this->returnFromTheFloor($ctx, $clock, $lead);
        $this->counts($ctx, $clock, $lead, $warehouses);

        // Bells for whatever ended out / low / over.
        $clock->at($clock->base()->subMinutes(10));
        foreach ($ctx->items as $item) {
            $this->alerts->alert($item->fresh());
        }
    }

    /** @param list<string> $warehouses */
    private function receive(DemoContext $ctx, DemoClock $clock, User $lead, array $warehouses): void
    {
        $category = Category::pluck('id', 'name');
        $unit = Unit::pluck('id', 'name');
        $warranty = WarrantyType::where('name', '1-year')->value('id');

        foreach (self::ITEMS as $key => [$name, $categoryName, $unitName, $min, $max, $lots]) {
            $clock->at($clock->daysAgo($lots[0][0] + 1));
            $ctx->items[$key] = StockItem::create([
                'sku' => StockItem::nextSku(),
                'name' => $name,
                'category_id' => $category[$categoryName],
                'unit_id' => $unit[$unitName] ?? null,
                'warranty_type_id' => $warranty,
                'min_stock' => $min,
                'max_stock' => $max,
            ]);

            foreach ($lots as [$daysAgo, $qty, $cost, $w]) {
                $moment = $clock->daysAgo($daysAgo, 10);
                $clock->at($moment);
                $this->receives->record([
                    'stock_item_id' => $ctx->items[$key]->id,
                    'type' => 'receive',
                    'qty' => $qty,
                    'unit_cost' => $cost,
                    'to_label' => $warehouses[$w],
                    'reference' => 'PO-'.$moment->format('ymd').'-'.$ctx->items[$key]->id,
                    'moved_at' => $moment->toDateTimeString(),
                    'notes' => 'Demo receipt',
                ], $lead->name, $lead->id);
            }
        }
    }

    /** Transfers between warehouses. @param list<string> $warehouses */
    private function moveAround(DemoContext $ctx, DemoClock $clock, User $lead, array $warehouses): void
    {
        foreach (self::TRANSFERS as [$key, $from, $to, $qty, $daysAgo]) {
            $moment = $clock->daysAgo($daysAgo, 11);
            $clock->at($moment);
            $item = $ctx->items[$key];
            $this->transfers->record($item, $warehouses[$from], $warehouses[$to], $this->lotsCovering($item, $warehouses[$from], $qty), [
                'moved_at' => $moment->toDateTimeString(),
            ], $lead);
        }
    }

    /**
     * The oldest lots of the item in a warehouse, enough of them to hold at least qty (transfers move whole lots).
     *
     * @return list<int>
     */
    private function lotsCovering(StockItem $item, string $warehouse, int $qty): array
    {
        $ids = [];
        $held = 0;
        $lots = StockLot::where('stock_item_id', $item->id)
            ->where('warehouse_id', Warehouse::resolveId($warehouse))
            ->where('qty_remaining', '>', 0)
            ->orderBy('received_at')->orderBy('id')
            ->get();

        foreach ($lots as $lot) {
            if ($held >= $qty) {
                break;
            }
            $ids[] = $lot->id;
            $held += $lot->qty_remaining;
        }

        return $ids;
    }

    /** Two mice from a fulfilled requisition come back into the lot they were drawn from. */
    private function returnFromTheFloor(DemoContext $ctx, DemoClock $clock, User $lead): void
    {
        $requisition = StockRequest::where('stock_item_id', $ctx->items['mouse']->id)->where('status', 'fulfilled')->firstOrFail();
        $lotId = array_key_first($this->lots->issuedLeft($requisition));

        $moment = $clock->daysAgo(15, 15);
        $clock->at($moment);
        $this->returns->record($ctx->items['mouse'], $requisition, [
            'lots' => [['lot_id' => $lotId, 'qty' => 2]],
            'moved_at' => $moment->toDateTimeString(),
            'notes' => 'Returned after the training room closed',
        ], $lead);
    }

    /** @param list<string> $warehouses */
    private function requisitions(DemoContext $ctx, DemoClock $clock, User $lead, User $tech, array $warehouses): void
    {
        foreach (self::REQUISITIONS as [$key, $qty, $daysAgo, $outcome, $w]) {
            $filed = $clock->daysAgo($daysAgo, 9);
            $clock->at($filed);
            $ctx->actAs($tech);
            $this->requests->store($this->request($tech, [
                'stock_item_id' => $ctx->items[$key]->id,
                'qty' => $qty,
                'reason' => 'Replacement for a user workstation',
            ]));
            $requisition = StockRequest::latest('id')->firstOrFail();

            if ($outcome === 'pending') {
                continue;
            }

            $decided = $clock->after($filed, $daysAgo, 13);
            $clock->at($decided);
            $ctx->actAs($lead);
            if ($outcome === 'rejected') {
                $this->requests->reject($this->request($lead, []), $requisition);

                continue;
            }

            $this->requests->approve($this->request($lead, []), $requisition->fresh());
            if ($outcome === 'fulfilled') {
                $clock->at($clock->after($decided, max(0, $daysAgo - 1), 10));
                $this->requests->fulfill($this->request($lead, [
                    'allocations' => [['warehouse' => $warehouses[$w], 'qty' => $qty]],
                ]), $requisition->fresh());
            }
        }
    }

    /** One count committed with a variance, one still a draft. @param list<string> $warehouses */
    private function counts(DemoContext $ctx, DemoClock $clock, User $lead, array $warehouses): void
    {
        $ctx->actAs($lead);

        // A warehouse holding nothing gets no sheet; a sheet with no lines is not a count
        $clock->at($clock->daysAgo(12, 16));
        $itemIds = $this->itemIdsIn($warehouses[2]);
        if ($itemIds !== []) {
            $count = $this->counts->open($this->warehouse($warehouses[2]), $itemIds, $lead);
            $counted = $count->lines->values()->mapWithKeys(fn ($line, int $i) => [
                $line->id => $i === 0 && $line->system_qty > 0
                    ? ['counted_qty' => $line->system_qty - 1, 'reason' => 'lost']
                    : ['counted_qty' => $line->system_qty],
            ])->all();
            $this->counts->commit($this->counts->saveLines($count, $counted), $lead);
        }

        $clock->at($clock->daysAgo(1, 16));
        $itemIds = $this->itemIdsIn($warehouses[0]);
        if ($itemIds !== []) {
            $this->counts->open($this->warehouse($warehouses[0]), $itemIds, $lead);
        }
    }

    private function warehouse(string $name): Warehouse
    {
        return Warehouse::query()->where('name', $name)->firstOrFail();
    }

    /** @return list<int> items holding stock in the named warehouse */
    private function itemIdsIn(string $name): array
    {
        return StockItem::query()
            ->whereHas('balances', fn ($q) => $q->where('qty', '>', 0)->whereHas('warehouse', fn ($w) => $w->where('name', $name)))
            ->pluck('id')->all();
    }

    /** A controller-shaped request acting as $user. */
    private function request(User $user, array $payload): Request
    {
        $request = Request::create('/demo', 'POST', $payload);
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    /** @param list<string> $permissions */
    private function assertCan(User $user, array $permissions): void
    {
        foreach ($permissions as $permission) {
            if (! $user->hasPermission($permission)) {
                throw new RuntimeException("Demo account {$user->username} lacks {$permission} - check the role's default grants in App\\Support\\Permissions.");
            }
        }
    }
}
