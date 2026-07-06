import type { ApiEnvelope, Asset, AssetSummary, AssetTransferLog, ContractLinkableAsset } from '@/shared/types';
import { ensureCsrf, http } from '@/shared/lib/http';

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
    nickname?: string | null;
    type: Asset['type'];
    brand?: string | null;
    model: string;
    serial?: string | null;
    source: Asset['source'];
    status?: Asset['status'];
    warehouse?: string | null;
    // Sent only for purchased assets; rented assets derive value from the contract.
    value?: number | null;
    supplier?: string | null;
    purchase_date?: string | null;
    warranty_end?: string | null;
    warranty_lifetime?: boolean;
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
    list: (params: { page: number; per_page: number; search?: string; type?: string; source?: string; status?: string; warehouse?: string }) =>
        http.get<AssetPageResponse>('/assets', { params }).then((r) => r.data),
    summary: () => http.get<AssetSummary>('/assets/summary').then((r) => r.data),
    // Assets selectable in the contract form's link picker (free assets + this contract's own).
    linkable: (contractId?: number) =>
        http
            .get<ApiEnvelope<ContractLinkableAsset[]>>('/assets/linkable', { params: contractId ? { contract_id: contractId } : {} })
            .then((r) => r.data.data),
    transfers: () => http.get<{ data: AssetTransferLog[] }>('/assets/transfers').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Asset>>(`/assets/${id}`).then((r) => r.data.data),
    // Assets assigned to the current user (employee self-service; no assets.view needed).
    mine: () => http.get<ApiEnvelope<Asset[]>>('/assets/mine').then((r) => r.data.data),
    create: (payload: AssetPayload) => mutate<Asset>('post', '/assets', payload),
    update: (id: number, payload: AssetPayload) => mutate<Asset>('put', `/assets/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/assets/${id}`),
    transfer: (id: number, owner: string, location: string, reason?: string) =>
        mutate<Asset>('post', `/assets/${id}/transfer`, { owner, location, reason }),
    accept: (id: number) => mutate<Asset>('post', `/assets/${id}/accept`),
    requestReturn: (id: number, reason?: string) => mutate<Asset>('post', `/assets/${id}/request-return`, reason ? { reason } : {}),
    receive: (id: number, warehouse?: string) => mutate<Asset>('post', `/assets/${id}/receive`, warehouse ? { warehouse } : {}),
    bulk: async (ids: number[], op: 'writeoff', reason?: string): Promise<{ updated: number }> => {
        await ensureCsrf();
        const { data } = await http.post<{ updated: number }>('/assets/bulk', { ids, op, reason });
        return data;
    },
};
