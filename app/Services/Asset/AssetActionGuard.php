<?php

// Who may hand over, accept, return, receive, recall, relocate, retire, edit or delete an asset, and in which status.
// Answers are gate Responses carrying the codes the SPA translates (handover_not_ready, recall_some_blocked, ...).

namespace App\Services\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Collection;

class AssetActionGuard
{
    /** Statuses an ordinary recall (assets.transfer) pulls back: a pending hand-over or a shared asset. */
    private const NORMAL_RECALL = [AssetStatus::PendingAcceptance, AssetStatus::Common];

    public function canView(?User $user): Response
    {
        return $this->permitted($user, 'assets.view');
    }

    public function canViewOverview(?User $user): Response
    {
        return $this->permitted($user, 'assets.view_dashboard');
    }

    /** The asset form's contract picker: whoever can register or edit an asset, without contracts.view. */
    public function canPickContract(?User $user): Response
    {
        return $user?->hasPermission('assets.register') || $user?->hasPermission('assets.edit') ? Response::allow() : $this->forbidden();
    }

    public function canTransferAny(?User $user): Response
    {
        return $this->permitted($user, 'assets.transfer');
    }

    /** One Ready asset to an employee or a shared label. */
    public function canTransfer(?User $user, Asset $asset): Response
    {
        return match (true) {
            ! $user?->hasPermission('assets.transfer') => $this->forbidden(),
            // Already out of the pool: recall or return it first
            $asset->isDeployed() || $asset->status === AssetStatus::Common => $this->refused('in_use_return_first'),
            // Mid-move or retired: the screen only offers Transfer on a Ready asset
            $asset->status !== AssetStatus::Ready => $this->refused('handover_not_ready'),
            default => Response::allow(),
        };
    }

    /**
     * Several Ready or Common assets at once; a Common one is simply re-assigned.
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function canBulkTransfer(Collection $assets): Response
    {
        return $assets->contains(fn (Asset $a) => ! in_array($a->status, [AssetStatus::Ready, AssetStatus::Common], true))
            ? $this->refused('transfer_not_transferable')
            : Response::allow();
    }

    /** Only the recipient confirms a hand-over; IT cannot accept on their behalf. */
    public function canAccept(?User $user, Asset $asset): Response
    {
        return match (true) {
            ! $this->holds($user, $asset) => $this->forbidden(),
            // On anything else (a return under way above all) it would flip the asset back to in use
            $asset->status !== AssetStatus::PendingAcceptance => $this->refused('accept_not_pending'),
            default => Response::allow(),
        };
    }

    /** The holder sends back an asset they hold (profile.return_assets). */
    public function canRequestReturn(?User $user, Asset $asset): Response
    {
        return ! $user?->hasPermission('profile.return_assets') || ! $this->holds($user, $asset) || $asset->status !== AssetStatus::Deployed
            ? $this->forbidden()
            : Response::allow();
    }

    /** IT receives a returned asset back into the pool. */
    public function canReceive(?User $user, Asset $asset): Response
    {
        return match (true) {
            ! $user?->hasPermission('assets.receive') => $this->forbidden(),
            // Anything else would pull a held asset out of someone's hands or undo a write-off
            $asset->status !== AssetStatus::PendingReturn => $this->refused('receive_not_pending'),
            default => Response::allow(),
        };
    }

    public function canReceiveAny(?User $user): Response
    {
        return $this->permitted($user, 'assets.receive');
    }

    /** @param  Collection<int, Asset>  $assets */
    public function canBulkReceive(Collection $assets): Response
    {
        return $assets->contains(fn (Asset $a) => $a->status !== AssetStatus::PendingReturn)
            ? $this->refused('receive_not_pending')
            : Response::allow();
    }

    /** May recall at all: assets.transfer for the ordinary recall, assets.force_recall for any out asset. */
    public function canRecallAny(?User $user): Response
    {
        return $user?->hasPermission('assets.transfer') || $user?->hasPermission('assets.force_recall')
            ? Response::allow()
            : $this->forbidden();
    }

