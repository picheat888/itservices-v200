import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, RequestFieldSchema, RequestSourceOption, ServiceRequest, WorkflowStep } from '@/shared/types';

/** Aggregates the list endpoint returns next to the page (KPI cards + tab chips). */
export interface RequestPageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    pending: number;
    approved: number;
    rejected: number;
    fulfilled: number;
    cancelled: number;
    awaiting_me: number;
    to_fulfill: number;
    avg_cycle_days: number | null;
}

export interface RequestPageResponse {
    data: ServiceRequest[];
    meta: RequestPageMeta;
}

export interface RequestListParams {
    page: number;
    per_page: number;
    search?: string;
    status?: string;
    type?: string;
    /** Tab scopes: approvals (awaiting me) | queue (IT fulfillment) | mine. */
    scope?: 'approvals' | 'queue' | 'mine';
}

export interface SubmitRequestPayload {
    type: string;
    title: string;
    reason: string;
    /** Optional — the form no longer asks; the server defaults it. */
    priority?: string;
    estimated_value?: string | null;
    fields: Record<string, string | number>;
}

/** One service of the New Request catalog: schema + its workflow route. */
export interface RequestTypeOption {
    type: ServiceRequest['type'];
    fields: RequestFieldSchema[];
    /** How step ② lays this service's fields out: 1 = under the reason, 2 = beside it. */
    columns: 1 | 2;
    workflow: {
        id: number;
        name: string;
        active: boolean;
        auto_ticket: boolean;
        steps: Pick<WorkflowStep, 'label' | 'actor_type' | 'kind'>[];
    } | null;
}

export interface RequestOptionsResponse {
    types: RequestTypeOption[];
    sources: Record<'email_groups' | 'file_shares' | 'social_platforms' | 'softwares' | 'locations', RequestSourceOption[]>;
}

async function mutate<T>(method: 'post' | 'put', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const requestApi = {
    list: (params: RequestListParams) => http.get<RequestPageResponse>('/service-requests', { params }).then((r) => r.data),
    get: (id: number) => http.get<ApiEnvelope<ServiceRequest>>(`/service-requests/${id}`).then((r) => r.data.data),
    options: () => http.get<ApiEnvelope<RequestOptionsResponse>>('/service-requests/options').then((r) => r.data.data),
    submit: (payload: SubmitRequestPayload) => mutate<ServiceRequest>('post', '/service-requests', payload),
    approve: (id: number, note?: string) => mutate<ServiceRequest>('post', `/service-requests/${id}/approve`, { note: note || null }),
    reject: (id: number, note: string) => mutate<ServiceRequest>('post', `/service-requests/${id}/reject`, { note }),
    fulfill: (id: number) => mutate<ServiceRequest>('post', `/service-requests/${id}/fulfill`),
    cancel: (id: number) => mutate<ServiceRequest>('post', `/service-requests/${id}/cancel`),
};
