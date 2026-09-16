import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, Ticket, TicketCategory, TicketPriority, TicketSummary } from '@/shared/types';

export interface TicketPageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    /** Open tickets in the viewer's scope (ignores tab filters) — drives the red tab badge. */
    open_count: number;
    /** The viewer's own in-progress assignments — drives the My Jobs tab badge. */
    my_jobs_count: number;
    /** The viewer's own still-unresolved requests — drives the My Tickets tab badge. */
    my_tickets_count: number;
}

export interface TicketPageResponse {
    data: Ticket[];
    meta: TicketPageMeta;
}

export interface CreateTicketPayload {
    subject: string;
    description: string;
    category: TicketCategory;
    callback_phone: string;
}

/** Editable descriptive fields — workflow fields (priority/status/assignee) are not editable here. */
export interface UpdateTicketPayload {
    subject: string;
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
    sort?: string;
    /** 'breached' = only active tickets whose current SLA deadline has passed. */
    sla?: string;
    mine?: boolean;
    /** My Tickets scope — only tickets the user filed themselves (gated by tickets.my). */
    requested?: boolean;
}

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

/** Dashboard window: a preset day count (7/30/90) or a custom inclusive date pair. */
export type SummaryRange = number | { from: string; to: string };

export const ticketApi = {
    list: (params: TicketListParams) => http.get<TicketPageResponse>('/tickets', { params }).then((r) => r.data),
    summary: (range?: SummaryRange) =>
        http.get<TicketSummary>('/tickets/summary', { params: typeof range === 'object' ? range : { days: range } }).then((r) => r.data),
    staff: (category?: string) =>
        http
            .get<{ data: { id: number; name: string; employee_id: number | null }[] }>('/tickets/staff', { params: { category } })
            .then((r) => r.data.data),
    badge: () => http.get<{ count: number }>('/tickets/badge').then((r) => r.data.count),
    requesterAssets: (id: number) =>
        http.get<{ data: { id: number; asset_code: string; model: string | null }[] }>(`/tickets/${id}/requester-assets`).then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Ticket>>(`/tickets/${id}`).then((r) => r.data.data),
    create: (payload: CreateTicketPayload) => mutate<Ticket>('post', '/tickets', payload),
    update: (id: number, payload: UpdateTicketPayload) => mutate<Ticket>('put', `/tickets/${id}`, payload),
    take: (id: number, body: { priority: TicketPriority; note?: string | null; related_asset_id?: number | null }) =>
        mutate<Ticket>('post', `/tickets/${id}/take`, body),
    assign: (id: number, body: { assignee_id: number; priority: TicketPriority }) => mutate<Ticket>('post', `/tickets/${id}/assign`, body),
    forward: (id: number, body: { assignee_id: number }) => mutate<Ticket>('post', `/tickets/${id}/forward`, body),
    /** Write a progress note on a case in flight. */
    addUpdate: (id: number, body: { body: string }) => mutate<Ticket>('post', `/tickets/${id}/updates`, body),
    resolve: (id: number, body: { mode: 'complete' | 'cancel'; resolution: string }) => mutate<Ticket>('post', `/tickets/${id}/resolve`, body),
    /**
     * Uploads attachments ONE AT A TIME so each file reports its own progress
     * (axios onUploadProgress is per-request). onProgress(index, 0..100) fires as
     * each file streams; returns the ticket from the final response.
     */
    uploadAttachments: async (id: number, files: File[], onProgress?: (index: number, percent: number) => void): Promise<Ticket> => {
        await ensureCsrf();
        let latest: Ticket | undefined;
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData();
            fd.append('files[]', files[i]);
            const { data } = await http.post<ApiEnvelope<Ticket>>(`/tickets/${id}/attachments`, fd, {
                onUploadProgress: (e) => {
                    if (onProgress && e.total) onProgress(i, Math.round((e.loaded / e.total) * 100));
                },
            });
            latest = data.data;
            onProgress?.(i, 100);
        }
        return latest as Ticket;
    },
    /** Remove one already-saved attachment from a ticket. */
    deleteAttachment: (id: number, attachmentId: number) => mutate<Ticket>('delete', `/tickets/${id}/attachments/${attachmentId}`),
};
