import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { FRESH_MS } from '@/shared/lib/freshness';
import type { RequestSourceOption } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestApi, type RequestListParams, type RequestManagedChoice, type SubmitRequestPayload } from '../api/requestApi';

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
        staleTime: FRESH_MS,
        refetchOnWindowFocus: true,
        enabled,
    });

export const requestFieldOptionsKey = (type: string, field: string) => ['request-field-options', type, field] as const;

/** One list of the New Request form: the catalog's rows first, reloaded only when its dropdown opens. */
export const useRequestFieldOptions = <T extends RequestSourceOption | RequestManagedChoice>(
    type: string,
    field: string,
    initial: T[] | undefined,
    initialUpdatedAt: number,
) =>
    useQuery({
        queryKey: requestFieldOptionsKey(type, field),
        queryFn: () => requestApi.fieldOptions<T>(type, field),
        initialData: initial,
        initialDataUpdatedAt: initialUpdatedAt,
        staleTime: FRESH_MS,
        enabled: false,
    });

export function useRequestMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['requests-list'] });
        qc.invalidateQueries({ queryKey: ['request'] });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    };
    return {
        submit: useMutation({
            mutationFn: (v: { payload: SubmitRequestPayload; onProgress?: (percent: number) => void }) => requestApi.submit(v.payload, v.onProgress),
            onSuccess: invalidate,
        }),
        approve: useMutation({ mutationFn: (v: { id: number; note?: string }) => requestApi.approve(v.id, v.note), onSuccess: invalidate }),
        reject: useMutation({ mutationFn: (v: { id: number; note: string }) => requestApi.reject(v.id, v.note), onSuccess: invalidate }),
        complete: useMutation({ mutationFn: (id: number) => requestApi.complete(id), onSuccess: invalidate }),
        cancel: useMutation({ mutationFn: (v: { id: number; reason: string }) => requestApi.cancel(v.id, v.reason), onSuccess: invalidate }),
    };
}
