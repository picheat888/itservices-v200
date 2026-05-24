import { brandForeground, resolveBrand } from '@/lib/brand-color';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

// Applies UI preferences (dark mode, brand accent, corner radius) to the document
// root so the whole app reacts to theme changes.
export function useApplyTheme() {
    const dark = useUiStore((s) => s.dark);
    const radius = useUiStore((s) => s.radius);
    const accent = useUiStore((s) => s.accent);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    useEffect(() => {
        document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
    }, [radius]);

    useEffect(() => {
        // A near-black accent collides with the dark canvas — resolveBrand lightens
        // it in dark mode; brandForeground keeps on-brand text legible either way.
        const brand = resolveBrand(accent, dark);
        document.documentElement.style.setProperty('--brand', brand);
        document.documentElement.style.setProperty('--brand-foreground', brandForeground(brand));
    }, [accent, dark]);
}
