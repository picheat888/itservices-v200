import type { ApiEnvelope } from '@/types';
import { ensureCsrf, http } from './http';

export interface SettingsData {
    brand_name: string;
    brand_sub: string;
    logo_url: string | null;
    company_name: string;
    legal_name: string;
    tax_id: string;
    industry: string;
    address: string;
    country: string;
    currency: string;
    timezone: string;
    default_employee_role: string;
    default_employee_role_label: string;
}

// Fields the PUT /settings endpoint accepts (logo + default role are managed elsewhere).
export type SettingsPayload = Omit<SettingsData, 'logo_url' | 'default_employee_role' | 'default_employee_role_label'>;

export interface MailSettingsData {
    host: string | null;
    port: number | null;
    username: string | null;
    has_password: boolean;
    encryption: 'tls' | 'ssl' | null;
    from_address: string | null;
    from_name: string | null;
}

export interface MailSettingsPayload {
    host: string | null;
    port: number | null;
    username: string | null;
    password?: string | null; // omit/blank to keep existing
    encryption: 'tls' | 'ssl' | null;
    from_address: string | null;
    from_name: string | null;
}

export const settingsApi = {
    get: () => http.get<ApiEnvelope<SettingsData>>('/settings').then((r) => r.data.data),

    update: async (payload: SettingsPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings', payload);
        return data.data;
    },

    uploadLogo: async (file: File) => {
        await ensureCsrf();
        const form = new FormData();
        form.append('logo', file);
        const { data } = await http.post<ApiEnvelope<SettingsData>>('/settings/logo', form);
        return data.data;
    },

    resetLogo: async () => {
        await ensureCsrf();
        const { data } = await http.delete<ApiEnvelope<SettingsData>>('/settings/logo');
        return data.data;
    },

    getMail: () => http.get<ApiEnvelope<MailSettingsData>>('/settings/mail').then((r) => r.data.data),

    updateMail: async (payload: MailSettingsPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<MailSettingsData>>('/settings/mail', payload);
        return data.data;
    },

    testMail: async (): Promise<{ sent: boolean; to?: string }> => {
        await ensureCsrf();
        const { data } = await http.post<{ sent: boolean; to?: string }>('/settings/mail/test');
        return data;
    },
};
