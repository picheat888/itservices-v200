// Palette + hex helpers for the shared colour swatch picker.
// The five defaults pass 3:1 non-text contrast on both the light and the dark card.

export type Swatch = { hex: string; nameKey: string };

export const DEFAULT_SWATCHES: readonly Swatch[] = [
    { hex: '#3b82f6', nameKey: 'color_blue' },
    { hex: '#059669', nameKey: 'color_green' },
    { hex: '#ea580c', nameKey: 'color_orange' },
    { hex: '#8b5cf6', nameKey: 'color_violet' },
    { hex: '#ec4899', nameKey: 'color_pink' },
];

/** Lowercase `#rrggbb`, or null when the value is not one. */
export function normalizeHex(value: string): string | null {
    const hex = value.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/** The palette entry for a colour, compared case-insensitively. */
export function findSwatch(value: string, palette: readonly Swatch[] = DEFAULT_SWATCHES): Swatch | undefined {
    const hex = normalizeHex(value);
    return hex ? palette.find((s) => s.hex.toLowerCase() === hex) : undefined;
}
