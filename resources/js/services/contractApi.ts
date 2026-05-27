import type { ApiEnvelope, Contract, ContractSummary } from '@/types';
import { ensureCsrf, http } from './http';

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
    vendor: string;
    name: string;
    type: Contract['type'];
    start_date: string;
    end_date: string;
    value: number;
    billing_cycle: Contract['billing_cycle'];
    auto_renew?: boolean;
    owner_id?: number | null;
    notify_150?: boolean;
    notify_120?: boolean;
    notify_60?: boolean;
    notify_45?: boolean;
    notify_30?: boolean;
    notify_7?: boolean;
    notes?: string | null;
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const contractApi = {
    list: (params: { page: number; per_page: number; search?: string; tab?: string; type?: string }) =>
        http.get<ContractPageResponse>('/contracts', { params }).then((r) => r.data),
    summary: () => http.get<ContractSummary>('/contracts/summary').then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<Contract>>(`/contracts/${id}`).then((r) => r.data.data),
    create: (payload: ContractPayload) => mutate<Contract>('post', '/contracts', payload),
    update: (id: number, payload: ContractPayload) => mutate<Contract>('put', `/contracts/${id}`, payload),
    renew: (id: number, months = 12) => mutate<Contract>('post', `/contracts/${id}/renew`, { months }),
    cancel: (id: number) => mutate<Contract>('post', `/contracts/${id}/cancel`),
    remove: (id: number) => mutate<void>('delete', `/contracts/${id}`),
};
