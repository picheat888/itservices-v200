// Shared brand-color helpers so the live theme (use-apply-theme) and the
// Display color picker (Settings) resolve the accent identically.
import { blend, contrastRatio, DARK_GROUND } from '@/shared/lib/contrast';

/** Parses #rrggbb into [r,g,b], or null when malformed. */
export function parseHex(hex: string): [number, number, number] | null {
    const m = hex.replace('#', '');
    if (m.length !== 6) return null;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return [r, g, b].some(Number.isNaN) ? null : [r, g, b];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relLuminance([r, g, b]: [number, number, number]): number {
    const f = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Mixes a color toward white by `amt` (0..1) and returns #rrggbb. */
export function lighten([r, g, b]: [number, number, number], amt: number): string {
    const mix = (c: number) => Math.round(c + (255 - c) * amt);
    return '#' + [mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Contrast the brand colour must reach as TEXT on the dark card. 5.6 rather than WCAG's 4.5
 * leaves room for the brand tints it often sits on (`bg-brand/5` to `/15`, the sidebar counts).
 */
const DARK_BRAND_TEXT_CONTRAST = 5.6;

/**
 * The brand color actually shown for a given accent + mode. Light mode shows the accent as
 * chosen. In dark mode one variable serves as a surface and as text, so it is tuned for text:
 * mixed toward white in 5% steps until it reads at DARK_BRAND_TEXT_CONTRAST on the dark card
 * (the accent used to override the dark theme's lighter blue, leaving brand text at ~2.9:1).
 * A near-black accent ends up a legible grey the same way.
 */
export function resolveBrand(accent: string, dark: boolean): string {
    const rgb = parseHex(accent);
    if (!rgb || !dark) return accent;
    for (let step = 0; step <= 20; step++) {
        const shade = blend([255, 255, 255], rgb, step * 0.05);
        if (contrastRatio(shade, DARK_GROUND) >= DARK_BRAND_TEXT_CONTRAST) return toHex(shade);
    }
    return '#ffffff';
}

/** Legible text colour on a brand-coloured surface: white or near-black, whichever reads better. */
export function brandForeground(hex: string): string {
    const rgb = parseHex(hex);
    if (!rgb) return '#ffffff';
    return contrastRatio(rgb, [255, 255, 255]) >= contrastRatio(rgb, [15, 23, 42]) ? '#ffffff' : '#0f172a';
}

const toHex = (rgb: [number, number, number]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
