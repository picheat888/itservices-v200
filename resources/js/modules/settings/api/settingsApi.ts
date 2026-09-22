import { ensureCsrf, http } from '@/shared/lib/http';
import type { TicketCategory, ApiEnvelope } from '@/shared/types';

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
    theme_accent: string;
    theme_density: 'compact' | 'normal' | 'cozy';
    theme_radius: number;
    asset_status_colors: AssetStatusColors;
    ticket_sla: TicketSlaTargets;
    ticket_sla_request: TicketSlaRequestTarget[];
    ticket_sla_work_class: TicketSlaWorkClassTarget[];
    ticket_sla_response: number;
    ticket_sla_hours: TicketSlaHours;
    /**
     * Name of the role a new employee ends up with, via the default Role Group set on the
     * Permission page. Null when no default group is set — the install has no role to give,
     * and SetCredentialsModal says so instead of letting an account be created without one.
     */
    default_employee_role_label: string | null;
}

// Map of asset status key -> hex color (e.g. { deployed: '#0284c7' }).
export type AssetStatusColors = Record<string, string>;

// Per-priority resolution (close) targets in hours, plus which clock counts them. First
// response is a single system-wide target in minutes (ticket_sla_response) — priority is
// only assigned when a case is taken, so it can't drive the response clock.
export type TicketSlaTargets = Record<string, { resolve: number; clock: TicketSlaClock }>;

// Which clock a target's hours count against: 'business' counts only the working window
// below (days off, out-of-hours and the break are skipped); 'calendar' counts every hour.
export type TicketSlaClock = 'business' | 'calendar';

/**
 * A resolution target keyed on the KIND OF REQUEST a case was opened from, rather than on how
 * urgent somebody judged it. A monitor has to be procured whether or not the case is marked
 * critical, and that length is known the moment the request is filed.
 */
export interface TicketSlaRequestTarget {
    type: string;
    resolve: number;
    clock: TicketSlaClock;
    enabled: boolean;
}

/**
 * A resolution target keyed on the KIND OF REPAIR WORK a case was classified as, rather than
 * on priority or request type. Wins over both of those — it only applies once somebody
 * classifies the case as repair, in-house or vendor. 'standard' (non-repair work) is never
 * offered here; the backend rejects it.
 */
export interface TicketSlaWorkClassTarget {
    /** A repair target belongs to a PAIR — the kind of case and who does the work. Replacing a
     *  mainboard at an external shop and rewiring a floor are not the same length of job. */
    category: TicketCategory;
    work_class: 'repair_internal' | 'repair_vendor';
    resolve: number;
    clock: TicketSlaClock;
    enabled: boolean;
}

// Working window the SLA clocks count against (days: ISO weekday 1–7 = Mon–Sun).
// break_* is an optional pause (e.g. lunch) the clocks skip — null on both = no break.
export interface TicketSlaHours {
    days: number[];
    start: string;
    end: string;
    break_start: string | null;
    break_end: string | null;
}

export interface TicketSlaPayload {
    ticket_sla: TicketSlaTargets;
    /** The WHOLE list — a target left out here is a target the server deletes. */
    ticket_sla_request?: TicketSlaRequestTarget[];
    /** The WHOLE list, same as ticket_sla_request — omit the key to leave these rules alone. */
    ticket_sla_work_class?: TicketSlaWorkClassTarget[];
    ticket_sla_response?: number;
    ticket_sla_hours?: TicketSlaHours;
}

// Company info — saved via PUT /settings/company. (The app timezone is fixed by
// .env APP_TIMEZONE and is not a setting at all — see shared/lib/datetime.ts.)
export type CompanyPayload = Pick<SettingsData, 'company_name' | 'legal_name' | 'tax_id' | 'industry' | 'address' | 'country' | 'currency'>;

// Branding — saved via PUT /settings/branding.
export type BrandingPayload = Pick<SettingsData, 'brand_name' | 'brand_sub'>;

// Asset status colors payload — system-wide, saved via PUT /settings/assets.
export interface AssetColorsPayload {
    asset_status_colors: AssetStatusColors;
}

// Display (theme) payload — system-wide, saved via PUT /settings/display.
// Only the theme color is user-editable now; density and radius are fixed, so
// they're optional here (the endpoint validates each field with `sometimes`).
export interface DisplayPayload {
    theme_accent: string;
    theme_density?: 'compact' | 'normal' | 'cozy';
    theme_radius?: number;
}

// Security policy — 0 disables the respective rule.
export interface SecuritySettings {
    session_timeout_minutes: number;
    password_expiry_days: number;
    // Data-retention windows the nightly prune reads. 0 here reads as "keep forever".
    email_log_body_days: number;
    email_log_days: number;
    audit_log_days: number;
    notification_days: number;
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

    updateCompany: async (payload: CompanyPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/company', payload);
        return data.data;
    },

    updateBranding: async (payload: BrandingPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/branding', payload);
        return data.data;
    },

    updateDisplay: async (payload: DisplayPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/display', payload);
        return data.data;
    },

    updateAssetColors: async (payload: AssetColorsPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/assets', payload);
        return data.data;
    },

    updateTicketSla: async (payload: TicketSlaPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/sla', payload);
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
