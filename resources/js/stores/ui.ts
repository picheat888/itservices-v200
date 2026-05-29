import type { AssetStatusColors } from '@/services/settingsApi';
import type { Density, Lang, SidebarStyle } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Default asset status badge colors — mirrors SettingsController::assetStatusColorDefaults.
const DEFAULT_ASSET_STATUS_COLORS: AssetStatusColors = {
    deployed: '#0284c7',
    ready: '#059669',
    pending_acceptance: '#d97706',
    pending_return: '#d97706',
    maintenance: '#d97706',
    writeoff: '#dc2626',
};

// Brand name tracks APP_NAME (exposed to the SPA as VITE_APP_NAME).
// Editable later from Settings → Branding.
const DEFAULT_BRAND = import.meta.env.VITE_APP_NAME || 'IT Services';

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
    setDark: (dark: boolean) => void;
    toggleDark: () => void;
    setLang: (lang: Lang) => void;
    toggleLang: () => void;
    setDensity: (density: Density) => void;
    setRadius: (radius: number) => void;
    setSidebar: (sidebar: SidebarStyle) => void;
    toggleSidebar: () => void;
    setBrand: (name: string, sub: string) => void;
    setAccent: (accent: string) => void;
    setLogo: (logoUrl: string | null) => void;
    setAssetStatusColors: (colors: AssetStatusColors) => void;
}

export const useUiStore = create<UiState>()(
    persist(
        (set) => ({
            dark: false,
            lang: 'en',
            density: 'normal',
            radius: 10,
            sidebar: 'labeled',
            brandName: DEFAULT_BRAND,
            brandSub: 'Service Desk',
            accent: '#2563eb',
            logoUrl: null,
            assetStatusColors: DEFAULT_ASSET_STATUS_COLORS,
            setDark: (dark) => set({ dark }),
            toggleDark: () => set((s) => ({ dark: !s.dark })),
            setLang: (lang) => set({ lang }),
            toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'th' : 'en' })),
            setDensity: (density) => set({ density }),
            setRadius: (radius) => set({ radius }),
            setSidebar: (sidebar) => set({ sidebar }),
            toggleSidebar: () => set((s) => ({ sidebar: s.sidebar === 'labeled' ? 'icons' : 'labeled' })),
            setBrand: (brandName, brandSub) => set({ brandName, brandSub }),
            setAccent: (accent) => set({ accent }),
            setLogo: (logoUrl) => set({ logoUrl }),
            setAssetStatusColors: (assetStatusColors) => set({ assetStatusColors }),
        }),
        {
            name: 'itservices-ui',
            // Brand fields aren't persisted yet (no Branding UI), so the brand
            // always reflects APP_NAME until Settings → Branding ships.
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
