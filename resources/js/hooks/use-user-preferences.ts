import { useAuth } from '@/hooks/use-auth';
import { preferencesApi } from '@/services/preferencesApi';
import { useUiStore } from '@/stores/ui';
import { useEffect, useRef } from 'react';

// Bridges per-user display preferences with the DB:
//  - on login, applies the user's saved preferences to the UI store
//  - on change, persists them back so they survive sign-out (no reset to default)
export function useUserPreferences() {
    const { user } = useAuth();
    const dark = useUiStore((s) => s.dark);
    const lang = useUiStore((s) => s.lang);
    const density = useUiStore((s) => s.density);
    const radius = useUiStore((s) => s.radius);
    const sidebar = useUiStore((s) => s.sidebar);
    const accent = useUiStore((s) => s.accent);
    const appliedFor = useRef<number | null>(null);

    useEffect(() => {
        if (user?.preferences && appliedFor.current !== user.id) {
            const p = user.preferences;
            useUiStore.setState({
                dark: p.dark,
                lang: p.lang,
                density: p.density,
                radius: p.radius,
                sidebar: p.sidebar,
                accent: p.accent,
            });
            appliedFor.current = user.id;
        }
    }, [user]);

    useEffect(() => {
        if (appliedFor.current == null || appliedFor.current !== user?.id) return;
        const id = setTimeout(() => {
            preferencesApi.update({ dark, lang, density, radius, sidebar, accent }).catch(() => {});
        }, 500);
        return () => clearTimeout(id);
    }, [dark, lang, density, radius, sidebar, accent, user?.id]);
}
