import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { FRESH_LIST, FRESH_VIEW } from '@/shared/lib/freshness';
import type { RowId } from '@/shared/lib/new-rows';
import type { StockCountAdjustMode } from '@/shared/types';
import { dropNew, markNew } from '@/stores/new-rows';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    stockApi,
    stockCountApi,
    stockMovementApi,
    stockRequestApi,
    type StockItemPageParams,
    type StockItemPayload,
    type StockMovementPayload,
    type StockRequestPayload,
} from '../api/stockApi';

const ITEMS = ['stock-items'] as const;
const SUMMARY = ['stock-summary'] as const;
const MOVEMENTS = ['stock-movements'] as const;
const REQUESTS = ['stock-requests'] as const;
const COUNTS = ['stock-counts'] as const;

// Where a just-created row is read when the current page does not hold it
export const NEW_ITEM_DETAIL = { key: (id: RowId) => [...ITEMS, 'detail', id], fetch: (id: RowId) => stockApi.get(Number(id)) };
export const NEW_MOVEMENT_DETAIL = { key: (id: RowId) => [...MOVEMENTS, 'detail', id], fetch: (id: RowId) => stockMovementApi.get(Number(id)) };
export const NEW_REQUEST_DETAIL = { key: (id: RowId) => [...REQUESTS, 'detail', id], fetch: (id: RowId) => stockRequestApi.get(Number(id)) };

interface StockItemFilters {
    search?: string;
    category?: string;
    warehouse?: string;
    status?: string;
}

/** Full (filtered) item list for pickers/drawers — returns every matching item, not a page. */
export const useStockItems = (filters: StockItemFilters, enabled = true) =>
    useQuery({ queryKey: [...ITEMS, 'all', filters], queryFn: () => stockApi.list(filters), enabled, ...FRESH_LIST });

/** Server-paginated item list for the Stock items table (page/sort/filters handled by the API). */
export const useStockItemsPage = (params: StockItemPageParams, enabled = true) =>
    useQuery({
        queryKey: [...ITEMS, 'page', params],
        queryFn: () => stockApi.listPage(params),
        enabled,
        placeholderData: (prev) => prev,
        ...FRESH_VIEW,
    });

/** Dashboard aggregates (KPIs, min/max alerts, breakdowns). */
export const useStockSummary = (enabled = true) => useQuery({ queryKey: SUMMARY, queryFn: stockApi.summary, enabled, ...FRESH_VIEW });

/** Every serial known to the system — used to flag duplicates while receiving. */
export const useExistingSerials = (enabled = true) => useQuery({ queryKey: [...ITEMS, 'serials'], queryFn: stockApi.existingSerials, enabled });

/** A single stock item with its per-unit serials (for the detail view). */
export const useStockItem = (id: number | null, enabled = true) =>
    useQuery({ queryKey: [...ITEMS, 'detail', id], queryFn: () => stockApi.get(id as number), enabled: id !== null && enabled, ...FRESH_VIEW });

/** Full movement + serial-event history for one SKU (timeline / print view). */
export const useStockItemHistory = (id: number | null) =>
    useQuery({ queryKey: ['stock-item-history', id], queryFn: () => stockApi.history(id as number), enabled: id !== null, ...FRESH_VIEW });

/** Create/update/delete mutations; invalidate both list and summary. */
export function useStockItemMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    };

    return {
        create: useMutation({
            mutationFn: (p: StockItemPayload) => stockApi.create(p),
            onSuccess: (item) => {
                markNew('stock-items', item.id);
                inv();
            },
        }),
        update: useMutation({ mutationFn: (v: { id: number; payload: StockItemPayload }) => stockApi.update(v.id, v.payload), onSuccess: inv }),
        remove: useMutation({
            mutationFn: (id: number) => stockApi.remove(id),
            onSuccess: (_, id) => {
                dropNew('stock-items', id);
                inv();
            },
        }),
    };
}

/**
 * Server-paginated movement log, optionally filtered by type. Returns { data, meta }.
 * Pass enabled=false to skip the fetch (e.g. when the caller lacks view_events permission).
 */
export const useStockMovements = (params: { type?: string; search?: string; page?: number; per_page?: number } = {}, enabled = true) =>
    useQuery({
        queryKey: [...MOVEMENTS, params],
        queryFn: () => stockMovementApi.list(params),
        enabled,
        placeholderData: (prev) => prev,
        ...FRESH_VIEW,
    });

/** Serial codes tied to a single movement (for the movement detail dialog). */
export const useMovementSerials = (id: number | null, enabled = true) =>
    useQuery({
        queryKey: [...MOVEMENTS, 'serials', id],
        queryFn: () => stockMovementApi.serials(id as number),
        enabled: id !== null && enabled,
        ...FRESH_VIEW,
    });

/** Record a movement; refresh movements, items and summary (stock changed). */
export function useRecordMovement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (p: StockMovementPayload) => stockMovementApi.create(p),
        onSuccess: (movement) => {
            markNew('stock-movements', movement.id);
            qc.invalidateQueries({ queryKey: MOVEMENTS });
            qc.invalidateQueries({ queryKey: ITEMS });
            qc.invalidateQueries({ queryKey: SUMMARY });
        },
    });
}

/** Server-paginated stock requests visible to the current user. meta carries pending/outstanding totals. */
export const useStockRequests = (params: { page?: number; per_page?: number; status?: string; search?: string } = {}, enabled = true) =>
    useQuery({
        queryKey: [...REQUESTS, params],
        queryFn: () => stockRequestApi.list(params),
        enabled,
        placeholderData: (prev) => prev,
        ...FRESH_VIEW,
    });

/** Request workflow mutations (submit / approve / reject / fulfill). */
export function useStockRequestActions() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: REQUESTS });
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: MOVEMENTS });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    };
    return {
        submit: useMutation({
            mutationFn: (p: StockRequestPayload) => stockRequestApi.create(p),
            onSuccess: (request) => {
                markNew('stock-requests', request.id);
                inv();
            },
        }),
        approve: useMutation({ mutationFn: (id: number) => stockRequestApi.approve(id), onSuccess: inv }),
        reject: useMutation({ mutationFn: (id: number) => stockRequestApi.reject(id), onSuccess: inv }),
        cancel: useMutation({ mutationFn: (id: number) => stockRequestApi.cancel(id), onSuccess: inv }),
        fulfill: useMutation({
            mutationFn: (v: { id: number; serialIds?: number[]; allocations?: { warehouse: string; qty: number }[] }) =>
                stockRequestApi.fulfill(v.id, { serial_ids: v.serialIds, allocations: v.allocations }),
            onSuccess: inv,
        }),
    };
}

/** Server-paginated stock-count sessions (newest first). meta carries the draft total. */
export const useStockCounts = (params: { page?: number; per_page?: number } = {}, enabled = true) =>
    useQuery({ queryKey: [...COUNTS, params], queryFn: () => stockCountApi.list(params), enabled, placeholderData: (prev) => prev, ...FRESH_VIEW });

/** A single count session with its lines (for the count sheet). */
export const useStockCount = (id: number | null, enabled = true) =>
    useQuery({ queryKey: [...COUNTS, id], queryFn: () => stockCountApi.get(id as number), enabled: id !== null && enabled, ...FRESH_VIEW });

/** Count-session mutations (open / save / commit / cancel); refresh counts, items, movements, summary. */
export function useStockCountMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: COUNTS });
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: MOVEMENTS });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
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
