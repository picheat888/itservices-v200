import { useT } from '@/lang';
import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { useToastStore } from '@/stores/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assetApi, type AssetPayload, type AssetTransferPayload } from '../api/assetApi';

const ASSETS = ['assets'] as const;
const SUMMARY = ['assets-summary'] as const;
/** Mutation key for accepting a hand-over — see the accept mutation and MyAssetsPage. */
export const ACCEPT_KEY = ['asset-accept'] as const;

/** Paginated asset list with search + type/source/status filters. */
export const useAssets = (params: {
    page: number;
    per_page: number;
    search: string;
    type?: string;
    source?: string;
    status?: string;
    warehouse?: string;
}) =>
    useQuery({
        queryKey: ['assets-list', params],
        queryFn: () =>
            assetApi.list({
                page: params.page,
                per_page: params.per_page,
                search: params.search || undefined,
                type: params.type || undefined,
                source: params.source || undefined,
                status: params.status || undefined,
                warehouse: params.warehouse || undefined,
            }),
        placeholderData: (prev) => prev,
    });

/** Full single asset (incl. transfer history + related tickets) — used by the detail dialog. */
export const useAsset = (id: number | null | undefined) =>
    useQuery({
        queryKey: ['asset', id],
        queryFn: () => assetApi.get(id as number),
        enabled: id != null,
    });

/** The contract linked to an asset — powers the read-only Contract peek (gated by assets.view). */
export const useAssetContract = (assetId: number | null | undefined) =>
    useQuery({
        queryKey: ['asset-contract', assetId],
        queryFn: () => assetApi.getContract(assetId as number),
        enabled: assetId != null,
    });

/** Minimal contract list for the rented-asset form picker (gated by assets.register/edit,
 *  so an asset admin without contracts.view can still link a rented asset to its contract). */
export const useAssetContractOptions = (enabled = true) =>
    useQuery({ queryKey: ['asset-contract-options'], queryFn: assetApi.contractOptions, enabled });

/** Who cannot accept a hand-over on their own — fetched only while the transfer dialog is open. */
export const useRecipientReadiness = (enabled = true) =>
    useQuery({ queryKey: ['asset-recipient-readiness'], queryFn: assetApi.recipientReadiness, enabled });

/**
 * Assets assigned to the current user (My Assets page + sidebar badge). Polls on the
 * same cadence as notifications so the badge appears in step with the bell/toast when
 * an asset is handed over from another session — no page reload needed.
 */
export const useMyAssets = (enabled = true) =>
    useQuery({
        queryKey: ['assets-mine'],
        queryFn: assetApi.mine,
        enabled,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
    });

// The My Assets badge (assets awaiting my acceptance) now comes from the combined
// /api/sidebar-badges endpoint — see shared/hooks/use-sidebar-badges.

/** Assets awaiting IT receipt back into the pool — drives the admin "to receive" card. */
export const usePendingReturns = () =>
    useQuery({
        queryKey: ['assets-pending-return'],
        queryFn: () => assetApi.list({ page: 1, per_page: 100, search: '', status: 'pending_return' }),
        select: (r) => r.data,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
    });

// The Assets badge (awaiting IT receipt) now comes from the combined
// /api/sidebar-badges endpoint — see shared/hooks/use-sidebar-badges.

export const useAssetSummary = () => useQuery({ queryKey: SUMMARY, queryFn: assetApi.summary });

export const useAssetTransfers = () => useQuery({ queryKey: ['asset-transfers'], queryFn: assetApi.transfers });

