import { settingsApi, type SettingsData, type SettingsPayload } from '@/services/settingsApi';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const KEY = ['settings'] as const;

function setFavicon(url: string | null) {
    if (!url) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = url;
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
    };
}

export function useUpdateSettings() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: SettingsPayload) => settingsApi.update(payload), onSuccess: sync });
}

export function useUploadLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (file: File) => settingsApi.uploadLogo(file), onSuccess: sync });
}

export function useResetLogo() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: () => settingsApi.resetLogo(), onSuccess: sync });
}
