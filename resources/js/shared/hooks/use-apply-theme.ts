import { brandForeground, resolveBrand } from '@/shared/lib/brand-color';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

// Applies UI preferences (language, dark mode, brand accent, corner radius) to the document
// root so the whole app reacts to them.
export function useApplyTheme() {
    const lang = useUiStore((s) => s.lang);
    const dark = useUiStore((s) => s.dark);
    const radius = useUiStore((s) => s.radius);
    const accent = useUiStore((s) => s.accent);
    const assetStatusColors = useUiStore((s) => s.assetStatusColors);

    // Screen readers pick their voice from <html lang>; the server renders the page as en.
    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    useEffect(() => {
        document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
    }, [radius]);

    useEffect(() => {
        // resolveBrand lightens a near-black accent in dark mode; brandForeground keeps text on it legible.
        const brand = resolveBrand(accent, dark);
        document.documentElement.style.setProperty('--brand', brand);
        document.documentElement.style.setProperty('--brand-foreground', brandForeground(brand));
    }, [accent, dark]);

    useEffect(() => {
        // Settings → Assets status colours as CSS variables, read by the report charts (app.css --color-asset-*).
        for (const [status, color] of Object.entries(assetStatusColors)) {
            document.documentElement.style.setProperty(`--asset-status-${status.replace(/_/g, '-')}`, color);
        }
    }, [assetStatusColors]);
}
