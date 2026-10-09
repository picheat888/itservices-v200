import { brandForeground, resolveBrand } from '@/shared/lib/brand-color';
import { whiteReadsOn } from '@/shared/lib/contrast';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

// Applies UI preferences (dark mode, brand accent, corner radius) to the document
// root so the whole app reacts to theme changes.
export function useApplyTheme() {
    const dark = useUiStore((s) => s.dark);
    const radius = useUiStore((s) => s.radius);
    const accent = useUiStore((s) => s.accent);
    const assetStatusColors = useUiStore((s) => s.assetStatusColors);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    useEffect(() => {
        document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
    }, [radius]);

    useEffect(() => {
        // Dark mode lightens a near-black accent; on-brand text stays legible either way
        const brand = resolveBrand(accent, dark);
        document.documentElement.style.setProperty('--brand', brand);
        document.documentElement.style.setProperty('--brand-foreground', brandForeground(brand));
    }, [accent, dark]);

    useEffect(() => {
        // Settings → Assets status colours for the reports' charts (app.css --color-asset-*), with each count's ink
        const root = document.documentElement.style;
        for (const [status, color] of Object.entries(assetStatusColors)) {
            const key = status.replace(/_/g, '-');
            root.setProperty(`--asset-status-${key}`, color);
            root.setProperty(
                `--asset-on-${key}`,
                whiteReadsOn(color, dark ? ASSET_SOFT_DARK : ASSET_SOFT_LIGHT) ? '#ffffff' : `color-mix(in oklch, ${color} 25%, black)`,
            );
        }
    }, [assetStatusColors, dark]);
}

/** app.css --asset-soft: how much of the status colour a chart fill keeps, per theme. */
const ASSET_SOFT_LIGHT = 0.72;
const ASSET_SOFT_DARK = 0.82;
