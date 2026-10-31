<?php

// Contract page overview figures: status counts, annual spend, top vendors, the expiry timeline and the action queue.

namespace App\Services\Contract;

use App\Models\Contract\Contract;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Collection;

class ContractSummaryService
{
    /**
     * The header alert counts, plus the Overview tab's figures when $withOverview.
     *
     * @return array<string, mixed>
     */
    public function summary(bool $withOverview): array
    {
        $contracts = Contract::with('vendor')->get();

        $live = $contracts->reject(fn (Contract $c) => $c->isClosed());
        $expiring = $live->filter(fn (Contract $c) => $c->isInReminder());
        $overdue = $live->filter(fn (Contract $c) => $c->isOverdue());

        // The header alert buttons need only these two; the rest is the Overview tab's
        if (! $withOverview) {
            return [
                'expiring' => $expiring->count(),
                'overdue' => $overdue->count(),
            ];
        }

        // "Active" = healthy contracts only, so active, expiring and overdue never overlap
        $active = $live->filter(fn (Contract $c) => $c->daysRemaining() > 0 && ! $c->isInReminder());
        $cancelled = $contracts->filter(fn (Contract $c) => $c->cancelled_at !== null && $c->expired_at === null);
        $expired = $contracts->filter(fn (Contract $c) => $c->expired_at !== null);

        return [
            'total' => $contracts->count(),
            'active' => $active->count(),
            'expiring' => $expiring->count(),
            'overdue' => $overdue->count(),
            'expired' => $expired->count(),
            'cancelled' => $cancelled->count(),
            'annual_value' => AppSetting::money($live->sum(fn (Contract $c) => $c->annualValue())),
            'top_vendors' => $this->topVendors($live),
            'timeline' => $this->timeline($live),
            'action_queue' => $this->actionQueue($overdue, $expiring),
        ];
    }

    /**
     * Running contracts only, the same set as the annual value card.
     *
     * @param  Collection<int, Contract>  $live
     * @return list<array{vendor: ?string, vendor_th: ?string, amount: float}>
     */
    private function topVendors(Collection $live): array
    {
        return $live
            ->groupBy(fn (Contract $c) => $c->vendor?->name)
            ->map(fn ($group, $vendor) => [
                'vendor' => $vendor,
                'vendor_th' => $group->first()->vendor?->name_th,
                'amount' => round($group->sum(fn (Contract $c) => $c->annualValue()), 2),
            ])
            ->sortByDesc('amount')
            ->take(5)
            ->values()
            ->all();
    }

    /**
     * Timeline dots on exactly the page's 12-month axis (2 months back to 9 ahead).
     *
     * @param  Collection<int, Contract>  $live
     * @return list<array<string, mixed>>
     */
    private function timeline(Collection $live): array
    {
        $axisStart = now()->startOfMonth()->subMonthsNoOverflow(2);
        $axisEnd = now()->startOfMonth()->addMonthsNoOverflow(9)->endOfMonth();

        return $live
            ->filter(fn (Contract $c) => $c->end_date->between($axisStart, $axisEnd))
            ->map(fn (Contract $c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor?->name,
                'vendor_th' => $c->vendor?->name_th,
                'end' => $c->end_date->toDateString(),
                'days' => $c->daysRemaining(),
                // Amber dot = inside the contract's own reminder window, as the action queue
                'in_reminder' => $c->isInReminder(),
            ])
            ->values()
            ->all();
    }

    /**
     * Overdue first (longest overdue on top), then ending today and the rest of the reminder window.
     *
     * @param  Collection<int, Contract>  $overdue
     * @param  Collection<int, Contract>  $expiring
     * @return list<array<string, mixed>>
     */
    private function actionQueue(Collection $overdue, Collection $expiring): array
    {
        return $overdue->merge($expiring)
            ->sortBy(fn (Contract $c) => $c->daysRemaining())
            ->take(20)
            ->map(fn (Contract $c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor?->name,
                'vendor_th' => $c->vendor?->name_th,
                'days' => $c->daysRemaining(),
            ])
            ->values()
            ->all();
    }
}
