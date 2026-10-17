import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
    const watched = useRef<{ box: HTMLElement; stop: () => void } | null>(null);

    // Checked after every render: the box can appear later (behind a tab) or be replaced
    // eslint-disable-next-line react-hooks/exhaustive-deps -- returns at once unless the box changed
    useLayoutEffect(() => {
        const box = boxRef.current;
        if (watched.current?.box === box) return;
        watched.current?.stop();
        watched.current = box ? { box, stop: watchTableWidth(box, setFits) } : null;
    });

    useLayoutEffect(
        () => () => {
            watched.current?.stop();
            watched.current = null;
        },
        [],
    );

    return fits;
}

/** Follows the box and whichever <table> it holds; returns the teardown. */
function watchTableWidth(box: HTMLElement, setFits: (fits: boolean) => void): () => void {
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
}
