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

// Columns: red, orange, amber, lime, green, teal, cyan, blue, indigo, violet, pink, slate · rows: lighter to deeper,
// each shade tuned (OKLCH) so it keeps 3:1 on both cards, so the grid has no gaps
export const CUSTOM_COLOR_GRID: readonly (readonly string[])[] = [
    ['#f5524a', '#e2670c', '#bf7e0d', '#6c990e', '#0ea053', '#0c9d8c', '#1899ad', '#4b87fc', '#787efd', '#a76ef8', '#e853a5', '#7e8da1'],
    ['#de3c37', '#c65802', '#a66d0f', '#5d8508', '#078b47', '#04887a', '#128597', '#3272ef', '#6768f0', '#9459e2', '#d13d91', '#6c7a8e'],
    ['#c82223', '#a94b08', '#8f5c03', '#4e7104', '#03773b', '#137368', '#0d7181', '#205fda', '#5754db', '#8246cd', '#bc257f', '#5a687b'],
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

/** Why a colour cannot be used: too pale for the light card, or too dark for the dark card. */
export function contrastProblem(hex: string): 'too_light' | 'too_dark' | null {
    const [lightCard, darkCard] = CARD_GROUNDS;
    if (hexContrastRatio(hex, lightCard) < 3) return 'too_light';
    if (hexContrastRatio(hex, darkCard) < 3) return 'too_dark';
    return null;
}
