import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

// Applies persisted UI preferences (dark mode, brand accent, corner radius)
// to the document root so the whole app reacts to Tweaks changes.
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
        document.documentElement.style.setProperty('--brand', accent);
    }, [accent, dark]);
}
