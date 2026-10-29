import { ensureCsrf, http } from '@/shared/lib/http';
import type {
    ApiEnvelope,
    CountReason,
    IssueResult,
    LotDetail,
    LotLookup,
    MovementLots,
    RequestTrail,
    ReturnableRequest,
    StockCount,
    StockItem,
    StockItemHistory,
    StockMovement,
    StockRequest,
    StockSummary,
} from '@/shared/types';

/** Receive: a quantity (or one serial per unit) from a vendor into a warehouse. */
export interface ReceivePayload {
    type: 'receive';
    stock_item_id: number;
    qty: number;
    from_label?: string;
    to_label?: string;
    reference?: string;
    notes?: string;
    /** Per-unit serials captured for a serialized receive. */
    serials?: string[];
    /** Unit cost for this received lot (FIFO costing). */
    unit_cost?: number;
}

/** Return against a fulfilled request: lots for a non-serial item, the request's serials for a serial one. */
export interface ReturnPayload {
    type: 'return';
    stock_item_id: number;
    stock_request_id: number;
    lots?: { lot_id: number; qty: number }[];
    serial_ids?: number[];
    notes?: string;
}

/** Transfer: whole lots from one warehouse to another. */
export interface TransferPayload {
    type: 'transfer';
    stock_item_id: number;
    from_label: string;
    to_label: string;
    lot_ids: number[];
    notes?: string;
}

export type StockMovementPayload = ReceivePayload | ReturnPayload | TransferPayload;

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
    min_stock: number | null;
    max_stock: number | null;
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
    list: (params: { type?: string; stock_item_id?: number; search?: string; page?: number; per_page?: number }) =>
        http.get<Paginated<StockMovement>>('/stock-movements', { params }).then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockMovement>>(`/stock-movements/${id}`).then((r) => r.data.data),
    serials: (id: number) => http.get<ApiEnvelope<string[]>>(`/stock-movements/${id}/serials`).then((r) => r.data.data),
    create: (payload: StockMovementPayload) => mutate<StockMovement>('post', '/stock-movements', payload),
};

export const stockRequestApi = {
    list: (params?: { page?: number; per_page?: number; status?: string; search?: string }) =>
        http.get<Paginated<StockRequest, StockRequestPageMeta>>('/stock-requests', { params }).then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockRequest>>(`/stock-requests/${id}`).then((r) => r.data.data),
    create: (payload: StockRequestPayload) => mutate<StockRequest>('post', '/stock-requests', payload),
    approve: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/approve`),
    reject: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/reject`),
    cancel: (id: number) => mutate<StockRequest>('post', `/stock-requests/${id}/cancel`),
    // Fulfil answers with the request plus the issue sheet at the top level, so it reads the whole body
    fulfill: async (
        id: number,
        body?: { serial_ids?: number[]; allocations?: { warehouse: string; qty: number }[]; from_warehouse?: string },
    ): Promise<{ request: StockRequest; issue: IssueResult }> => {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<StockRequest> & { issue: IssueResult }>(`/stock-requests/${id}/fulfill`, body);
        return { request: data.data, issue: data.issue };
    },
    trail: (id: number) => http.get<ApiEnvelope<RequestTrail>>(`/stock-requests/${id}/trail`).then((r) => r.data.data),
    returnable: (stockItemId: number, search?: string, requestId?: number) =>
        http
            .get<ApiEnvelope<ReturnableRequest[]>>('/stock-requests/returnable', {
                params: { stock_item_id: stockItemId, search: search || undefined, stock_request_id: requestId },
            })
            .then((r) => r.data.data),
    issuePdfUrl: (requestId: number) => `/pdf/stock-requests/${requestId}/issue`,
};

export const stockLotApi = {
    get: (lotNo: string) => http.get<ApiEnvelope<LotDetail>>(`/stock-lots/${encodeURIComponent(lotNo)}`).then((r) => r.data.data),
    lookup: (code: string) => http.get<ApiEnvelope<LotLookup>>('/stock-lots/lookup', { params: { code } }).then((r) => r.data.data),
    qrUrl: (lotNo: string) => `/api/stock-lots/${encodeURIComponent(lotNo)}/qr`,
    labelsPdfUrl: (lotNo: string, copies = 1) => `/pdf/stock-lots/${encodeURIComponent(lotNo)}/labels?copies=${copies}`,
};

/** A movement's lots: what its document drew, returned or moved. */
export const getMovementLots = (id: number) => http.get<ApiEnvelope<MovementLots>>(`/stock-movements/${id}/lots`).then((r) => r.data.data);

export const getLot = stockLotApi.get;
export const lookupLot = stockLotApi.lookup;
export const getRequestTrail = stockRequestApi.trail;
export const getReturnableRequests = stockRequestApi.returnable;
export const lotQrUrl = stockLotApi.qrUrl;
export const lotLabelsPdfUrl = stockLotApi.labelsPdfUrl;
export const issuePdfUrl = stockRequestApi.issuePdfUrl;

/** One line's changes in a count save; only the keys present are touched. */
export interface LinePatch {
    counted_qty?: number | null;
    reason?: CountReason | null;
    reason_note?: string | null;
    missing_serial_ids?: number[];
    found_serial_ids?: number[];
}

export const stockCountApi = {
    list: (params?: { page?: number; per_page?: number }) =>
        http.get<Paginated<StockCount, StockCountPageMeta>>('/stock-counts', { params }).then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<StockCount>>(`/stock-counts/${id}`).then((r) => r.data.data),
    open: (body: { warehouse_id: number; stock_item_ids: number[] }) => mutate<StockCount>('post', '/stock-counts', body),
    saveLines: (id: number, lines: Record<number, LinePatch>) => mutate<StockCount>('put', `/stock-counts/${id}`, { lines }),
    commit: (id: number) => mutate<StockCount>('post', `/stock-counts/${id}/commit`),
    recount: (id: number) => mutate<StockCount>('post', `/stock-counts/${id}/recount`),
    cancel: (id: number) => mutate<void>('delete', `/stock-counts/${id}`),
    pdfUrl: (id: number) => `/pdf/stock-counts/${id}`,
};
