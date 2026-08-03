import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestApi, type RequestListParams, type SubmitRequestPayload } from '../api/requestApi';

/** Server-paginated request list (KPI meta rides along). */
export const useRequests = (params: RequestListParams, enabled = true) =>
    useQuery({
        queryKey: ['requests-list', params],
        queryFn: () =>
            requestApi.list({
                ...params,
                search: params.search || undefined,
                status: params.status || undefined,
                type: params.type || undefined,
            }),
        placeholderData: (prev) => prev,
        enabled,
    });

/** One full request (approvals + ticket) — powers the detail dialog / deep links. */
export const useRequest = (id: number | null) =>
    useQuery({
        queryKey: ['request', id],
        queryFn: () => requestApi.get(id as number),
        enabled: id != null,
    });

/** The New Request catalog: per-type field schemas, routes, and select sources. */
export const useRequestOptions = (enabled = true) =>
    useQuery({
        queryKey: ['request-options'],
        queryFn: requestApi.options,
        staleTime: 5 * 60_000,
        enabled,
    });

export function useRequestMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['requests-list'] });
        qc.invalidateQueries({ queryKey: ['request'] });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    };
    return {
        submit: useMutation({ mutationFn: (p: SubmitRequestPayload) => requestApi.submit(p), onSuccess: invalidate }),
        approve: useMutation({ mutationFn: (v: { id: number; note?: string }) => requestApi.approve(v.id, v.note), onSuccess: invalidate }),
        reject: useMutation({ mutationFn: (v: { id: number; note: string }) => requestApi.reject(v.id, v.note), onSuccess: invalidate }),
        fulfill: useMutation({ mutationFn: (id: number) => requestApi.fulfill(id), onSuccess: invalidate }),
        cancel: useMutation({ mutationFn: (id: number) => requestApi.cancel(id), onSuccess: invalidate }),
    };
}
