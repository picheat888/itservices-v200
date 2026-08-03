<?php

namespace App\Services\Sidebar;

use App\Enums\Asset\AssetStatus;
use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Enums\Ticket\TicketStatus;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\Permissions;

/**
 * Every "needs attention" count the sidebar badges show, resolved in a single request.
 *
 * Before this existed each badge fetched its own endpoint (9 requests on mount), so the
 * numbers popped in one at a time. Each count here mirrors the module endpoint it replaces
 * and is gated by the same permission, so a user never sees a number they could not have
 * loaded themselves; counts they cannot see come back as 0.
 */
class SidebarBadgeService
{
    /**
     * All badge counts for one user, keyed by the sidebar nav item id.
     *
     * @return array{employees: int, access: int, tickets: int, requests: int, assets: int, my_assets: int, contracts: int, stock: int}
     */
    public function forUser(?User $user): array
    {
        return [
            'employees' => $this->gated($user, ['employees.view_dashboard'], fn () => $this->employeesWithoutAccount()),
            'requests' => $this->gated($user, ['requests.submit'], fn () => $this->requestsNeedingAttention($user)),
            'access' => $this->gated($user, ['access.module', 'access.overview'], fn () => $this->accessAnomalies()),
            'tickets' => $this->gated($user, ['tickets.create'], fn () => $this->ticketsNeedingAttention($user)),
            // Mirrors assets/summary: its own gate (assets.view) plus the nav item's (assets.receive).
            'assets' => $this->gated($user, ['assets.view', 'assets.receive'], fn () => $this->assetsPendingReturn()),
            'my_assets' => $this->gated($user, ['assets.my'], fn () => $this->myAssetsPendingAcceptance($user)),
            'contracts' => $this->gated($user, ['contracts.view'], fn () => $this->contractsNeedingRenewal()),
            'stock' => $this->gated($user, ['stock.view'], fn () => $this->stockNeedingAttention($user)),
        ];
    }

    /**
     * Runs the counter only when the user holds every listed permission — otherwise 0.
     *
     * @param  list<string>  $permissions
     * @param  callable(): int  $count
     */
    private function gated(?User $user, array $permissions, callable $count): int
    {
        foreach ($permissions as $permission) {
            if (! $user?->hasPermission($permission)) {
                return 0;
            }
        }

        return $count();
    }

    /**
     * Things needing MY action in the Request module: approval steps currently
     * waiting on me as the resolved approver, plus (for requests.fulfill
     * holders) the approved queue awaiting IT. Deliberately excludes the
     * user's own in-flight requests — those wait on someone else.
     */
    private function requestsNeedingAttention(?User $user): int
    {
        $awaitingMe = $user?->employee_id === null ? 0 : RequestApproval::query()
            ->where('approver_employee_id', $user->employee_id)
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value)
            ->count();

        $queue = $user?->hasPermission('requests.fulfill')
            ? ServiceRequest::where('status', RequestStatus::Approved->value)->count()
            : 0;

        return $awaitingMe + $queue;
    }

    /** Active staff still without a login account — same rule as employees/summary. */
    private function employeesWithoutAccount(): int
    {
        return Employee::where('status', EmployeeStatus::Active->value)
            ->whereDoesntHave('user')
            ->count();
    }

    /**
     * Governance hygiene issues listed on the Access overview: resources with no active
     * member, resources missing an owner, and resigned staff still holding a grant.
     * Counted directly instead of through AccessService::dashboard(), which builds the
     * full drill-down lists — too much work for a polled badge. A parity test pins these
     * numbers to the dashboard's.
     */
    private function accessAnomalies(): int
    {
        $registries = [EmailGroup::class, FileShare::class, SocialPlatform::class, Software::class];
        $empty = 0;
        foreach ($registries as $model) {
            $empty += $model::query()->whereDoesntHave('memberships', fn ($q) => $q->active())->count();
        }

        // Only email groups and file shares carry an owner.
        $noOwner = FileShare::whereNull('owner_employee_id')->count()
            + EmailGroup::whereNull('owner_employee_id')->count();

        $resignedHolders = AccessMembership::query()->active()
            ->whereHas('employee', fn ($q) => $q->where('status', EmployeeStatus::Resigned->value))
            ->distinct()->count('employee_id');

        return $empty + $noOwner + $resignedHolders;
    }

    /**
     * Cases the user is working, filed themselves, or (with tickets.resolve) may pick up.
     * Public because tickets/badge still serves it on its own for the Tickets page.
     */
    public function ticketsNeedingAttention(?User $user): int
    {
        $canTake = (bool) $user?->hasPermission('tickets.resolve');
        $levels = Permissions::ticketLevelsFor($user);

        return Ticket::query()
            ->where(function ($q) use ($user, $canTake, $levels) {
                $q->where(fn ($w) => $w->where('assignee_id', $user?->id)->where('status', TicketStatus::InProgress))
                    ->orWhere(fn ($w) => $w->where('requester_id', $user?->employee_id)
                        ->whereIn('status', [TicketStatus::Open, TicketStatus::InProgress]));
                if ($canTake) {
                    // Only cases the taker's Ticket Level actually lets them pick up.
                    $q->orWhere(fn ($w) => $w->where('status', TicketStatus::Open)->whereNull('assignee_id')
                        ->whereIn('category', $levels));
                }
            })
            ->count();
    }

    /** Assets handed back and awaiting IT receipt into the pool. */
    private function assetsPendingReturn(): int
    {
        return Asset::where('status', AssetStatus::PendingReturn)->count();
    }

    /** Assets handed to this user that they have not accepted yet. */
    private function myAssetsPendingAcceptance(?User $user): int
    {
        $employee = $user?->linkedEmployee();
        if ($employee === null) {
            return 0;
        }

        return Asset::where('owner_employee_id', $employee->id)
            ->where('status', AssetStatus::PendingAcceptance)
            ->count();
    }

    /**
     * Live contracts inside their reminder window plus those already past the end date —
     * the two alert banners on the Contracts page. Terminal states (cancelled / expired)
     * have nothing left to action, so they are excluded.
     */
    private function contractsNeedingRenewal(): int
    {
        return Contract::query()
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->get()
            ->filter(fn (Contract $c) => $c->isInReminder() || $c->daysRemaining() <= 0)
            ->count();
    }

    /**
     * Min/max alerts + outstanding requests + open count sessions. Each part carries its own
     * permission (the three endpoints it replaces do too), so a stock viewer without, say,
     * the request permission simply does not have that part counted.
     */
    private function stockNeedingAttention(?User $user): int
    {
        $total = 0;

        if ($user?->hasPermission('stock.view_dashboard')) {
            // Counted in SQL (scopeWithDerivedStatus mirrors StockItem::status()) rather than
            // loading every SKU — this endpoint is polled, the dashboard one is not.
            $total += StockItem::withDerivedStatus('alerts')->count();
        }

        if ($user?->hasPermission('stock.view_request')) {
            $query = StockRequest::whereIn('status', ['pending', 'approved']);
            // Same visibility rule as the request list: approvers/fulfillers see everything.
            $seesAll = $user->isSuper() || $user->hasPermission('stock.approve') || $user->hasPermission('stock.fulfill');
            if (! $seesAll) {
                $query->where('user_id', $user->id);
            }
            $total += $query->count();
        }

        if ($user?->hasPermission('stock.view_count')) {
            $total += StockCount::where('status', 'draft')->count();
        }

        return $total;
    }
}
