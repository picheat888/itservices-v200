import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useUiStore } from '@/stores/ui';

/** Tailwind's `xl` breakpoint: below it the sidebar is a rail that opens as a menu over the page. */
const NARROW_QUERY = '(max-width: 1279.98px)';

/**
 * The sidebar style on screen and what the ≡ button does.
 * Wide: the saved preference (labelled or icons). Narrow: icons, opened for now only (never saved).
 */
export function useSidebarStyle(): { iconsOnly: boolean; narrow: boolean; toggle: () => void; close: () => void } {
    const narrow = useMediaQuery(NARROW_QUERY);
    const saved = useUiStore((s) => s.sidebar);
    const toggleSaved = useUiStore((s) => s.toggleSidebar);
    const narrowOpen = useUiStore((s) => s.narrowSidebarOpen);
    const setNarrowOpen = useUiStore((s) => s.setNarrowSidebarOpen);
    const close = () => setNarrowOpen(false);

    if (narrow) {
        return { iconsOnly: !narrowOpen, narrow, toggle: () => setNarrowOpen(!narrowOpen), close };
    }

    return { iconsOnly: saved === 'icons', narrow, toggle: toggleSaved, close };
}