    /** An ordinary recall needs a pending hand-over or a shared asset; force recall takes any out asset. */
    public function canRecall(?User $user, Asset $asset): Response
    {
        if ($this->canRecallAny($user)->denied()) {
            return $this->forbidden();
        }
        if ($user->hasPermission('assets.force_recall')) {
            return match ($asset->status) {
                AssetStatus::Writeoff => $this->refused('recall_writeoff'),
                AssetStatus::Ready => $this->refused('recall_already_ready'),
                default => Response::allow(),
            };
        }

        return $this->isNormalRecall($asset) ? Response::allow() : $this->refused('recall_not_allowed');
    }

    /** @param  Collection<int, Asset>  $assets */
    public function canBulkRecall(User $user, Collection $assets): Response
    {
        return $assets->contains(fn (Asset $a) => $this->canRecall($user, $a)->denied())
            ? $this->refused('recall_some_blocked')
            : Response::allow();
    }

    /** A recall assets.transfer could make alone; any other is a force recall in the audit log. */
    public function isNormalRecall(Asset $asset): bool
    {
        return in_array($asset->status, self::NORMAL_RECALL, true);
    }

    /**
     * Only assets in use have a place worth correcting (assets.edit).
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function canRelocate(Collection $assets): Response
    {
        return $assets->contains(fn (Asset $a) => ! in_array($a->status, [AssetStatus::Deployed, AssetStatus::Common], true))
            ? $this->refused('relocate_not_in_use')
            : Response::allow();
    }

    /**
     * Only rented assets with no contract that are still in the register take a contract in bulk.
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function canLinkContract(Collection $assets): Response
    {
        return $assets->contains(fn (Asset $a) => $a->source !== AssetSource::Rented || $a->contract_id !== null || $a->status === AssetStatus::Writeoff)
            ? $this->refused('link_not_free_rental')
            : Response::allow();
    }

    public function canEdit(?User $user): Response
    {
        return $this->permitted($user, 'assets.edit');
    }

    /** Write-off and return to the lessor are both a way out of the register (assets.retire). */
    public function canRetire(?User $user): Response
    {
        return $this->permitted($user, 'assets.retire');
    }

    /** A written-off asset is frozen until the write-off is cancelled. */
    public function canUpdate(Asset $asset): Response
    {
        return $asset->status === AssetStatus::Writeoff ? $this->refused('writeoff_locked') : Response::allow();
    }

    public function canCancelWriteoff(?User $user, Asset $asset): Response
    {
        return match (true) {
            ! $user?->hasPermission('assets.cancel_writeoff') => $this->forbidden(),
            $asset->status !== AssetStatus::Writeoff => $this->refused('not_writeoff'),
            default => Response::allow(),
        };
    }

    /** Only a pooled asset off any contract; the history and ticket checks carry counts and stay with the delete. */
    public function canDelete(?User $user, Asset $asset): Response
    {
        return match (true) {
            ! $user?->hasPermission('assets.delete') => $this->forbidden(),
            $asset->status !== AssetStatus::Ready => $this->refused('delete_not_ready'),
            $asset->contract_id !== null => $this->refused('delete_on_contract'),
            default => Response::allow(),
        };
    }

    /** The signed-in user's own employee record holds the asset. */
    private function holds(?User $user, Asset $asset): bool
    {
        $employeeId = $user?->linkedEmployee()?->id;

        return $employeeId !== null && $employeeId === $asset->owner_employee_id;
    }

    private function permitted(?User $user, string $permission): Response
    {
        return $user?->hasPermission($permission) ? Response::allow() : $this->forbidden();
    }

    private function forbidden(string $code = ''): Response
    {
        return Response::deny($code);
    }

    private function refused(string $code): Response
    {
        return Response::denyWithStatus(422, $code);
    }
}
