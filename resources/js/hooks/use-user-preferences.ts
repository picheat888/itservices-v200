import { useAuth } from '@/hooks/use-auth';
import { preferencesApi } from '@/services/preferencesApi';
import { useUiStore } from '@/stores/ui';
import { useEffect, useRef } from 'react';

// Bridges the genuinely per-user UI preferences with the DB:
//  - on login, applies the user's saved preferences to the UI store
//  - on change, persists them back so they survive sign-out (no reset to default)
// NOTE: theme (accent/density/radius) is system-wide now (Settings → Display,
// stored in app_settings) and is intentionally NOT handled here.
export function useUserPreferences() {
    const { user } = useAuth();
    const dark = useUiStore((s) => s.dark);
    const lang = useUiStore((s) => s.lang);
    const sidebar = useUiStore((s) => s.sidebar);
    const appliedFor = useRef<number | null>(null);

    useEffect(() => {
        if (user?.preferences && appliedFor.current !== user.id) {
            const p = user.preferences;
            useUiStore.setState({
                dark: p.dark,
                lang: p.lang,
                sidebar: p.sidebar,
            });
            appliedFor.current = user.id;
        }
    }, [user]);

    useEffect(() => {
        if (appliedFor.current == null || appliedFor.current !== user?.id) return;
        const id = setTimeout(() => {
            preferencesApi.update({ dark, lang, sidebar }).catch(() => {});
        }, 500);
        return () => clearTimeout(id);
    }, [dark, lang, sidebar, user?.id]);
}
