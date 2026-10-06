import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * The height to hold a paged table's box at while its next page loads (undefined otherwise).
 *
 * Skeleton rows are rarely as tall as the real rows they stand in for, so a table shrank while
 * loading, the pager under it jumped up, and the reader clicking "next" again and again missed
 * the button. Holding the last settled height as a `min-height` keeps the pager under the cursor.
 * The hold lifts as soon as the page arrives — a genuinely shorter page (last page, narrower
 * filter) still shrinks then.
 *
 * Used by: shared DataTable, asset inventory, contract list, permission audit log.
 */
export function useHeldHeight(ref: RefObject<HTMLElement | null>, loading: boolean): number | undefined {
    const settledHeight = useRef<number | null>(null);

    // After every settled render, remember the height (read on the next render that is loading).
    useLayoutEffect(() => {
        if (!loading && ref.current) settledHeight.current = ref.current.offsetHeight;
    });

    return loading && settledHeight.current ? settledHeight.current : undefined;
}
