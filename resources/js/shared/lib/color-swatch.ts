// Palette, custom-colour grid and hex/contrast helpers for the shared colour swatch picker.
// Every colour offered passes 3:1 non-text contrast on both the light and the dark card.

export type Swatch = { hex: string; nameKey: string };

export const DEFAULT_SWATCHES: readonly Swatch[] = [
    { hex: '#3b82f6', nameKey: 'color_blue' },
    { hex: '#059669', nameKey: 'color_green' },
    { hex: '#ea580c', nameKey: 'color_orange' },
    { hex: '#8b5cf6', nameKey: 'color_violet' },
    { hex: '#ec4899', nameKey: 'color_pink' },
];

/** Light and dark --card colours (resources/css/app.css). */
export const CARD_GROUNDS = ['#ffffff', '#131720'] as const;

// Columns: red, orange, amber, emerald, teal, sky, blue, violet, pink, slate · rows: Tailwind 500, 600, 700 (null = below 3:1)
export const CUSTOM_COLOR_GRID: readonly (readonly (string | null)[])[] = [
    ['#ef4444', null, null, null, null, null, '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'],
    ['#dc2626', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#2563eb', '#7c3aed', '#db2777', null],
    [null, '#c2410c', '#b45309', '#047857', '#0f766e', '#0369a1', null, null, null, null],
];

/** Lowercase `#rrggbb` (the leading # is optional on input), or null when the value is not one. */
export function normalizeHex(value: string): string | null {
    const raw = value.trim().toLowerCase();
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/** The palette entry for a colour, compared case-insensitively. */
export function findSwatch(value: string, palette: readonly Swatch[] = DEFAULT_SWATCHES): Swatch | undefined {
    const hex = normalizeHex(value);
    return hex ? palette.find((s) => s.hex.toLowerCase() === hex) : undefined;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21) between two `#rrggbb` colours. */
export function hexContrastRatio(hexA: string, hexB: string): number {
    const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** True when the colour reaches 3:1 against both the light and the dark card. */
export function meetsCardContrast(hex: string): boolean {
    return CARD_GROUNDS.every((ground) => hexContrastRatio(hex, ground) >= 3);
}
