import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Whether the <table> inside `boxRef` fits the box's width, kept current as either resizes.
 *
 * A table header can only stick to the top of the page while the reader scrolls if nothing
 * between it and the page's scroller is a scroll box — but a table wider than its card needs
 * `overflow-x-auto` (a scroll box) to stay reachable sideways. CSS cannot do both, so a table
 * uses this to choose: fits → clip overflow and let the header stick; too wide (e.g. a 768px
 * tablet) → scroll sideways, header not sticky.
 *
 * Measures `table.offsetWidth` (its laid-out width, at least its min-content), which does not
 * depend on the box's overflow mode — so switching modes cannot flip the answer back and forth.
 *
 * Used by: shared DataTable, asset inventory, contract list, permission audit log.
 */
export function useTableFitsWidth(boxRef: RefObject<HTMLElement | null>): boolean {
    const [fits, setFits] = useState(true);

    useLayoutEffect(() => {
        const box = boxRef.current;
        if (!box) return;

        // The <table> can mount after the box or be swapped for a new one when rows arrive
        let table: HTMLTableElement | null = null;
        const measure = () => setFits(!table || table.offsetWidth <= box.clientWidth + 1);
        const sizes = new ResizeObserver(measure);
        const follow = () => {
            const current = box.querySelector('table');
            if (current !== table) {
                if (table) sizes.unobserve(table);
                table = current;
                if (table) sizes.observe(table);
            }
            measure();
        };
        sizes.observe(box);
        follow();
        const swaps = new MutationObserver(follow);
        swaps.observe(box, { childList: true, subtree: true });
        return () => {
            sizes.disconnect();
            swaps.disconnect();
        };
    }, [boxRef]);

    return fits;
}
