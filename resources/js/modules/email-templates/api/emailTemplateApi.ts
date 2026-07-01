import { ensureCsrf, http } from '@/shared/lib/http';

export interface EmailTemplate {
    id: number;
    code: string; // ET-01 style display id
    key: string;
    name: string;
    subject: string;
    body_html: string;
    enabled: boolean;
    cadence: 'realtime' | 'daily';
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

export interface CreateEmailTemplatePayload {
    key: string;
    name: string;
    subject: string;
    body_html: string;
    enabled?: boolean;
}

export const emailTemplateApi = {
    list: (): Promise<EmailTemplateListResponse> =>
        http.get<EmailTemplateListResponse>('/email-templates').then((r) => r.data),

    update: async (id: number, payload: EmailTemplatePayload) => {
        await ensureCsrf();
        const { data } = await http.put(`/email-templates/${id}`, payload);
        return data;
    },

    create: async (payload: CreateEmailTemplatePayload) => {
        await ensureCsrf();
        const { data } = await http.post('/email-templates', payload);
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
