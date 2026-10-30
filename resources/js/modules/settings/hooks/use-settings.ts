import { useT } from '@/lang';
import { currencySymbol } from '@/shared/lib/currency';
import { FRESH_LIST } from '@/shared/lib/freshness';
import { formatNumber } from '@/shared/lib/number';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
    settingsApi,
    type AssetColorsPayload,
    type BrandingPayload,
    type CompanyPayload,
    type DateTimePayload,
    type DisplayPayload,
    type SettingsData,
    type SoundPayload,
    type TicketSlaPayload,
} from '../api/settingsApi';

const KEY = ['settings'] as const;
const HOLIDAYS_KEY = ['settings', 'sla-holidays'] as const;

/** Applies the system-wide display theme (accent/density/radius) + asset colors to the UI store. */
function applyTheme(data: SettingsData) {
    const s = useUiStore.getState();
    if (data.theme_accent) s.setAccent(data.theme_accent);
    if (data.theme_density) s.setDensity(data.theme_density);
    if (typeof data.theme_radius === 'number') s.setRadius(data.theme_radius);
    if (data.asset_status_colors) s.setAssetStatusColors(data.asset_status_colors);
    if (data.date_format) s.setDateConfig({ format: data.date_format, era: data.date_era, time: data.time_format });
}

// Falls back to the bundled default logo so the tab icon reverts (instead of
// staying stuck on a removed logo) when no custom logo is set.
const DEFAULT_FAVICON = '/logo.svg';

function setFavicon(url: string | null) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    const next = url || DEFAULT_FAVICON;
    // The SVG default needs an explicit type; an uploaded logo is fine without it.
    if (next === DEFAULT_FAVICON) {
        link.type = 'image/svg+xml';
    } else {
        link.removeAttribute('type');
    }
    link.href = next;
}

// Loads settings from the backend and syncs branding into the UI store + favicon.
// useDocumentTitle reads brandName from the store and keeps the browser tab title in sync automatically.
export function useHydrateSettings() {
    const setBrand = useUiStore((s) => s.setBrand);
    const setLogo = useUiStore((s) => s.setLogo);
    const { data } = useQuery({ queryKey: KEY, queryFn: settingsApi.get, staleTime: 60 * 1000 });

    useEffect(() => {
        if (!data) return;
        setBrand(data.brand_name, data.brand_sub);
        setLogo(data.logo_url);
        setFavicon(data.logo_url);
        applyTheme(data);
    }, [data, setBrand, setLogo]);
}

export function useSettings() {
    return useQuery({ queryKey: KEY, queryFn: settingsApi.get, staleTime: 60 * 1000 });
}

/**
 * Resolves the system currency (Settings -> Company) to its code + display
 * symbol. Reads the cached settings query, so it stays in sync after a save.
 */
export function useCurrency() {
    const { data } = useSettings();
    const code = data?.currency ?? 'THB';
    const symbol = currencySymbol(code);
    const lang = useUiStore((s) => s.lang);

    // Money formatter: symbol + thousands grouping + always 2 decimals (e.g. "฿1,234.50").
    const format = (value: number) => `${symbol}${formatNumber(value, lang, { decimals: 2 })}`;

    return { code, symbol, format };
}

function useSyncStore() {
    const setBrand = useUiStore((s) => s.setBrand);
    const setLogo = useUiStore((s) => s.setLogo);
    const qc = useQueryClient();
    return (data: SettingsData) => {
        qc.setQueryData(KEY, data);
        setBrand(data.brand_name, data.brand_sub);
        setLogo(data.logo_url);
        setFavicon(data.logo_url);
        applyTheme(data);
    };
}

/**
 * A refused Settings save used to say nothing (and the button still flashed "Saved"). A 4xx
 * — the server turning the values down — now toasts its first validation message, else a
 * generic line. Network drops and 5xx are left to the global HTTP handler, which already
 * toasts those, so nothing reports twice.
 */
export function useSaveFailed() {
    const t = useT();
    return (error: unknown) => {
        const res = (error as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
        if (!res?.status || res.status >= 500) return;
        const first = Object.values(res.data?.errors ?? {})[0]?.[0];
        useToastStore.getState().push(first ?? t('settings_save_failed'), 'error', t('settings_save_failed_title'));
    };
}

export function useUpdateCompany() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: CompanyPayload) => settingsApi.updateCompany(payload), onSuccess: sync, onError: failed });
}

export function useUpdateBranding() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: BrandingPayload) => settingsApi.updateBranding(payload), onSuccess: sync, onError: failed });
}

export function useUpdateDisplay() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: DisplayPayload) => settingsApi.updateDisplay(payload), onSuccess: sync, onError: failed });
}

/** Persists the system-wide date and time format (Settings -> System). */
export function useUpdateDateTime() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: DateTimePayload) => settingsApi.updateDateTime(payload), onSuccess: sync, onError: failed });
}

/** Persists the system-wide bell sound and its on/off switch (Settings -> Sound). */
export function useUpdateSound() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: SoundPayload) => settingsApi.updateSound(payload), onSuccess: sync, onError: failed });
}

/** Persists the system-wide asset status badge colors (Settings -> Assets). */
export function useUpdateAssetColors() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: AssetColorsPayload) => settingsApi.updateAssetColors(payload), onSuccess: sync, onError: failed });
}

/** Persists the per-priority ticket SLA targets (Settings -> Tickets). */
export function useUpdateTicketSla() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (payload: TicketSlaPayload) => settingsApi.updateTicketSla(payload), onSuccess: sync, onError: failed });
}

/** Company holidays of every year (Settings -> Tickets). */
export function useSlaHolidays() {
    return useQuery({ queryKey: HOLIDAYS_KEY, queryFn: settingsApi.slaHolidays, ...FRESH_LIST });
}

/** Replaces one year's holidays; open cases' deadlines move with them. */
export function useSaveSlaHolidays() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ year, holidays }: { year: number; holidays: { date: string; name: string }[] }) => settingsApi.saveSlaHolidays(year, holidays),
        onSuccess: (response) => {
            qc.setQueryData(HOLIDAYS_KEY, response.data);
            void qc.invalidateQueries({ queryKey: HOLIDAYS_KEY });
            void qc.invalidateQueries({ queryKey: ['tickets'] });
            // Ticket lists, details and summaries keep stored deadlines under their own keys
            void qc.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && /ticket/.test(query.queryKey[0]) });
        },
    });
}

export function useUploadLogo() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: (file: File) => settingsApi.uploadLogo(file), onSuccess: sync, onError: failed });
}

export function useResetLogo() {
    const sync = useSyncStore();
    const failed = useSaveFailed();
    return useMutation({ mutationFn: () => settingsApi.resetLogo(), onSuccess: sync, onError: failed });
}
