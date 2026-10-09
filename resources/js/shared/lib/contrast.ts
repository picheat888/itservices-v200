/**
 * WCAG contrast helpers for colours an administrator picks (Settings → Assets status colours).
 *
 * A picked colour is fine as a dot or a tint, but as small text on its own tint it often falls
 * short of 4.5:1 (#059669 "ready" is about 3.2:1 in light mode). `readableInk` keeps the hue and
 * mixes it toward black (light theme) or white (dark theme) only as far as needed to reach the
 * target, so every badge stays recognisably its own colour and stays readable.
 */

type Rgb = [number, number, number];

/** The page/card grounds a badge sits on, per theme (resources/css/app.css --card). */
export const LIGHT_GROUND: Rgb = [255, 255, 255];
export const DARK_GROUND: Rgb = [19, 23, 32]; // hsl(222, 24%, 10%)

/** "#rrggbb" / "#rgb" → [r, g, b]; null when it is not a hex colour. */
export function hexToRgb(hex: string): Rgb | null {
    const m = hex.trim().replace(/^#/, '');
    const full =
        m.length === 3
            ? m
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m;
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `top` at `alpha` laid over `bottom` (both opaque). */
export function blend(top: Rgb, bottom: Rgb, alpha: number): Rgb {
    return top.map((v, i) => v * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
    const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two opaque colours (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * A text colour for `hex` on a tint of itself (`tintAlpha` over `ground`) that reaches `target`:
 * the colour itself when it already does, otherwise mixed toward black (light ground) or white
 * (dark ground) in 5% steps until it does. Returns the input unchanged when it is not a hex.
 */
export function readableInk(hex: string, ground: Rgb, tintAlpha: number, target = 4.5): string {
    const base = hexToRgb(hex);
    if (!base) return hex;
    const background = blend(base, ground, tintAlpha);
    const toward: Rgb = luminance(ground) > 0.5 ? [0, 0, 0] : [255, 255, 255];
    for (let step = 0; step <= 20; step++) {
        const ink = blend(toward, base, step * 0.05);
        if (contrastRatio(ink, background) >= target) return toHex(ink);
    }
    return toHex(toward);
}
