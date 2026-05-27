import { contractApi, type ContractPayload } from '@/services/contractApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const CONTRACTS = ['contracts'] as const;
const SUMMARY = ['contracts-summary'] as const;

/** Paginated contract list; the "expiring" tab is server-filtered. */
export const useContracts = (params: { page: number; per_page: number; search: string; tab: string; type?: string }) =>
    useQuery({
        queryKey: ['contracts-list', params],
        queryFn: () =>
            contractApi.list({
                page: params.page,
                per_page: params.per_page,
                search: params.search || undefined,
                tab: params.tab,
                type: params.type || undefined,
            }),
        placeholderData: (prev) => prev,
    });

export const useContractSummary = () => useQuery({ queryKey: SUMMARY, queryFn: contractApi.summary });

/** Fetches one full contract by id — used when opening the detail drawer. */
export const useContract = (id: number | null) =>
    useQuery({
        queryKey: ['contract', id],
        queryFn: () => contractApi.get(id as number),
        enabled: id != null,
    });

export function useContractMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: CONTRACTS });
        qc.invalidateQueries({ queryKey: ['contracts-list'] });
        qc.invalidateQueries({ queryKey: SUMMARY });
    };
    return {
        create: useMutation({ mutationFn: (p: ContractPayload) => contractApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: ContractPayload }) => contractApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        cancel: useMutation({ mutationFn: (id: number) => contractApi.cancel(id), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => contractApi.remove(id), onSuccess: invalidate }),
        import: useMutation({ mutationFn: (file: File) => contractApi.import(file), onSuccess: invalidate }),
    };
}
