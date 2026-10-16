<?php

namespace App\Services\Dashboard;

use App\Models\User;

/**
 * What the front page shows, in one request: "mine" for everyone, then one block per Dashboard switch.
 * A block the reader may not see is absent, not empty — the page draws only the keys that arrived.
 */
class DashboardSummaryService
{
    public function __construct(
        private readonly MineBlock $mine,
        private readonly ItBlock $it,
        private readonly RequestsBlock $requests,
        private readonly ContractsBlock $contracts,
        private readonly PeopleBlock $people,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function forUser(User $user): array
    {
        $blocks = ['mine' => $this->mine->build($user)];

        if ($user->hasPermission('dashboard.view_it')) {
            $blocks['it'] = $this->it->build();
        }
        if ($user->hasPermission('dashboard.view_requests')) {
            $blocks['requests'] = $this->requests->build();
        }
        if ($user->hasPermission('dashboard.view_contracts')) {
            $blocks['contracts'] = $this->contracts->build();
        }
        if ($user->hasPermission('dashboard.view_hr')) {
            $blocks['hr'] = $this->people->headcount();
        }
        if ($user->hasPermission('dashboard.view_activity')) {
            $blocks['activity'] = $this->people->activity();
        }

        return $blocks;
    }
}
