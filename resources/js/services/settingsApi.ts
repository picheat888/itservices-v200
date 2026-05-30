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
    theme_accent: string;
    theme_density: 'compact' | 'normal' | 'cozy';
    theme_radius: number;
    asset_status_colors: AssetStatusColors;
    ticket_sla: TicketSlaTargets;
    default_employee_role: string;
    default_employee_role_label: string;
}

// Map of asset status key -> hex color (e.g. { deployed: '#0284c7' }).
export type AssetStatusColors = Record<string, string>;

// Per-priority SLA targets: response in minutes, resolve (close) in hours.
export type TicketSlaTargets = Record<string, { response: number; resolve: number }>;

export interface TicketSlaPayload {
    ticket_sla: TicketSlaTargets;
}

// Company/Branding payload — theme + logo + default role + asset colors are handled separately.
export type SettingsPayload = Omit<
    SettingsData,
    | 'logo_url'
    | 'default_employee_role'
    | 'default_employee_role_label'
    | 'theme_accent'
    | 'theme_density'
    | 'theme_radius'
    | 'asset_status_colors'
    | 'ticket_sla'
>;

// Asset status colors payload — system-wide, saved via the same PUT /settings endpoint.
export interface AssetColorsPayload {
    asset_status_colors: AssetStatusColors;
}

// Display (theme) payload — system-wide, saved via the same PUT /settings endpoint.
export interface DisplayPayload {
    theme_accent: string;
    theme_density: 'compact' | 'normal' | 'cozy';
    theme_radius: number;
}

// Security policy — 0 disables the respective rule.
export interface SecuritySettings {
    session_timeout_minutes: number;
    password_expiry_days: number;
}

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

    updateDisplay: async (payload: DisplayPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings', payload);
        return data.data;
    },

    updateAssetColors: async (payload: AssetColorsPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings', payload);
        return data.data;
    },

    updateTicketSla: async (payload: TicketSlaPayload) => {
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

    getSecurity: () => http.get<ApiEnvelope<SecuritySettings>>('/settings/security').then((r) => r.data.data),

    updateSecurity: async (payload: SecuritySettings) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SecuritySettings>>('/settings/security', payload);
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
