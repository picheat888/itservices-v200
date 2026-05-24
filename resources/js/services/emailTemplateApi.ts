import { ensureCsrf, http } from './http';

export interface EmailTemplate {
    id: number;
    code: string; // ET-01 style display id
    key: string;
    name: string;
    subject: string;
    body_html: string;
    enabled: boolean;
    last_sent_at: string | null;
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
};
