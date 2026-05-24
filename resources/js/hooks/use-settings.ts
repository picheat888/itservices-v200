import { settingsApi, type DisplayPayload, type SettingsData, type SettingsPayload } from '@/services/settingsApi';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const KEY = ['settings'] as const;

/** Applies the system-wide display theme (accent/density/radius) to the UI store. */
function applyTheme(data: SettingsData) {
    const s = useUiStore.getState();
    if (data.theme_accent) s.setAccent(data.theme_accent);
    if (data.theme_density) s.setDensity(data.theme_density);
    if (typeof data.theme_radius === 'number') s.setRadius(data.theme_radius);
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

export function useUploadLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (file: File) => settingsApi.uploadLogo(file), onSuccess: sync });
}

export function useResetLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: () => settingsApi.resetLogo(), onSuccess: sync });
}
