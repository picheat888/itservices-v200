<?php

namespace Database\Seeders\Demo;

use App\Enums\Asset\AssetStatus;
use App\Models\Settings\Category;
use App\Models\Stock\Warehouse;
use App\Services\Asset\AssetService;

/**
 * ~80 assets across every status and type, with a real trail: purchase (asset_code
 * year follows the purchase date), handover → accept, shared use, return request →
 * received back, relocation, and write-off (only from the pool, as the app requires).
 * staff.demo holds two deployed items and has one handover waiting to be accepted.
 *
 * Every handover is placed after the asset's purchase date, so the trail never reads
 * backwards in time.
 */
final class DemoAssets implements DemoStep
{
    private const PERFORMED_BY = 'IT Team';

    /** [model key, category name, value, vendor key] — cycled to build the purchased fleet. */
    private const FLEET = [
        ['latitude', 'Laptop', 32000, 'dell'],
        ['thinkpad', 'Laptop', 35000, 'lenovo'],
        ['optiplex', 'Desktop', 24000, 'dell'],
        ['prodesk', 'Desktop', 21000, 'hp'],
        ['monitor', 'Monitor', 4500, 'dell'],
        ['laserjet', 'Printer', 9500, 'hp'],
        ['catalyst', 'Switch / Router', 48000, 'dell'],
        ['unifi', 'Switch / Router', 7800, 'dell'],
        ['hikvision', 'CCTV', 6200, 'secure'],
        ['yealink', 'Phone', 5200, 'ais'],
        ['ups', 'UPS', 18500, 'secure'],
        ['iphone', 'Phone', 29900, 'ais'],
        ['poweredge', 'Server', 185000, 'dell'],
    ];

    /** Employees who hold one purchased asset each (a-001…a-024); the first six also hold a rented laptop. */
    private const HOLDERS = [
        'sup.pd', 'mgr.pd', 'vp', 'mgr.qc', 'mgr.se', 'sup.it', 'it.tech', 'hr.staff', 'acc.2', 'sale.2', 'lg.leader', 'mn.2',
        'pu.2', 'ga.2', 'qc.2', 'se.2', 'pd.4', 'it.2', 'it.3', 'hr.2', 'acc.3', 'sale.3', 'pd.leader', 'lg.3',
    ];

    /** @var array<string, int> asset key => days ago it was bought */
    private array $boughtDaysAgo = [];

    public function __construct(private readonly AssetService $assets) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $category = Category::pluck('id', 'name');
        $warehouses = Warehouse::orderBy('id')->get(['id', 'name']);
        $lead = $ctx->user('it.lead');
        $ctx->actAs($lead);

        // Purchased fleet a-001…a-074, bought over the past ~5 years (3-year warranty).
        for ($i = 1; $i <= 74; $i++) {
            [$modelKey, $categoryName, $value, $vendorKey] = self::FLEET[$i % count(self::FLEET)];
            $key = sprintf('a-%03d', $i);
            $this->boughtDaysAgo[$key] = 30 + ($i * 23) % 1700;
            $bought = $clock->daysAgo($this->boughtDaysAgo[$key]);
            $clock->at($bought);
            $ctx->assets[$key] = $this->assets->create([
                'category_id' => $category[$categoryName],
                'brand_id' => $ctx->models[$modelKey]->brand_id,
                'model_id' => $ctx->models[$modelKey]->id,
                'serial' => sprintf('DEMO%s%05d', strtoupper(substr($modelKey, 0, 3)), $i),
                'source' => 'purchased',
                'value' => $value,
                'vendor_id' => $ctx->vendors[$vendorKey]->id,
                'purchase_date' => $bought->toDateString(),
                'warranty_end' => $bought->copy()->addYears(3)->toDateString(),
                'warehouse_id' => $warehouses[$i % $warehouses->count()]->id,
            ]);
            $this->registered($ctx, $key);
        }

        // Rented laptops on the hardware rental contract.
        for ($i = 1; $i <= 6; $i++) {
            $key = "rent-laptop-{$i}";
            $this->boughtDaysAgo[$key] = 240;
            $clock->at($clock->daysAgo(240));
            $ctx->assets[$key] = $this->assets->create([
                'category_id' => $category['Laptop'],
                'brand_id' => $ctx->models['thinkpad']->brand_id,
                'model_id' => $ctx->models['thinkpad']->id,
                'serial' => sprintf('RENT-TP-%03d', $i),
                'source' => 'rented',
                'contract_id' => $ctx->contracts['laptop-rental']->id,
                'warehouse_id' => $warehouses->first()->id,
            ]);
            $this->registered($ctx, $key);
        }

        // Deployed to people: handover → accept the next day.
        foreach (self::HOLDERS as $h => $employeeKey) {
            $this->handOver($ctx, $clock, sprintf('a-%03d', $h + 1), $employeeKey, 300 - $h * 9, accept: true);
            if ($h < 6) {
                $this->handOver($ctx, $clock, 'rent-laptop-'.($h + 1), $employeeKey, 200 - $h * 9, accept: true);
            }
        }

