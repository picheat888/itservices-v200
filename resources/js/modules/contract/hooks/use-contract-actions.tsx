// Contract lifecycle actions (cancel / expire / reactivate / delete) shared by the detail dialog and the row menu.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import type { Contract } from '@/shared/types';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useState } from 'react';
import { ContractCancelDialog } from '../components/contract-cancel-dialog';
import { useContractMutations } from './use-contracts';

/** Linked assets not yet written off; a list row sends the count and an empty linked_assets. */
export function openAssetCount(c: Contract): number {
    return c.open_assets_count ?? c.linked_assets.filter((a) => a.status !== 'writeoff').length;
}

/** A contract added by mistake can be removed outright only while active and with no assets linked. */
export function isContractDeletable(c: Contract): boolean {
    return c.status === 'active' && (c.assets_count ?? c.linked_assets.length) === 0;
}

export function useContractActions(onDone: () => void) {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const { expire, reactivate, remove } = useContractMutations();
    const [cancelling, setCancelling] = useState<Contract | null>(null);

    // Every linked asset must be written off before a contract can be closed
    const assertAssetsClear = async (c: Contract): Promise<boolean> => {
        const pending = openAssetCount(c);
        if (pending === 0) return true;
        await confirm({
            variant: 'warn',
            hideCancel: true,
            title: t('contract_cannot_close_title'),
            description: t('contract_cannot_close_desc').replace('{n}', fmtN(pending)),
            confirmText: t('contract_got_it'),
        });
        return false;
    };

    // Cancel = reversible early termination, with a reason
    const startCancel = async (c: Contract) => {
        if (await assertAssetsClear(c)) setCancelling(c);
    };

    // Expired = permanent admin close-out
    const startExpire = async (c: Contract) => {
        if (!(await assertAssetsClear(c))) return;
        await confirm({
            variant: 'danger',
            title: t('contract_expire'),
            entity: { name: c.name, sub: c.code },
            description: t('contract_expire_permanent_note'),
            confirmText: t('contract_expire'),
            action: async () => {
                await expire.mutateAsync(c.id);
                onDone();
            },
        });
    };

    const startReactivate = (c: Contract) =>
        confirm({
            variant: 'edit',
            title: t('contract_reactivate_confirm_title'),
            entity: { name: c.name, sub: c.code },
            confirmText: t('contract_reactivate'),
            action: async () => {
                await reactivate.mutateAsync(c.id);
                onDone();
            },
        });

    const startDelete = (c: Contract) =>
        confirm({
            variant: 'danger',
            title: t('contract_delete_confirm'),
            entity: { name: c.name, sub: c.code },
            description: t('contract_delete_note'),
            confirmText: t('contract_delete'),
            action: async () => {
                await remove.mutateAsync(c.id);
                onDone();
            },
        });

    const cancelDialog = (
        <ContractCancelDialog
            contract={cancelling}
            onClose={() => setCancelling(null)}
            onDone={() => {
                setCancelling(null);
                onDone();
            }}
        />
    );

    return {
        startCancel,
        startExpire,
        startReactivate,
        startDelete,
        cancelDialog,
        pending: { expire: expire.isPending, reactivate: reactivate.isPending, remove: remove.isPending },
    };
}
