import { assetApi, type AssetPayload } from '../api/assetApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const ASSETS = ['assets'] as const;
const SUMMARY = ['assets-summary'] as const;

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

/** Count of assets awaiting the current user's acceptance — shown as a sidebar badge. */
export function useMyAssetsSidebarBadge(enabled = true): number {
    const { data = [] } = useMyAssets(enabled);

    return data.filter((a) => a.status === 'pending_acceptance').length;
}

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

/** IT-side "needs attention" count for the Assets menu: assets awaiting receipt back into the pool. */
export function useAssetsSidebarBadge(enabled = true): number {
    const { data } = useQuery({
        queryKey: SUMMARY,
        queryFn: assetApi.summary,
        enabled,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
    });

    return data?.pending_return ?? 0;
}

export const useAssetSummary = () => useQuery({ queryKey: SUMMARY, queryFn: assetApi.summary });

export const useAssetTransfers = () => useQuery({ queryKey: ['asset-transfers'], queryFn: assetApi.transfers });

export function useAssetMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ASSETS });
        qc.invalidateQueries({ queryKey: ['assets-list'] });
        qc.invalidateQueries({ queryKey: ['assets-mine'] });
        qc.invalidateQueries({ queryKey: ['assets-pending-return'] });
        qc.invalidateQueries({ queryKey: ['asset-transfers'] });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: ['stock-items'] });
    };
    return {
        create: useMutation({ mutationFn: (p: AssetPayload) => assetApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: AssetPayload }) => assetApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => assetApi.remove(id), onSuccess: invalidate }),
        transfer: useMutation({
            mutationFn: (v: { id: number; owner: string; location: string; reason?: string }) =>
                assetApi.transfer(v.id, v.owner, v.location, v.reason),
            onSuccess: invalidate,
        }),
        accept: useMutation({ mutationFn: (id: number) => assetApi.accept(id), onSuccess: invalidate }),
        requestReturn: useMutation({
            mutationFn: (v: { id: number; reason?: string }) => assetApi.requestReturn(v.id, v.reason),
            onSuccess: invalidate,
        }),
        receive: useMutation({
            mutationFn: (v: { id: number; warehouse?: string }) => assetApi.receive(v.id, v.warehouse),
            onSuccess: invalidate,
        }),
        bulk: useMutation({
            mutationFn: (v: { ids: number[]; op: 'writeoff'; reason?: string }) => assetApi.bulk(v.ids, v.op, v.reason),
            onSuccess: invalidate,
        }),
    };
}