export function useAssetMutations() {
    const qc = useQueryClient();
    const t = useT();
    /**
     * Refresh everything an asset change can touch. Returns the combined promise so a caller
     * that needs to stay busy until the screen agrees with the server can await it; callers
     * that pass it as `onSuccess: invalidate` simply ignore the return value as before.
     */
    const invalidate = () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: ASSETS }),
            qc.invalidateQueries({ queryKey: ['assets-list'] }),
            qc.invalidateQueries({ queryKey: ['assets-mine'] }),
            qc.invalidateQueries({ queryKey: ['assets-pending-return'] }),
            qc.invalidateQueries({ queryKey: ['asset-transfers'] }),
            qc.invalidateQueries({ queryKey: SUMMARY }),
            qc.invalidateQueries({ queryKey: ['stock-items'] }),
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY }),
        ]);
    return {
        create: useMutation({ mutationFn: (p: AssetPayload) => assetApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: AssetPayload }) => assetApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => assetApi.remove(id), onSuccess: invalidate }),
        transfer: useMutation({
            mutationFn: (v: { id: number; payload: AssetTransferPayload }) => assetApi.transfer(v.id, v.payload),
            onSuccess: invalidate,
        }),
        accept: useMutation({
            // Keyed so the My Assets page can read which accepts are in flight straight from the
            // mutation cache (useMutationState) instead of keeping its own list. A local list
            // could only be cleared from mutate()'s per-call onSettled, and MutationObserver
            // drops those callbacks the moment a second accept starts — so the first row's
            // id was never removed and its button span forever.
            mutationKey: ACCEPT_KEY,
            mutationFn: (id: number) => assetApi.accept(id),
            // A 403 means the hand-over is no longer this user's to accept — most often IT
            // cancelled/recalled it while they were on the page. Surface it instead of failing
            // silently, and refresh on settle so the stale "pending acceptance" row clears.
            onError: (err) => {
                const status = (err as { response?: { status?: number } }).response?.status;
                if (status === 403) {
                    useToastStore.getState().push(t('asset_accept_gone'), 'error', t('asset_accept_gone_title'));
                } else {
                    useToastStore.getState().push(t('asset_action_failed'), 'error');
                }
            },
            // Returned, not fired and forgotten: React Query holds the mutation `pending` until
            // this resolves, so the button keeps spinning until the refreshed list is on screen.
            // Without it the spinner stopped ~380ms before the row moved — a dead zone in which
            // the button was live again on a hand-over that had already been accepted.
            onSettled: () => invalidate(),
        }),
        requestReturn: useMutation({
            mutationFn: (v: { id: number; reason?: string }) => assetApi.requestReturn(v.id, v.reason),
            onSuccess: invalidate,
        }),
        receive: useMutation({
            mutationFn: (v: { id: number; warehouse?: string }) => assetApi.receive(v.id, v.warehouse),
            onSuccess: invalidate,
        }),
        recall: useMutation({
            mutationFn: (v: { id: number; warehouse: string; reason?: string }) => assetApi.recall(v.id, v.warehouse, v.reason),
            // Refresh on success AND failure: a 422 usually means the recipient accepted
            // under us, so we still want the stale "pending acceptance" row to update.
            onSettled: invalidate,
        }),
        cancelWriteoff: useMutation({ mutationFn: (id: number) => assetApi.cancelWriteoff(id), onSuccess: invalidate }),
        bulk: useMutation({
            mutationFn: (v: { ids: number[]; op: 'writeoff'; reason?: string }) => assetApi.bulk(v.ids, v.op, v.reason),
            onSuccess: invalidate,
        }),
        bulkTransfer: useMutation({
            mutationFn: (v: {
                ids: number[];
                mode: 'employee' | 'shared';
                owner_employee_id?: number;
                owner_label?: string;
                location_id: number;
                reason?: string;
            }) => assetApi.bulkTransfer(v),
            onSuccess: invalidate,
        }),
        updateLocation: useMutation({
            mutationFn: (v: { ids: number[]; location_id: number; note?: string }) => assetApi.updateLocation(v),
            onSuccess: invalidate,
        }),
        bulkRecall: useMutation({
            mutationFn: (v: { ids: number[]; warehouse: string; reason?: string }) => assetApi.bulkRecall(v.ids, v.warehouse, v.reason),
            onSuccess: invalidate,
        }),
        bulkReceive: useMutation({
            mutationFn: (v: { ids: number[]; warehouse: string }) => assetApi.bulkReceive(v.ids, v.warehouse),
            onSuccess: invalidate,
        }),
    };
}
