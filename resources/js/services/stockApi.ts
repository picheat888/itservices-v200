import type { ApiEnvelope, StockCount, StockItem, StockMovement, StockMovementType, StockRequest, StockSummary } from '@/types';
import { ensureCsrf, http } from './http';

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
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    unit: string;
    min_stock: number;
    max_stock: number;
    warehouse?: string | null;
    supplier?: string | null;
    warranty?: string | null;
}

interface StockItemListParams {
    search?: string;
    category?: string;
    warehouse?: string;
    status?: string;
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const stockApi = {
    list: (params: StockItemListParams) => http.get<ApiEnvelope<StockItem[]>>('/stock-items', { params }).then((r) => r.data.data),
    summary: () => http.get<StockSummary>('/stock-items/summary').then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockItem>>(`/stock-items/${id}`).then((r) => r.data.data),
    existingSerials: () => http.get<ApiEnvelope<string[]>>('/stock-items/serials').then((r) => r.data.data),
    create: (payload: StockItemPayload) => mutate<StockItem>('post', '/stock-items', payload),
    update: (id: number, payload: StockItemPayload) => mutate<StockItem>('put', `/stock-items/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/stock-items/${id}`),
};

export const stockMovementApi = {
    list: (params: { type?: string }) => http.get<ApiEnvelope<StockMovement[]>>('/stock-movements', { params }).then((r) => r.data.data),
    create: (payload: StockMovementPayload) => mutate<StockMovement>('post', '/stock-movements', payload),
};

export const stockRequestApi = {
    list: () => http.get<ApiEnvelope<StockRequest[]>>('/stock-requests').then((r) => r.data.data),
    create: (payload: StockRequestPayload) => mutate<StockRequest>('post', '/stock-requests', payload),
    approve: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/approve`),
    reject: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/reject`),
    fulfill: (id: number, body?: { serial_ids?: number[] }) => mutate<StockRequest>('post', `/stock-requests/${id}/fulfill`, body),
};

export const stockCountApi = {
    list: () => http.get<ApiEnvelope<StockCount[]>>('/stock-counts').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<StockCount>>(`/stock-counts/${id}`).then((r) => r.data.data),
    open: (body: { warehouse?: string | null; category?: string | null; note?: string | null; stock_item_ids?: number[] }) =>
        mutate<StockCount>('post', '/stock-counts', body),
    saveCounts: (id: number, counts: Record<number, number | null>) => mutate<StockCount>('put', `/stock-counts/${id}`, { counts }),
    commit: (id: number) => mutate<StockCount>('post', `/stock-counts/${id}/commit`, {}),
    cancel: (id: number) => mutate<void>('delete', `/stock-counts/${id}`),
};
