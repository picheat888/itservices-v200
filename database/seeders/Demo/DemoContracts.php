<?php

namespace Database\Seeders\Demo;

use App\Enums\Contract\ContractType;
use App\Services\Contract\ContractService;

/**
 * Contracts in every state the Contracts page and the expiry alerts show. Status is
 * computed from dates, so each is placed by its end date: running, due in ≤ 7 and
 * ≤ 30 days, expired (end date passed, then expire() a few days after), and cancelled
 * (cancel() while it still had time to run). Rental contracts are hardware — rented
 * assets in DemoAssets point at them.
 */
final class DemoContracts implements DemoStep
{
    /** key => [name, type, vendor key, start (days ago), end (days from base; negative = past), monthly value, billing cycle] */
    private const CONTRACTS = [
        'm365' => ['Microsoft 365 Business - 60 seats', ContractType::Software, 'msft', 300, 65, 18000, 'yearly'],
        'antivirus' => ['Endpoint protection 80 devices', ContractType::Software, 'secure', 200, 165, 6500, 'yearly'],
        'erp' => ['ERP support & licence', ContractType::Software, 'msft', 350, 380, 42000, 'yearly'],
        'printer-rental' => ['Ricoh MFP rental 6 units', ContractType::Hardware, 'ricoh', 400, 330, 9000, 'monthly'],
        'laptop-rental' => ['Laptop rental 6 units', ContractType::Hardware, 'lenovo', 250, 480, 7200, 'monthly'],
        'cctv-ma' => ['CCTV maintenance - plant 1-4', ContractType::Service, 'secure', 330, 35, 5500, 'quarterly'],
        'ups-ma' => ['UPS preventive maintenance', ContractType::Service, 'secure', 180, 185, 2500, 'yearly'],
        'phone-ma' => ['IP phone system support', ContractType::Service, 'ais', 150, 215, 3000, 'yearly'],
        'internet' => ['Internet 1 Gbps - office', ContractType::Connectivity, 'true', 340, 25, 12000, 'monthly'],
        'wan' => ['MPLS WAN plant 1-4', ContractType::Connectivity, 'ais', 300, 430, 28000, 'monthly'],
        'cloud-backup' => ['Cloud backup 5 TB', ContractType::Other, 'msft', 120, 245, 4000, 'monthly'],
        'due-7' => ['Domain & SSL renewal', ContractType::Other, 'true', 360, 5, 800, 'yearly'],
        'due-30' => ['Wi-Fi controller licence', ContractType::Software, 'secure', 340, 26, 1500, 'yearly'],
        'old-rental' => ['Desktop rental (ended)', ContractType::Hardware, 'hp', 500, -40, 6000, 'monthly'],
        'old-isp' => ['Backup internet (ended)', ContractType::Connectivity, 'true', 420, -60, 3500, 'monthly'],
        'cancelled-ma' => ['Server room aircon maintenance', ContractType::Service, 'secure', 160, 200, 2200, 'yearly'],
    ];

    public function __construct(private readonly ContractService $contracts) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $base = $clock->base();
        $ctx->actAs($ctx->user('it.lead'));

        foreach (self::CONTRACTS as $key => [$name, $type, $vendor, $startAgo, $endIn, $value, $billing]) {
            $clock->at($clock->daysAgo($startAgo));
            $ctx->contracts[$key] = $this->contracts->create([
                'vendor_id' => $ctx->vendors[$vendor]->id,
                'name' => $name,
                'details' => "{$name} - demo contract",
                'type' => $type->value,
                'start_date' => $base->copy()->subDays($startAgo)->toDateString(),
                'end_date' => $base->copy()->addDays($endIn)->toDateString(),
                'value' => $value,
                'total_value' => $value * 12,
                'billing_cycle' => $billing,
            ]);
            $ctx->audit('Created contract', "{$name} ({$ctx->contracts[$key]->code})");
        }

        // Ended: expire() a few days after the end date passed.
        foreach (['old-rental' => 40, 'old-isp' => 60] as $key => $endedDaysAgo) {
            $clock->at($clock->daysAgo($endedDaysAgo - 3));
            $contract = $ctx->contracts[$key] = $this->contracts->expire($ctx->contracts[$key]->fresh());
            $ctx->audit('Expired contract', "{$contract->name} ({$contract->code})");
        }

        // Cancelled while it still had months to run.
        $clock->at($clock->daysAgo(30));
        $reason = 'Replaced by the new facility contract';
        $contract = $ctx->contracts['cancelled-ma'] = $this->contracts->cancel($ctx->contracts['cancelled-ma']->fresh(), $reason);
        $ctx->audit('Cancelled contract', "{$contract->name} ({$contract->code}) - {$reason}");
    }
}
