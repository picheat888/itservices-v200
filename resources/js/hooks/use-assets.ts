import { assetApi, type AssetPayload } from '@/services/assetApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const ASSETS = ['assets'] as const;
const SUMMARY = ['assets-summary'] as const;

/** Paginated asset list with search + type/source/status filters. */
export const useAssets = (params: { page: number; per_page: number; search: string; type?: string; source?: string; status?: string }) =>
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
            }),
        placeholderData: (prev) => prev,
    });

export const useAssetSummary = () => useQuery({ queryKey: SUMMARY, queryFn: assetApi.summary });

export const useAssetTransfers = () => useQuery({ queryKey: ['asset-transfers'], queryFn: assetApi.transfers });

export function useAssetMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ASSETS });
        qc.invalidateQueries({ queryKey: ['assets-list'] });
        qc.invalidateQueries({ queryKey: ['asset-transfers'] });
        qc.invalidateQueries({ queryKey: SUMMARY });
    };
    return {
        create: useMutation({ mutationFn: (p: AssetPayload) => assetApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: AssetPayload }) => assetApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => assetApi.remove(id), onSuccess: invalidate }),
        transfer: useMutation({
            mutationFn: (v: { id: number; owner: string; reason?: string }) => assetApi.transfer(v.id, v.owner, v.reason),
            onSuccess: invalidate,
        }),
        accept: useMutation({ mutationFn: (id: number) => assetApi.accept(id), onSuccess: invalidate }),
        receive: useMutation({ mutationFn: (id: number) => assetApi.receive(id), onSuccess: invalidate }),
        toggleMaintenance: useMutation({ mutationFn: (id: number) => assetApi.toggleMaintenance(id), onSuccess: invalidate }),
        bulk: useMutation({
            mutationFn: (v: { ids: number[]; op: 'maintenance' | 'writeoff'; reason?: string }) => assetApi.bulk(v.ids, v.op, v.reason),
            onSuccess: invalidate,
        }),
    };
}
