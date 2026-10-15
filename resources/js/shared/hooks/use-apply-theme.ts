import { brandForeground, resolveBrand } from '@/shared/lib/brand-color';
import { LIGHT_GROUND, readableInk } from '@/shared/lib/contrast';
import { useUiStore } from '@/stores/ui';
import { useEffect, useLayoutEffect } from 'react';

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
        document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
    }, [radius]);

    // Mode and brand colours swap before paint, in the same frame as colours computed in render, with transitions paused.
    useLayoutEffect(() => {
        const root = document.documentElement;
        const pause = document.createElement('style');
        pause.textContent = '*,*::before,*::after{transition:none!important}';
        document.head.appendChild(pause);

        root.classList.toggle('dark', dark);
        // resolveBrand lightens a near-black accent in dark mode; brandForeground keeps text on it legible.
        const brand = resolveBrand(accent, dark);
        root.style.setProperty('--brand', brand);
        root.style.setProperty('--brand-foreground', brandForeground(brand));
        // Small brand text on brand tints (sidebar counts, active row, avatar initials), 4.5:1 up to a doubled /15 tint
        root.style.setProperty('--brand-ink', dark ? brand : readableInk(brand, LIGHT_GROUND, 0.28));

        // Commit the new colours before transitions come back.
        void window.getComputedStyle(document.body).backgroundColor;
        // Next frame, or a short timer when the tab is hidden and frames do not run.
        const resume = () => pause.remove();
        const frame = requestAnimationFrame(resume);
        const timer = setTimeout(resume, 150);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
            resume();
        };
    }, [accent, dark]);

    useEffect(() => {
        // Settings → Assets status colours as CSS variables, read by the report charts (app.css --color-asset-*).
        for (const [status, color] of Object.entries(assetStatusColors)) {
            document.documentElement.style.setProperty(`--asset-status-${status.replace(/_/g, '-')}`, color);
        }
    }, [assetStatusColors]);
}
