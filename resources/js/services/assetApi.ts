import type { ApiEnvelope, Asset, AssetSummary, AssetTransferLog } from '@/types';
import { ensureCsrf, http } from './http';

export interface AssetPageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface AssetPageResponse {
    data: Asset[];
    meta: AssetPageMeta;
}

export interface AssetPayload {
    tag?: string | null;
    type: Asset['type'];
    brand?: string | null;
    model: string;
    serial?: string | null;
    source: Asset['source'];
    status?: Asset['status'];
    owner?: string | null;
    department?: string | null;
    location?: string | null;
    value: number;
    supplier?: string | null;
    purchase_date?: string | null;
    warranty_end?: string | null;
    contract_id?: number | null;
    lease_start?: string | null;
    lease_end?: string | null;
    notes?: string | null;
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const assetApi = {
    list: (params: { page: number; per_page: number; search?: string; type?: string; source?: string; status?: string }) =>
        http.get<AssetPageResponse>('/assets', { params }).then((r) => r.data),
    summary: () => http.get<AssetSummary>('/assets/summary').then((r) => r.data),
    transfers: () => http.get<{ data: AssetTransferLog[] }>('/assets/transfers').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Asset>>(`/assets/${id}`).then((r) => r.data.data),
    create: (payload: AssetPayload) => mutate<Asset>('post', '/assets', payload),
    update: (id: number, payload: AssetPayload) => mutate<Asset>('put', `/assets/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/assets/${id}`),
    transfer: (id: number, owner: string, reason?: string) => mutate<Asset>('post', `/assets/${id}/transfer`, { owner, reason }),
    accept: (id: number) => mutate<Asset>('post', `/assets/${id}/accept`),
    receive: (id: number) => mutate<Asset>('post', `/assets/${id}/receive`),
    toggleMaintenance: (id: number) => mutate<Asset>('post', `/assets/${id}/maintenance`),
    toStock: (id: number, body: { sku: string; warehouse?: string; qty: number; reason?: string }) => mutate<Asset>('post', `/assets/${id}/to-stock`, body),
    bulk: async (ids: number[], op: 'maintenance' | 'writeoff', reason?: string): Promise<{ updated: number }> => {
        await ensureCsrf();
        const { data } = await http.post<{ updated: number }>('/assets/bulk', { ids, op, reason });
        return data;
    },
};
