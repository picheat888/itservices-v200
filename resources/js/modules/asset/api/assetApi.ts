import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, Asset, AssetSummary, AssetTransferLog, Contract, ContractLinkableAsset } from '@/shared/types';

/**
 * Why an employee cannot press Accept on a hand-over, keyed by employee id — the exceptions
 * only, so an id missing from the map is somebody who can. `no_account` means they have no
 * login at all; `no_permission` means they have one but it cannot open My Assets.
 */
export type RecipientReadiness = Record<number, 'no_account' | 'no_permission'>;
/** Minimal contract row for the rented-asset form picker (from /assets/contract-options). */
export interface AssetContractOption {
    id: number;
    code: string;
    vendor: string | null;
    details: string | null;
}

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
    asset_code?: string | null;
    tag?: string | null;
    category_id: number;
    brand_id?: number | null;
    model_id: number;
    serial?: string | null;
    source: Asset['source'];
    status?: Asset['status'];
    warehouse_id?: number | null;
    // Sent only for purchased assets; rented assets derive value from the contract.
    value?: number | null;
    vendor_id?: number | null;
    purchase_date?: string | null;
    warranty_end?: string | null;
    warranty_lifetime?: boolean;
    contract_id?: number | null;
    lease_start?: string | null;
    lease_end?: string | null;
    notes?: string | null;
}

export interface AssetTransferPayload {
    mode: 'employee' | 'shared';
    owner_employee_id?: number;
    owner_label?: string;
    location_id: number;
    reason?: string;
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
    // The contract linked to an asset (read-only "peek"); gated by assets.view, not contracts.view.
    getContract: (id: number) => http.get<ApiEnvelope<Contract>>(`/assets/${id}/contract`).then((r) => r.data.data),
    // Minimal contract list for the rented-asset form picker; gated by assets.register/edit.
    contractOptions: () => http.get<ApiEnvelope<AssetContractOption[]>>('/assets/contract-options').then((r) => r.data.data),
    // Employees who cannot confirm receipt themselves — warns the hand-over dialog. Gated by assets.transfer.
    recipientReadiness: () => http.get<ApiEnvelope<RecipientReadiness>>('/assets/recipient-readiness').then((r) => r.data.data),
    // Assets assigned to the current user (employee self-service; no assets.view needed).
    mine: () => http.get<ApiEnvelope<Asset[]>>('/assets/mine').then((r) => r.data.data),
    create: (payload: AssetPayload) => mutate<Asset>('post', '/assets', payload),
    update: (id: number, payload: AssetPayload) => mutate<Asset>('put', `/assets/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/assets/${id}`),
    transfer: (id: number, payload: AssetTransferPayload) => mutate<Asset>('post', `/assets/${id}/transfer`, payload),
    accept: (id: number) => mutate<Asset>('post', `/assets/${id}/accept`),
    requestReturn: (id: number, reason?: string) => mutate<Asset>('post', `/assets/${id}/request-return`, reason ? { reason } : {}),
    receive: (id: number, warehouse?: string) => mutate<Asset>('post', `/assets/${id}/receive`, warehouse ? { warehouse } : {}),
    // Cancel a not-yet-accepted hand-over and pull the asset back into the pool (pending_acceptance → ready).
    recall: (id: number, warehouse: string, reason?: string) =>
        mutate<Asset>('post', `/assets/${id}/recall`, reason ? { warehouse, reason } : { warehouse }),
    // Undo a write-off — restore a retired asset to the Ready pool.
    cancelWriteoff: (id: number) => mutate<Asset>('post', `/assets/${id}/cancel-writeoff`),
    bulk: async (ids: number[], op: 'writeoff', reason?: string): Promise<{ updated: number }> => {
        await ensureCsrf();
        const { data } = await http.post<{ updated: number }>('/assets/bulk', { ids, op, reason });
        return data;
    },
    // Bulk transfer many Ready/Common assets to one owner — an employee or a shared label.
    bulkTransfer: (payload: {
        ids: number[];
        mode: 'employee' | 'shared';
        owner_employee_id?: number;
        owner_label?: string;
        location_id: number;
        reason?: string;
    }) => mutate<void>('post', '/assets/bulk-transfer', payload),
    // Bulk recall (Common → pool, or force-recall any out asset) into a warehouse.
    bulkRecall: (ids: number[], warehouse: string, reason?: string) => mutate<void>('post', '/assets/bulk-recall', { ids, warehouse, reason }),
    // Bulk receive many pending-return assets back into a warehouse.
    bulkReceive: (ids: number[], warehouse: string) => mutate<void>('post', '/assets/bulk-receive', { ids, warehouse }),
};