        // staff.demo: laptop + monitor deployed, one printer handed over and not yet accepted.
        $this->handOver($ctx, $clock, 'a-030', 'staff', 150, accept: true);
        $this->handOver($ctx, $clock, 'a-031', 'staff', 150, accept: true);
        $this->handOver($ctx, $clock, 'a-032', 'staff', 2, accept: false);
        $ctx->assets['staff-laptop'] = $ctx->assets['a-030'];
        $ctx->assets['staff-monitor'] = $ctx->assets['a-031'];
        $ctx->assets['staff-pending'] = $ctx->assets['a-032'];

        // Two more waiting for acceptance by others.
        $this->handOver($ctx, $clock, 'a-033', 'pd.3', 3, accept: false);
        $this->handOver($ctx, $clock, 'a-034', 'newhire', 1, accept: false);

        // Shared / common use.
        foreach (['a-035' => 'plant1', 'a-036' => 'hq2', 'a-037' => 'qc-lab', 'a-038' => 'plant2'] as $assetKey => $locationKey) {
            $clock->at($clock->daysAgo(200));
            $ctx->assets[$assetKey] = $this->assets->transfer($ctx->assets[$assetKey]->fresh(), [
                'mode' => 'shared',
                'owner_label' => 'Shared - '.$ctx->locations[$locationKey]->name,
                'location_id' => $ctx->locations[$locationKey]->id,
                'reason' => 'Shared equipment',
            ], self::PERFORMED_BY);
            $ctx->audit('Transferred asset', "{$ctx->assets[$assetKey]->asset_code} → {$ctx->assets[$assetKey]->ownerCode()}");
        }

        // A shared item relocated with its line.
        $clock->at($clock->daysAgo(60));
        $ctx->assets['a-035'] = $this->assets->relocate($ctx->assets['a-035']->fresh(), $ctx->locations['plant4'], self::PERFORMED_BY, 'Line moved to plant 4');
        $ctx->audit('Updated asset location', "{$ctx->assets['a-035']->asset_code} → {$ctx->locations['plant4']->name}");

        // Return requested (pending_return), and one received back into the pool.
        foreach (['a-005' => 12, 'a-006' => 5] as $assetKey => $daysAgo) {
            $clock->at($clock->daysAgo($daysAgo));
            $holder = $ctx->assets[$assetKey]->fresh();
            $ctx->actAsEmployee($holder->ownerEmployee);
            $ctx->assets[$assetKey] = $this->assets->requestReturn($holder, 'Upgrading to a new machine');
            $ctx->audit('Requested asset return', $holder->asset_code);
        }
        $clock->at($clock->daysAgo(3));
        $ctx->actAs($lead);
        $ctx->assets['a-006'] = $this->assets->markReceived($ctx->assets['a-006']->fresh(), self::PERFORMED_BY, $warehouses->first()->name);
        $ctx->audit('Received asset', $ctx->assets['a-006']->asset_code);

        // Written off from the pool.
        $clock->at($clock->daysAgo(25));
        $written = $this->assets->bulkSetStatus(
            [$ctx->assets['a-060']->id, $ctx->assets['a-061']->id, $ctx->assets['a-062']->id],
            AssetStatus::Writeoff,
            'Beyond economical repair - disposed via vendor',
        );
        $ctx->audit('Bulk asset writeoff', "{$written} assets");
    }

    /** Hands an asset to an employee (never before it was bought) and, optionally, accepts it the next day. */
    private function handOver(DemoContext $ctx, DemoClock $clock, string $assetKey, string $employeeKey, int $daysAgo, bool $accept): void
    {
        $daysAgo = min($daysAgo, max(0, ($this->boughtDaysAgo[$assetKey] ?? $daysAgo) - 3));

        $handedOver = $clock->daysAgo($daysAgo);
        $clock->at($handedOver);
        $ctx->actAs($ctx->user('it.lead'));
        $asset = $this->assets->transfer($ctx->assets[$assetKey]->fresh(), [
            'mode' => 'employee',
            'owner_employee_id' => $ctx->employee($employeeKey)->id,
            'location_id' => $ctx->locations['hq2']->id,
            'reason' => 'New equipment for daily work',
        ], self::PERFORMED_BY);
        $ctx->audit('Transferred asset', "{$asset->asset_code} → {$asset->ownerCode()}");

        if ($accept) {
            $clock->at($clock->after($handedOver, max(0, $daysAgo - 1), 14));
            $ctx->actAsEmployee($ctx->employee($employeeKey));
            $asset = $this->assets->accept($asset->fresh());
            $ctx->audit('Accepted asset', $asset->asset_code);
            $ctx->actAs($ctx->user('it.lead'));
        }

        $ctx->assets[$assetKey] = $asset->fresh();
    }

    /** The "Registered asset" row the Assets screen writes, as IT. */
    private function registered(DemoContext $ctx, string $assetKey): void
    {
        $asset = $ctx->assets[$assetKey];
        $ctx->audit('Registered asset', "{$asset->asset_code} - {$asset->model?->name}");
    }
}
