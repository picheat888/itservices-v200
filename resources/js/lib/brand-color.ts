// Shared brand-color helpers so the live theme (use-apply-theme) and the
// Display color picker (Settings) resolve the accent identically.

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
 * The brand color actually shown for a given accent + mode. A near-black accent
 * collides with the dark canvas, so in dark mode it is lightened to a legible
 * grey. Other accents are returned unchanged.
 */
export function resolveBrand(accent: string, dark: boolean): string {
    const rgb = parseHex(accent);
    if (!rgb) return accent;
    if (dark && relLuminance(rgb) < 0.05) return lighten(rgb, 0.82);
    return accent;
}

/** Legible text color to place on top of a brand-colored surface. */
export function brandForeground(hex: string): string {
    const rgb = parseHex(hex);
    if (!rgb) return '#ffffff';
    return relLuminance(rgb) > 0.6 ? '#0f172a' : '#ffffff';
}
