<?php

// The asset overview: status counts, value, per-type split and top-value tables now, and hand-overs and returns over a period.

namespace App\Services\Asset;

use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Support\OverviewPeriod;
use Illuminate\Support\Carbon;

class AssetSummaryService
{
    /**
     * Out of the pool and with a holder; the two pending states count too (not deployable today).
     *
     * @var list<AssetStatus>
     */
    private const IN_USE_STATUSES = [
        AssetStatus::Deployed,
        AssetStatus::Common,
        AssetStatus::PendingAcceptance,
        AssetStatus::PendingReturn,
    ];

    public function __construct(private readonly AssetTopValueService $topValue) {}

    /** @return array<string, mixed>  top_purchased is a collection of assets; the controller wraps it as AssetResource */
    public function summary(OverviewPeriod $period): array
    {
        $assets = Asset::with(['location', 'category', 'vendor', 'contract.vendor'])->get();

        // One stacked bar per type: ready + used + writeoff add up to count
        $byType = $assets->groupBy(fn (Asset $a) => $a->category?->name)
            ->map(fn ($group, $type) => [
                'type' => $type,
                'count' => $group->count(),
                'ready' => $group->where('status', AssetStatus::Ready)->count(),
                'used' => $group->whereIn('status', self::IN_USE_STATUSES)->count(),
                'writeoff' => $group->where('status', AssetStatus::Writeoff)->count(),
            ])->sortByDesc('count')->values();

        $inService = $assets->where('status', '!=', AssetStatus::Writeoff);

        return [
            'total' => $assets->count(),
            'deployed' => $assets->where('status', AssetStatus::Deployed)->count(),
            'ready' => $assets->where('status', AssetStatus::Ready)->count(),
            'common' => $assets->where('status', AssetStatus::Common)->count(),
            'pending_acceptance' => $assets->where('status', AssetStatus::PendingAcceptance)->count(),
            'pending_return' => $assets->where('status', AssetStatus::PendingReturn)->count(),
            'writeoff' => $assets->where('status', AssetStatus::Writeoff)->count(),
            'total_value' => round($assets->sum(fn (Asset $a) => $a->annualValue()), 2),
            'by_type' => $byType,
            'top_purchased' => $this->topValue->topPurchased($inService),
            'top_rented' => $this->topValue->topRented($inService),
            'activity' => $this->activity($period),
        ];
    }

    /**
     * Hand-overs and returns per chart column, oldest first, every column present; recalls count as returns.
     *
     * @return array{unit: string, data: list<array{month: string, handover: int, returned: int}>}
     */
    private function activity(OverviewPeriod $period): array
    {
        $rows = $period->apply(AssetTransfer::query(), 'created_at')->get(['kind', 'created_at']);
        $earliest = AssetTransfer::min('created_at');
        ['unit' => $unit, 'columns' => $columns] = $period->columns($earliest === null ? null : Carbon::parse($earliest));
        $columnOf = OverviewPeriod::columnFinder($columns);

        $data = array_map(fn (array $c) => ['month' => $c['start'], 'handover' => 0, 'returned' => 0], $columns);
        foreach ($rows as $row) {
            $kind = $row->kind;
            if ($kind && ! $kind->changesCustody()) {
                continue;
            }
            $i = $columnOf($row->created_at);
            if ($i !== null) {
                $data[$i][$kind?->isInbound() ? 'returned' : 'handover']++;
            }
        }

        return ['unit' => $unit, 'data' => $data];
    }
}
