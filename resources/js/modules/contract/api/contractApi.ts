import type { ApiEnvelope, Contract, ContractSummary } from '@/shared/types';
import { ensureCsrf, http } from '@/shared/lib/http';

export interface ContractPageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface ContractPageResponse {
    data: Contract[];
    meta: ContractPageMeta;
}

export interface ContractPayload {
    code?: string | null;
    vendor_id: number;
    name: string;
    details: string;
    type: Contract['type'];
    start_date: string;
    end_date: string;
    value: number;
    total_value?: number | null;
    billing_cycle: Contract['billing_cycle'];
    notify_150?: boolean;
    notify_120?: boolean;
    notify_60?: boolean;
    notify_45?: boolean;
    notify_30?: boolean;
    notify_7?: boolean;
    notes?: string | null;
    /** Asset ids to link to this contract (sets each asset's contract_id). */
    asset_ids?: number[];
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const contractApi = {
    list: (params: { page: number; per_page: number; search?: string; tab?: string; type?: string; sort?: string }) =>
        http.get<ContractPageResponse>('/contracts', { params }).then((r) => r.data),
    downloadImportTemplate: () =>
        http.get('/contracts/import-template', { responseType: 'blob' }).then((r) => r.data as Blob),
    import: async (file: File): Promise<{ imported: number }> => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await http.post<{ imported: number }>('/contracts/import', fd);
        return data;
    },
    summary: () => http.get<ContractSummary>('/contracts/summary').then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<Contract>>(`/contracts/${id}`).then((r) => r.data.data),
    create: (payload: ContractPayload) => mutate<Contract>('post', '/contracts', payload),
    update: (id: number, payload: ContractPayload) => mutate<Contract>('put', `/contracts/${id}`, payload),
    renew: (id: number, months = 12) => mutate<Contract>('post', `/contracts/${id}/renew`, { months }),
    cancel: (id: number, reason?: string) => mutate<Contract>('post', `/contracts/${id}/cancel`, reason !== undefined ? { reason } : {}),
    expire: (id: number) => mutate<Contract>('post', `/contracts/${id}/expire`),
    remove: (id: number) => mutate<void>('delete', `/contracts/${id}`),
    uploadAttachments: async (id: number, files: File[]): Promise<Contract> => {
        await ensureCsrf();
        const fd = new FormData();
        files.forEach((f) => fd.append('files[]', f));
        const { data } = await http.post<ApiEnvelope<Contract>>(`/contracts/${id}/attachments`, fd);
        return data.data;
    },
    deleteAttachment: (id: number, attachmentId: number) =>
        mutate<Contract>('delete', `/contracts/${id}/attachments/${attachmentId}`),
};
