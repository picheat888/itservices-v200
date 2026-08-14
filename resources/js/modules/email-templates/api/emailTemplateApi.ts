import { ensureCsrf, http } from '@/shared/lib/http';

export interface EmailTemplate {
    id: number;
    code: string; // ET-01 style display id
    key: string;
    name: string;
    subject: string;
    body_html: string;
    enabled: boolean;
    /** How the template is triggered: on the event, or by a scheduled sweep. */
    cadence: 'realtime' | 'daily' | 'weekly';
    last_sent_at: string | null;
    is_standard: boolean; // has a standard definition (can be reset)
    is_modified: boolean; // differs from its standard definition
}

export interface EmailTemplateStats {
    templates: number;
    enabled: number;
    sent_today: number;
    delivery_rate: number | null;
}

export interface EmailTemplateListResponse {
    data: EmailTemplate[];
    stats: EmailTemplateStats;
}

export interface EmailTemplatePayload {
    name?: string;
    subject?: string;
    body_html?: string;
    enabled?: boolean;
}

/** One attempted send. `to_email` is null when the recipient had no address to send to. */
export interface EmailLogRow {
    id: number;
    template_key: string | null;
    to_email: string | null;
    recipient_name: string | null;
    subject: string;
    status: EmailLogStatus;
    error: string | null;
    created_at: string | null;
}

export type EmailLogStatus = 'sent' | 'failed' | 'skipped';

export interface EmailLogListResponse {
    data: EmailLogRow[];
    meta: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
        /** Counts across the whole log, not the current page. */
        counts: Record<EmailLogStatus, number>;
    };
}

export interface EmailLogParams {
    page: number;
    per_page: number;
    status?: EmailLogStatus;
    search?: string;
}

export const emailTemplateApi = {
    list: (): Promise<EmailTemplateListResponse> => http.get<EmailTemplateListResponse>('/email-templates').then((r) => r.data),

    logs: (params: EmailLogParams): Promise<EmailLogListResponse> => http.get<EmailLogListResponse>('/email-logs', { params }).then((r) => r.data),

    update: async (id: number, payload: EmailTemplatePayload) => {
        await ensureCsrf();
        const { data } = await http.put(`/email-templates/${id}`, payload);
        return data;
    },

    test: async (id: number): Promise<{ sent: boolean }> => {
        await ensureCsrf();
        const { data } = await http.post<{ sent: boolean }>(`/email-templates/${id}/test`);
        return data;
    },

    // Restores one template to its standard definition.
    reset: async (id: number) => {
        await ensureCsrf();
        const { data } = await http.post(`/email-templates/${id}/reset`);
        return data;
    },

    // Restores every standard template to its standard definition.
    resetAll: async (): Promise<{ reset: number }> => {
        await ensureCsrf();
        const { data } = await http.post<{ reset: number }>('/email-templates/reset-all');
        return data;
    },

    // Renders unsaved edit-drawer content through the real email layout (HTML string).
    renderPreview: async (payload: { name?: string; subject?: string; body_html?: string }): Promise<string> => {
        await ensureCsrf();
        const { data } = await http.post('/email-templates/render-preview', payload, { responseType: 'text' });
        return data as string;
    },
};
