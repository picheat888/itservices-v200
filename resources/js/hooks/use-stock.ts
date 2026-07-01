import {
    stockApi,
    stockCountApi,
    stockMovementApi,
    stockRequestApi,
    type StockItemPageParams,
    type StockItemPayload,
    type StockMovementPayload,
    type StockRequestPayload,
} from '@/services/stockApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockCountAdjustMode } from '@/shared/types';

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

/** Full (filtered) item list for pickers/drawers — returns every matching item, not a page. */
export const useStockItems = (filters: StockItemFilters) => useQuery({ queryKey: [...ITEMS, 'all', filters], queryFn: () => stockApi.list(filters) });

/** Server-paginated item list for the Stock items table (page/sort/filters handled by the API). */
export const useStockItemsPage = (params: StockItemPageParams) =>
    useQuery({ queryKey: [...ITEMS, 'page', params], queryFn: () => stockApi.listPage(params), placeholderData: (prev) => prev });

/** Dashboard aggregates (KPIs, min/max alerts, breakdowns). */
export const useStockSummary = (enabled = true) => useQuery({ queryKey: SUMMARY, queryFn: stockApi.summary, enabled });

/** Every serial known to the system — used to flag duplicates while receiving. */
export const useExistingSerials = () => useQuery({ queryKey: [...ITEMS, 'serials'], queryFn: stockApi.existingSerials });

/** A single stock item with its per-unit serials (for the detail view). */
export const useStockItem = (id: number | null) =>
    useQuery({ queryKey: [...ITEMS, 'detail', id], queryFn: () => stockApi.get(id as number), enabled: id !== null });

/** Full movement + serial-event history for one SKU (timeline / print view). */
export const useStockItemHistory = (id: number | null) =>
    useQuery({ queryKey: ['stock-item-history', id], queryFn: () => stockApi.history(id as number), enabled: id !== null });

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

/**
 * Server-paginated movement log, optionally filtered by type. Returns { data, meta }.
 * Pass enabled=false to skip the fetch (e.g. when the caller lacks view_events permission).
 */
export const useStockMovements = (params: { type?: string; page?: number; per_page?: number } = {}, enabled = true) =>
    useQuery({ queryKey: [...MOVEMENTS, params], queryFn: () => stockMovementApi.list(params), enabled, placeholderData: (prev) => prev });

/** Serial codes tied to a single movement (for the movement detail dialog). */
export const useMovementSerials = (id: number | null) =>
    useQuery({ queryKey: [...MOVEMENTS, 'serials', id], queryFn: () => stockMovementApi.serials(id as number), enabled: id !== null });

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

/** Server-paginated stock requests visible to the current user. meta carries pending/outstanding totals. */
export const useStockRequests = (params: { page?: number; per_page?: number } = {}, enabled = true) =>
    useQuery({ queryKey: [...REQUESTS, params], queryFn: () => stockRequestApi.list(params), enabled, placeholderData: (prev) => prev });

/**
 * Combined "needs attention" count for the Stock sidebar badge: min/max alerts
 * (out + low + over + dead) + outstanding requests (pending/approved) + draft
 * count sessions. Pass enabled=false to skip the queries for users without stock access.
 */
export function useStockSidebarBadge(enabled = true): number {
    const { data: summary } = useStockSummary(enabled);
    const { data: requests } = useStockRequests({}, enabled);
    const { data: counts } = useStockCounts({}, enabled);

    const alerts = summary ? summary.out_count + summary.low_count + summary.over_count + summary.dead_count : 0;
    const openRequests = requests?.meta.outstanding ?? 0;
    const draftCounts = counts?.meta.draft ?? 0;

    return alerts + openRequests + draftCounts;
}

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
            mutationFn: (v: { id: number; serialIds?: number[]; allocations?: { warehouse: string; qty: number }[] }) =>
                stockRequestApi.fulfill(v.id, { serial_ids: v.serialIds, allocations: v.allocations }),
            onSuccess: inv,
        }),
    };
}

/** Server-paginated stock-count sessions (newest first). meta carries the draft total. */
export const useStockCounts = (params: { page?: number; per_page?: number } = {}, enabled = true) =>
    useQuery({ queryKey: [...COUNTS, params], queryFn: () => stockCountApi.list(params), enabled, placeholderData: (prev) => prev });

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
        commit: useMutation({
            mutationFn: (v: { id: number; mode: StockCountAdjustMode; missingSerials?: Record<number, number[]> }) =>
                stockCountApi.commit(v.id, v.mode, v.missingSerials),
            onSuccess: inv,
        }),
        cancel: useMutation({ mutationFn: (id: number) => stockCountApi.cancel(id), onSuccess: inv }),
    };
}
