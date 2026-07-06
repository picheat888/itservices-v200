import type { ApiEnvelope, StockCount, StockCountAdjustMode, StockItem, StockItemHistory, StockMovement, StockMovementType, StockRequest, StockSummary } from '@/shared/types';
import { ensureCsrf, http } from '@/shared/lib/http';

export interface StockMovementPayload {
    type: StockMovementType;
    stock_item_id: number;
    qty: number;
    from_label?: string | null;
    to_label?: string | null;
    reference?: string | null;
    notes?: string | null;
    /** Per-unit serials captured for a serialized receive. */
    serials?: string[];
    /** Existing serial ids being issued out for a serialized issue. */
    serial_ids?: number[];
    /** Unit cost for this received lot (FIFO costing). */
    unit_cost?: number;
}

export interface StockRequestPayload {
    stock_item_id: number;
    qty: number;
    reason: string;
}

export interface StockItemPayload {
    sku: string;
    name: string;
    serial?: string | null;
    track_serial?: boolean;
    category_id: number | null;
    brand_id: number | null;
    model_id: number | null;
    unit_id: number | null;
    min_stock: number;
    max_stock: number;
    warranty_type_id: number | null;
}

/** Standard server-pagination meta returned by the Stock list endpoints. */
export interface PageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface Paginated<T, M = PageMeta> {
    data: T[];
    meta: M;
}

interface StockItemListParams {
    search?: string;
    category?: string;
    warehouse?: string;
    status?: string;
}

/** Items table params: filters + server-side pagination & sort. */
export interface StockItemPageParams extends StockItemListParams {
    page?: number;
    per_page?: number;
    sort?: string;
}

export type StockRequestPageMeta = PageMeta & { pending: number; outstanding: number };
export type StockCountPageMeta = PageMeta & { draft: number };

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const stockApi = {
    // Full (filtered) item list for pickers/drawers — `all=1` bypasses server pagination.
    list: (params: StockItemListParams) =>
        http.get<ApiEnvelope<StockItem[]>>('/stock-items', { params: { ...params, all: 1 } }).then((r) => r.data.data),
    // Server-paginated item list for the Stock items table.
    listPage: (params: StockItemPageParams) => http.get<Paginated<StockItem>>('/stock-items', { params }).then((r) => r.data),
    summary: () => http.get<StockSummary>('/stock-items/summary').then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockItem>>(`/stock-items/${id}`).then((r) => r.data.data),
    existingSerials: () => http.get<ApiEnvelope<string[]>>('/stock-items/serials').then((r) => r.data.data),
    history: (id: number) => http.get<ApiEnvelope<StockItemHistory>>(`/stock-items/${id}/history`).then((r) => r.data.data),
    create: (payload: StockItemPayload) => mutate<StockItem>('post', '/stock-items', payload),
    update: (id: number, payload: StockItemPayload) => mutate<StockItem>('put', `/stock-items/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/stock-items/${id}`),
};

export const stockMovementApi = {
    list: (params: { type?: string; stock_item_id?: number; page?: number; per_page?: number }) =>
        http.get<Paginated<StockMovement>>('/stock-movements', { params }).then((r) => r.data),
    serials: (id: number) => http.get<ApiEnvelope<string[]>>(`/stock-movements/${id}/serials`).then((r) => r.data.data),
    create: (payload: StockMovementPayload) => mutate<StockMovement>('post', '/stock-movements', payload),
};

export const stockRequestApi = {
    list: (params?: { page?: number; per_page?: number }) =>
        http.get<Paginated<StockRequest, StockRequestPageMeta>>('/stock-requests', { params }).then((r) => r.data),
    create: (payload: StockRequestPayload) => mutate<StockRequest>('post', '/stock-requests', payload),
    approve: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/approve`),
    reject: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/reject`),
    fulfill: (id: number, body?: { serial_ids?: number[]; allocations?: { warehouse: string; qty: number }[]; from_warehouse?: string }) =>
        mutate<StockRequest>('post', `/stock-requests/${id}/fulfill`, body),
};

export const stockCountApi = {
    list: (params?: { page?: number; per_page?: number }) =>
        http.get<Paginated<StockCount, StockCountPageMeta>>('/stock-counts', { params }).then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockCount>>(`/stock-counts/${id}`).then((r) => r.data.data),
    open: (body: { warehouse?: string | null; category?: string | null; note?: string | null; stock_item_ids?: number[] }) =>
        mutate<StockCount>('post', '/stock-counts', body),
    saveCounts: (id: number, counts: Record<number, number | null>) => mutate<StockCount>('put', `/stock-counts/${id}`, { counts }),
    commit: (id: number, mode: StockCountAdjustMode = 'auto', missingSerials?: Record<number, number[]>) =>
        mutate<StockCount>('post', `/stock-counts/${id}/commit`, { mode, missing_serials: missingSerials ?? {} }),
    cancel: (id: number) => mutate<void>('delete', `/stock-counts/${id}`),
};
