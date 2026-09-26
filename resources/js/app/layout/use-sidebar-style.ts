import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useUiStore } from '@/stores/ui';

/**
 * Below this width the labelled sidebar costs a tablet a quarter of its screen, and the
 * tables beside it lose their columns — so the sidebar starts as icons there.
 * Tailwind's `xl` breakpoint, so the CSS and this switch agree on "narrow".
 */
const NARROW_QUERY = '(max-width: 1279.98px)';

/**
 * The sidebar style actually on screen, and what the ≡ button does.
 *
 * On a wide screen that is the reader's saved preference (labelled or icons), toggled and
 * remembered as before. On a narrow one it is icons unless the reader opened the labels
 * for now; that choice is not saved, so rotating a tablet or reloading brings the icons
 * back and the saved preference for the desktop is never overwritten.
 */
export function useSidebarStyle(): { iconsOnly: boolean; narrow: boolean; toggle: () => void } {
    const narrow = useMediaQuery(NARROW_QUERY);
    const saved = useUiStore((s) => s.sidebar);
    const toggleSaved = useUiStore((s) => s.toggleSidebar);
    const narrowOpen = useUiStore((s) => s.narrowSidebarOpen);
    const setNarrowOpen = useUiStore((s) => s.setNarrowSidebarOpen);

    if (narrow) {
        return { iconsOnly: !narrowOpen, narrow, toggle: () => setNarrowOpen(!narrowOpen) };
    }

    return { iconsOnly: saved === 'icons', narrow, toggle: toggleSaved };
}
