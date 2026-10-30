// Checks the UI settings this browser saved before they are laid over the defaults; a value an older build left behind keeps the default.
import type { Density, Lang, SidebarStyle } from '../types/index.ts';
import { normalizeDateConfig, type DateConfig } from './datetime.ts';

export interface SavedUiPrefs {
    dark: boolean;
    lang: Lang;
    density: Density;
    radius: number;
    sidebar: SidebarStyle;
    accent: string;
    assetStatusColors: Record<string, string>;
    dateConfig: DateConfig;
}

const LANGS: readonly Lang[] = ['en', 'th'];
const DENSITIES: readonly Density[] = ['compact', 'normal', 'cozy'];
const SIDEBARS: readonly SidebarStyle[] = ['labeled', 'icons'];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_RADIUS = 20;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

export function restoreUiPrefs(saved: unknown, defaults: SavedUiPrefs): SavedUiPrefs {
    const copy = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
    const colors = typeof copy.assetStatusColors === 'object' && copy.assetStatusColors !== null ? copy.assetStatusColors : {};
    const radius = copy.radius;

    return {
        dark: typeof copy.dark === 'boolean' ? copy.dark : defaults.dark,
        lang: oneOf(copy.lang, LANGS, defaults.lang),
        density: oneOf(copy.density, DENSITIES, defaults.density),
        radius: typeof radius === 'number' && Number.isInteger(radius) && radius >= 0 && radius <= MAX_RADIUS ? radius : defaults.radius,
        sidebar: oneOf(copy.sidebar, SIDEBARS, defaults.sidebar),
        accent: typeof copy.accent === 'string' && HEX.test(copy.accent) ? copy.accent : defaults.accent,
        assetStatusColors: {
            ...defaults.assetStatusColors,
            ...Object.fromEntries(Object.entries(colors).filter(([, color]) => typeof color === 'string' && HEX.test(color))),
        },
        dateConfig: normalizeDateConfig(copy.dateConfig as Partial<Record<keyof DateConfig, unknown>> | undefined),
    };
}
