// Sidebar menu scroll state: fades at the hidden ends, ▾ to page down, the open page's item kept in view.
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { FADE_BELOW, revealOffset, scrollEdges, type ScrollEdges } from './nav-scroll';

export function useNavScroll(navRef: RefObject<HTMLElement | null>, revealKey: string) {
    const [edges, setEdges] = useState<ScrollEdges>({ above: false, below: false });

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const measure = () => {
            const next = scrollEdges(nav.scrollTop, nav.clientHeight, nav.scrollHeight);
            setEdges((prev) => (prev.above === next.above && prev.below === next.below ? prev : next));
        };
        measure();
        nav.addEventListener('scroll', measure, { passive: true });
        // The list inside grows when the menu's permissions arrive
        const observer = new ResizeObserver(measure);
        observer.observe(nav);
        if (nav.firstElementChild) observer.observe(nav.firstElementChild);
        return () => {
            nav.removeEventListener('scroll', measure);
            observer.disconnect();
        };
    }, [navRef]);

    // Scrolls the menu itself only, never the page
    useEffect(() => {
        const nav = navRef.current;
        const item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!nav || !item) return;
        nav.scrollTop += revealOffset(item.getBoundingClientRect(), nav.getBoundingClientRect());
    }, [navRef, revealKey]);

    const pageDown = useCallback(() => {
        const nav = navRef.current;
        if (!nav) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        nav.scrollBy({ top: nav.clientHeight - FADE_BELOW, behavior: reduceMotion ? 'auto' : 'smooth' });
    }, [navRef]);

    return { edges, pageDown };
}
