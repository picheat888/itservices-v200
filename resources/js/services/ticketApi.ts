import type { ApiEnvelope, Ticket, TicketCategory, TicketPriority, TicketSummary } from '@/types';
import { ensureCsrf, http } from './http';

export interface TicketPageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface TicketPageResponse {
    data: Ticket[];
    meta: TicketPageMeta;
}

export interface CreateTicketPayload {
    subject: string;
    subject_th?: string | null;
    description: string;
    category: TicketCategory;
    callback_phone: string;
}

export interface TicketListParams {
    page: number;
    per_page: number;
    search?: string;
    status?: string;
    category?: string;
    priority?: string;
    mine?: boolean;
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const ticketApi = {
    list: (params: TicketListParams) => http.get<TicketPageResponse>('/tickets', { params }).then((r) => r.data),
    summary: () => http.get<TicketSummary>('/tickets/summary').then((r) => r.data),
    staff: () => http.get<{ data: { id: number; name: string }[] }>('/tickets/staff').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Ticket>>(`/tickets/${id}`).then((r) => r.data.data),
    create: (payload: CreateTicketPayload) => mutate<Ticket>('post', '/tickets', payload),
    take: (id: number, body: { priority: TicketPriority; note?: string | null; related_asset_id?: number | null }) =>
        mutate<Ticket>('post', `/tickets/${id}/take`, body),
    assign: (id: number, body: { assignee_id: number; priority: TicketPriority }) => mutate<Ticket>('post', `/tickets/${id}/assign`, body),
    resolve: (id: number, body: { mode: 'complete' | 'cancel'; resolution: string }) => mutate<Ticket>('post', `/tickets/${id}/resolve`, body),
    remove: (id: number) => mutate<void>('delete', `/tickets/${id}`),
    uploadAttachments: async (id: number, files: File[]): Promise<Ticket> => {
        await ensureCsrf();
        const fd = new FormData();
        files.forEach((f) => fd.append('files[]', f));
        const { data } = await http.post<ApiEnvelope<Ticket>>(`/tickets/${id}/attachments`, fd);
        return data.data;
    },
    deleteAttachment: (id: number, attachmentId: number) => mutate<Ticket>('delete', `/tickets/${id}/attachments/${attachmentId}`),
};
