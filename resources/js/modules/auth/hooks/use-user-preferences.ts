import { preferencesApi } from '@/modules/auth/api/preferencesApi';
import { useAuth } from '@/modules/auth/hooks/use-auth';
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
            const { loginPrefsTouched: touched, dark: curDark, lang: curLang } = useUiStore.getState();

            // Normally the account's saved preferences win on sign-in. But for any
            // field the user deliberately changed on the login screen, keep that
            // choice instead — the sync effect below then pushes it up to their
            // account. Untouched fields (and sidebar, which login can't change)
            // always come from the account.
            useUiStore.setState({
                dark: touched.dark ? curDark : p.dark,
                lang: touched.lang ? curLang : p.lang,
                sidebar: p.sidebar,
                loginPrefsTouched: { dark: false, lang: false },
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
