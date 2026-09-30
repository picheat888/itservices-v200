<?php

namespace App\Services\Report;

use App\Models\Report\ReportPin;
use App\Models\User;
use App\Support\ReportCatalogue;

/**
 * Pinned reports of the Report Center. A pin is only ever made for a report the user may
 * open; one they lose access to later simply stops showing (the catalogue lists only what
 * ReportCatalogue allows), and comes back if the access does.
 */
class ReportPinService
{
    /** @return list<string> */
    public function pinnedKeys(User $user): array
    {
        return ReportPin::query()->where('user_id', $user->id)->orderBy('id')->pluck('report_key')->all();
    }

    /**
     * The catalogue this user may open, each entry flagged `pinned`.
     *
     * @return list<array{key: string, domain: string, kind: string, formats: list<string>, pinned: bool}>
     */
    public function catalogueFor(User $user): array
    {
        $pinned = $this->pinnedKeys($user);

        return array_map(
            fn (array $report) => [...$report, 'pinned' => in_array($report['key'], $pinned, true)],
            ReportCatalogue::forUser($user),
        );
    }

    public function pin(User $user, string $key): void
    {
        ReportPin::query()->firstOrCreate(['user_id' => $user->id, 'report_key' => $key]);
    }

    public function unpin(User $user, string $key): void
    {
        ReportPin::query()->where('user_id', $user->id)->where('report_key', $key)->delete();
    }
}
