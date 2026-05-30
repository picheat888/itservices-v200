import {
    stockApi,
    stockCountApi,
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
const COUNTS = ['stock-counts'] as const;

interface StockItemFilters {
    search?: string;
    category?: string;
    warehouse?: string;
    status?: string;
}

/** Stock item list, scoped by the active filters. */
export const useStockItems = (filters: StockItemFilters) => useQuery({ queryKey: [...ITEMS, filters], queryFn: () => stockApi.list(filters) });

/** Dashboard aggregates (KPIs, min/max alerts, breakdowns). */
export const useStockSummary = () => useQuery({ queryKey: SUMMARY, queryFn: stockApi.summary });

/** Every serial known to the system — used to flag duplicates while receiving. */
export const useExistingSerials = () => useQuery({ queryKey: [...ITEMS, 'serials'], queryFn: stockApi.existingSerials });

/** A single stock item with its per-unit serials (for the detail view). */
export const useStockItem = (id: number | null) =>
    useQuery({ queryKey: [...ITEMS, 'detail', id], queryFn: () => stockApi.get(id as number), enabled: id !== null });

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
        fulfill: useMutation({
            mutationFn: (v: { id: number; serialIds?: number[] }) => stockRequestApi.fulfill(v.id, { serial_ids: v.serialIds }),
            onSuccess: inv,
        }),
    };
}

/** Recent stock-count sessions (newest first). */
export const useStockCounts = (enabled = true) => useQuery({ queryKey: COUNTS, queryFn: stockCountApi.list, enabled });

/** A single count session with its lines (for the count sheet). */
export const useStockCount = (id: number | null) =>
    useQuery({ queryKey: [...COUNTS, id], queryFn: () => stockCountApi.get(id as number), enabled: id !== null });

/** Count-session mutations (open / save / commit / cancel); refresh counts, items, movements, summary. */
export function useStockCountMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: COUNTS });
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: MOVEMENTS });
        qc.invalidateQueries({ queryKey: SUMMARY });
    };
    return {
        open: useMutation({
            mutationFn: (b: { warehouse?: string | null; category?: string | null; note?: string | null; stock_item_ids?: number[] }) =>
                stockCountApi.open(b),
            onSuccess: inv,
        }),
        save: useMutation({
            mutationFn: (v: { id: number; counts: Record<number, number | null> }) => stockCountApi.saveCounts(v.id, v.counts),
            onSuccess: inv,
        }),
        commit: useMutation({ mutationFn: (id: number) => stockCountApi.commit(id), onSuccess: inv }),
        cancel: useMutation({ mutationFn: (id: number) => stockCountApi.cancel(id), onSuccess: inv }),
    };
}
