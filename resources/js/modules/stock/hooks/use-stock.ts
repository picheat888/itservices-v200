import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { FRESH_LIST, FRESH_MS, FRESH_VIEW } from '@/shared/lib/freshness';
import type { RowId } from '@/shared/lib/new-rows';
import type { StockMovement, StockRequest } from '@/shared/types';
import { dropNew, markNew } from '@/stores/new-rows';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getLot,
    getMovementLots,
    getRequestTrail,
    getReturnableRequests,
    stockApi,
    stockCountApi,
    stockMovementApi,
    stockRequestApi,
    type LinePatch,
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
const LOTS = ['stock-lots'] as const;

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

/** Lots one movement's document touched (movement detail dialog). */
export const useMovementLots = (id: number | null, enabled = true) =>
    useQuery({ queryKey: [...MOVEMENTS, 'lots', id], queryFn: () => getMovementLots(id as number), enabled: id !== null && enabled, ...FRESH_VIEW });

/** One lot's page: tiles, check and ledger entries. */
export const useLot = (lotNo: string | null, enabled = true) =>
    useQuery({ queryKey: [...LOTS, lotNo], queryFn: () => getLot(lotNo as string), enabled: lotNo !== null && enabled, ...FRESH_VIEW });

/** A request's issue and returns with their lots. */
export const useRequestTrail = (id: number | null, enabled = true) =>
    useQuery({ queryKey: [...REQUESTS, 'trail', id], queryFn: () => getRequestTrail(id as number), enabled: id !== null && enabled, ...FRESH_VIEW });

/** One request (the return form opened from it reads its item and reference). */
export const useStockRequest = (id: number | null, enabled = true) =>
    useQuery({
        queryKey: NEW_REQUEST_DETAIL.key(id ?? 0),
        queryFn: () => stockRequestApi.get(id as number),
        enabled: id !== null && enabled,
        ...FRESH_VIEW,
    });

const RETURNABLE = [...REQUESTS, 'returnable'] as const;

/** Fulfilled requests of an item with something left to return (the return form's picker); `requestId` asks for that one only. */
export const useReturnableRequests = (itemId: number | null, search: string, enabled = true, requestId?: number) =>
    useQuery({
        queryKey: [...RETURNABLE, itemId, search, requestId ?? null],
        queryFn: () => getReturnableRequests(itemId as number, search, requestId),
        enabled: itemId !== null && enabled,
        placeholderData: (prev) => prev,
        ...FRESH_VIEW,
    });

/** After a refused return: drop the cached returnable lists and read the chosen request again (null = nothing left). */
export function useReloadReturnable() {
    const qc = useQueryClient();
    return async (itemId: number, requestId: number) => {
        await qc.invalidateQueries({ queryKey: RETURNABLE });
        const rows = await qc.fetchQuery({
            queryKey: [...RETURNABLE, itemId, '', requestId],
            queryFn: () => getReturnableRequests(itemId, '', requestId),
        });
        return rows.find((r) => r.id === requestId) ?? null;
    };
}

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
            qc.invalidateQueries({ queryKey: LOTS });
            qc.invalidateQueries({ queryKey: REQUESTS });
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
        qc.invalidateQueries({ queryKey: LOTS });
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

/** Reads what a detail dialog shows while its row is only pointed at, so the dialog opens filled; fresh data is not asked again. */
export function useStockPrefetch() {
    const qc = useQueryClient();
    // A failed read stays quiet and is not retried; the dialog asks again when it opens
    const read = (queryKey: readonly unknown[], queryFn: () => Promise<unknown>) =>
        void qc.prefetchQuery({ queryKey, queryFn, staleTime: FRESH_MS, retry: false, meta: { quietServerError: true } });
    return {
        request: (r: Pick<StockRequest, 'id' | 'status' | 'stock_item_id'>, canViewStock: boolean) => {
            read(NEW_REQUEST_DETAIL.key(r.id), () => stockRequestApi.get(r.id));
            if (r.status === 'fulfilled') read([...REQUESTS, 'trail', r.id], () => getRequestTrail(r.id));
            if (canViewStock && (r.status === 'pending' || r.status === 'approved')) {
                read([...ITEMS, 'detail', r.stock_item_id], () => stockApi.get(r.stock_item_id));
            }
        },
        movement: (m: Pick<StockMovement, 'id' | 'type'>) => {
            read([...MOVEMENTS, 'serials', m.id], () => stockMovementApi.serials(m.id));
            if (m.type === 'receive' || m.type === 'issue' || m.type === 'return') read([...MOVEMENTS, 'lots', m.id], () => getMovementLots(m.id));
        },
        count: (id: number) => read([...COUNTS, id], () => stockCountApi.get(id)),
    };
}

/** Count-session mutations (open / save / commit / recount / cancel); refresh counts, items, movements, summary. */
export function useStockCountMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: COUNTS });
        qc.invalidateQueries({ queryKey: ITEMS });
        qc.invalidateQueries({ queryKey: MOVEMENTS });
        qc.invalidateQueries({ queryKey: SUMMARY });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    };
    // Commit and recount move stock: Lot balances and what requests can still return change too
    const invStock = () => {
        inv();
        qc.invalidateQueries({ queryKey: LOTS });
        qc.invalidateQueries({ queryKey: REQUESTS });
    };
    return {
        open: useMutation({
            mutationFn: (b: { warehouse_id: number; stock_item_ids: number[] }) => stockCountApi.open(b),
            onSuccess: inv,
        }),
        save: useMutation({
            mutationFn: (v: { id: number; lines: Record<number, LinePatch> }) => stockCountApi.saveLines(v.id, v.lines),
            onSuccess: inv,
        }),
        commit: useMutation({ mutationFn: (id: number) => stockCountApi.commit(id), onSuccess: invStock }),
        recount: useMutation({ mutationFn: (id: number) => stockCountApi.recount(id), onSuccess: invStock }),
        cancel: useMutation({ mutationFn: (id: number) => stockCountApi.cancel(id), onSuccess: inv }),
    };
}
