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

/** The address the system sends from — shown on the preview's From line. */
export interface MailIdentity {
    from_address: string | null;
    from_name: string | null;
}

export interface EmailTemplateListResponse {
    data: EmailTemplate[];
    stats: EmailTemplateStats;
    mail: MailIdentity;
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

/**
 * One log entry with the email rebuilt as it was received. `preview_html` is null for rows
 * written before sent bodies were kept.
 */
export interface EmailLogDetail extends Omit<EmailLogRow, 'template_key'> {
    template_key: string | null;
    preview_html: string | null;
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

    log: (id: number): Promise<EmailLogDetail> => http.get<{ data: EmailLogDetail }>(`/email-logs/${id}`).then((r) => r.data.data),

    update: async (id: number, payload: EmailTemplatePayload) => {
        await ensureCsrf();
        const { data } = await http.put(`/email-templates/${id}`, payload);
        return data;
    },

    // Sends the template to the signed-in user. The editor posts what is on screen, saved
    // or not — a test of the saved copy would not be a test of what the author is writing.
    test: async (id: number, draft?: EmailTemplatePayload): Promise<{ sent: boolean }> => {
        await ensureCsrf();
        const { data } = await http.post<{ sent: boolean }>(`/email-templates/${id}/test`, draft ?? {});
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
    // `key` is not editable — it is sent so the preview is drawn at the width the saved
    // template and the real mail use (some templates ask for a wider frame).
    renderPreview: async (payload: { key?: string; name?: string; subject?: string; body_html?: string }): Promise<string> => {
        await ensureCsrf();
        const { data } = await http.post('/email-templates/render-preview', payload, { responseType: 'text' });
        return data as string;
    },
};
