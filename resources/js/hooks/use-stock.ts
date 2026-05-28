import {
    stockApi,
    stockMovementApi,
    stockRequestApi,
    type StockItemPayload,
    type StockMovementPayload,
    type StockRequestPayload,
} from '@/services/stockApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const ITEMS = ['stock-items'] as const;
const SUMMARY = ['stock-summary'] as const;
const MOVEMENTS = ['stock-movements'] as const;
const REQUESTS = ['stock-requests'] as const;

interface StockItemFilters {
    search?: string;
    category?: string;
    warehouse?: string;
    status?: string;
}

/** Stock item list, scoped by the active filters. */
export const useStockItems = (filters: StockItemFilters) =>
    useQuery({ queryKey: [...ITEMS, filters], queryFn: () => stockApi.list(filters) });

/** Dashboard aggregates (KPIs, min/max alerts, breakdowns). */
export const useStockSummary = () => useQuery({ queryKey: SUMMARY, queryFn: stockApi.summary });

/** Create/update/delete mutations; invalidate both list and summary. */
export function useStockItemMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: SUMMARY });
    };

    return {
        create: useMutation({ mutationFn: (p: StockItemPayload) => stockApi.create(p), onSuccess: inv }),
        update: useMutation({ mutationFn: (v: { id: number; payload: StockItemPayload }) => stockApi.update(v.id, v.payload), onSuccess: inv }),
        remove: useMutation({ mutationFn: (id: number) => stockApi.remove(id), onSuccess: inv }),
    };
}

/** Movement log, optionally filtered by type. */
export const useStockMovements = (type?: string) =>
    useQuery({ queryKey: [...MOVEMENTS, type ?? 'all'], queryFn: () => stockMovementApi.list({ type }) });

/** Record a movement; refresh movements, items and summary (stock changed). */
export function useRecordMovement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (p: StockMovementPayload) => stockMovementApi.create(p),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: MOVEMENTS });
            qc.invalidateQueries({ queryKey: ITEMS });
            qc.invalidateQueries({ queryKey: SUMMARY });
        },
    });
}

/** Stock requests visible to the current user. */
export const useStockRequests = () => useQuery({ queryKey: REQUESTS, queryFn: stockRequestApi.list });

/** Request workflow mutations (submit / approve / reject / fulfill). */
export function useStockRequestActions() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: REQUESTS });
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: MOVEMENTS });
    };
    return {
        submit: useMutation({ mutationFn: (p: StockRequestPayload) => stockRequestApi.create(p), onSuccess: inv }),
        approve: useMutation({ mutationFn: (id: number) => stockRequestApi.approve(id), onSuccess: inv }),
        reject: useMutation({ mutationFn: (id: number) => stockRequestApi.reject(id), onSuccess: inv }),
        fulfill: useMutation({ mutationFn: (id: number) => stockRequestApi.fulfill(id), onSuccess: inv }),
    };
}
