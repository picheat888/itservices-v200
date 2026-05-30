import { currencySymbol } from '@/lib/currency';
import {
    settingsApi,
    type AssetColorsPayload,
    type DisplayPayload,
    type SettingsData,
    type SettingsPayload,
    type TicketSlaPayload,
} from '@/services/settingsApi';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const KEY = ['settings'] as const;

/** Applies the system-wide display theme (accent/density/radius) + asset colors to the UI store. */
function applyTheme(data: SettingsData) {
    const s = useUiStore.getState();
    if (data.theme_accent) s.setAccent(data.theme_accent);
    if (data.theme_density) s.setDensity(data.theme_density);
    if (typeof data.theme_radius === 'number') s.setRadius(data.theme_radius);
    if (data.asset_status_colors) s.setAssetStatusColors(data.asset_status_colors);
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

    return { code, symbol: currencySymbol(code) };
}

/**
 * Formats backend timestamps in the system-configured timezone (Settings -> Company).
 * The API emits naive UTC strings ("YYYY-MM-DD HH:mm:ss"), so they're treated as UTC
 * and converted to the configured zone. Returns "YYYY-MM-DD HH:mm" (or date only).
 */
export function useDateTime() {
    const { data } = useSettings();
    const tz = data?.timezone || 'Asia/Bangkok';

    const format = (value: string | null | undefined, withTime = true): string => {
        if (!value) return '—';
        const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value);
        const normalized = value.includes('T') ? value : value.replace(' ', 'T');
        const date = new Date(hasZone ? normalized : `${normalized}Z`);
        if (Number.isNaN(date.getTime())) return value;

        const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
        if (!withTime) return ymd;
        const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
        return `${ymd} ${hm}`;
    };

    return { tz, format };
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

export function useUpdateSettings() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: SettingsPayload) => settingsApi.update(payload), onSuccess: sync });
}

export function useUpdateDisplay() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: DisplayPayload) => settingsApi.updateDisplay(payload), onSuccess: sync });
}

/** Persists the system-wide asset status badge colors (Settings -> Assets). */
export function useUpdateAssetColors() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: AssetColorsPayload) => settingsApi.updateAssetColors(payload), onSuccess: sync });
}

/** Persists the per-priority ticket SLA targets (Settings -> Tickets). */
export function useUpdateTicketSla() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: TicketSlaPayload) => settingsApi.updateTicketSla(payload), onSuccess: sync });
}

export function useUploadLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (file: File) => settingsApi.uploadLogo(file), onSuccess: sync });
}

export function useResetLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: () => settingsApi.resetLogo(), onSuccess: sync });
}
