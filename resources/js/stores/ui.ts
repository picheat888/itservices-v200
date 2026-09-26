import type { AssetStatusColors } from '@/modules/settings';
import type { Density, Lang, SidebarStyle } from '@/shared/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Default asset status badge colors — mirrors SettingsController::assetStatusColorDefaults.
const DEFAULT_ASSET_STATUS_COLORS: AssetStatusColors = {
    deployed: '#0284c7',
    ready: '#059669',
    pending_acceptance: '#d97706',
    pending_return: '#d97706',
    common: '#64748b',
    writeoff: '#dc2626',
};

/**
 * The brand the server put in the page (see routes/web.php → app.blade.php).
 *
 * Read once at module load, so the very first render already shows this
 * installation's own name and logo. The store used to start from VITE_APP_NAME
 * instead — a value frozen into the bundle by `npm run build` — and correct itself
 * once /api/settings answered, which meant every reload flashed a build-time name
 * and a placeholder icon, and editing the brand in Settings changed neither until
 * somebody rebuilt.
 *
 * The fallbacks below are only for a page served without the block at all.
 */
function brandFromDocument(): { name?: string; sub?: string; logo_url?: string | null } {
    try {
        return JSON.parse(document.getElementById('brand')?.textContent ?? '{}');
    } catch {
        return {};
    }
}

const SERVER_BRAND = brandFromDocument();

interface UiState {
    dark: boolean;
    lang: Lang;
    density: Density;
    radius: number;
    sidebar: SidebarStyle;
    brandName: string;
    brandSub: string;
    accent: string;
    logoUrl: string | null;
    assetStatusColors: AssetStatusColors;
    // Transient (not persisted): which prefs the user deliberately changed on
    // the login screen. Those fields win over the account's saved preference
    // after sign-in (and are then pushed up). Tracked per-field so changing
    // language doesn't clobber the saved theme, and vice-versa.
    loginPrefsTouched: { dark: boolean; lang: boolean };
    // Transient (not persisted): the user asked to change their password, from the
    // profile drawer or from the expiry warning in the tray. Lives here rather than in
    // the shell's own state because the two places that raise it are nowhere near it.
    passwordDialogOpen: boolean;
    setDark: (dark: boolean) => void;
    toggleDark: () => void;
    setLang: (lang: Lang) => void;
    toggleLang: () => void;
    markLoginPref: (key: 'dark' | 'lang') => void;
    setDensity: (density: Density) => void;
    setRadius: (radius: number) => void;
    setSidebar: (sidebar: SidebarStyle) => void;
    toggleSidebar: () => void;
    setBrand: (name: string, sub: string) => void;
    setAccent: (accent: string) => void;
    setLogo: (logoUrl: string | null) => void;
    setAssetStatusColors: (colors: AssetStatusColors) => void;
    setPasswordDialog: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
    persist(
        (set) => ({
            dark: false,
            lang: 'en',
            density: 'normal',
            radius: 10,
            sidebar: 'labeled',
            brandName: SERVER_BRAND.name ?? 'IT Services',
            brandSub: SERVER_BRAND.sub ?? 'Service Desk',
            accent: '#2563eb',
            logoUrl: SERVER_BRAND.logo_url ?? null,
            assetStatusColors: DEFAULT_ASSET_STATUS_COLORS,
            loginPrefsTouched: { dark: false, lang: false },
            passwordDialogOpen: false,
            setDark: (dark) => set({ dark }),
            toggleDark: () => set((s) => ({ dark: !s.dark })),
            setLang: (lang) => set({ lang }),
            toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'th' : 'en' })),
            markLoginPref: (key) => set((s) => ({ loginPrefsTouched: { ...s.loginPrefsTouched, [key]: true } })),
            setDensity: (density) => set({ density }),
            setRadius: (radius) => set({ radius }),
            setSidebar: (sidebar) => set({ sidebar }),
            toggleSidebar: () => set((s) => ({ sidebar: s.sidebar === 'labeled' ? 'icons' : 'labeled' })),
            setBrand: (brandName, brandSub) => set({ brandName, brandSub }),
            setAccent: (accent) => set({ accent }),
            setLogo: (logoUrl) => set({ logoUrl }),
            setAssetStatusColors: (assetStatusColors) => set({ assetStatusColors }),
            setPasswordDialog: (passwordDialogOpen) => set({ passwordDialogOpen }),
        }),
        {
            name: 'itservices-ui',
            // Brand and logo are deliberately absent: they arrive with the page
            // itself (see SERVER_BRAND above), which is always current, where a
            // persisted copy would only ever be the last one this browser saw.
            partialize: (s) => ({
                dark: s.dark,
                lang: s.lang,
                density: s.density,
                radius: s.radius,
                sidebar: s.sidebar,
                accent: s.accent,
                assetStatusColors: s.assetStatusColors,
            }),
        },
    ),
);
