import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, kept in sync as the window resizes or a
 * tablet rotates. Reads the same breakpoints the stylesheet does, so a component can
 * decide in JS exactly where Tailwind decides in CSS.
 */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mql = window.matchMedia(query);
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
