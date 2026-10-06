import { Button } from '@/shared/ui/button';
import { Undo2 } from 'lucide-react';
import { useEffect } from 'react';

/**
 * One-line notice above the asset tabs: N assets their holders sent back, waiting for IT to
 * receive them into a warehouse, with a button that lists them (or shows everything again).
 * Receiving itself is done from each row's own button in the inventory table.
 *
 * Holding its space (it sits above the tabs, so arriving late would push the whole page down):
 * - `count` comes from the sidebar badge query, which the app shell has usually loaded already,
 *   so on a normal visit it is known on the first render and nothing moves;
 * - until it is known (a hard reload), a skeleton strip of the same height holds the space, but
 *   only if the last count this browser saw was above zero — a desk that usually has none does
 *   not get an empty bar that flashes and collapses.
 *
 * Used by: asset page (pages/index.tsx).
 */
export function PendingReturnStrip({
    count,
    active,
    onToggle,
    t,
}: {
    /** Assets awaiting receipt; undefined while not known yet. */
    count: number | undefined;
    /** The inventory list is currently filtered to these assets. */
    active: boolean;
    onToggle: () => void;
    t: (key: string) => string;
}) {
    useEffect(() => {
        if (count !== undefined) rememberCount(count);
    }, [count]);

    if (count === undefined) {
        return lastSeenCount() > 0 ? <PendingReturnStripSkeleton /> : null;
    }
    if (count === 0) return null;

    return (
        <section
            aria-label={t('asset_pending_return_strip').replace('{count}', String(count))}
            className="flex h-12 items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4"
        >
            <Undo2 className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p className="min-w-0 truncate text-sm">
                <span className="font-semibold">{t('asset_pending_return_strip').replace('{count}', String(count))}</span>
                <span className="text-muted-foreground ml-2">{t('asset_pending_return_strip_hint')}</span>
            </p>
            <Button size="sm" variant="outline" className="ml-auto shrink-0" aria-pressed={active} onClick={onToggle}>
                {active ? t('asset_pending_return_show_all') : t('asset_pending_return_show')}
            </Button>
        </section>
    );
}

/** Same box and height as the strip, while the count is still loading. */
function PendingReturnStripSkeleton() {
    return (
        <div aria-hidden="true" className="border-border bg-muted/40 flex h-12 items-center gap-3 rounded-xl border px-4">
            <div className="bg-muted h-4 w-4 rounded motion-safe:animate-pulse" />
            <div className="bg-muted h-4 w-56 max-w-[50%] rounded motion-safe:animate-pulse" />
            <div className="bg-muted ml-auto h-8 w-24 rounded-md motion-safe:animate-pulse" />
        </div>
    );
}

/** Per-browser memory of the last count, so a reload knows whether to hold space. */
const STORAGE_KEY = 'asset-pending-return-last-count';

function lastSeenCount(): number {
    try {
        return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch {
        return 0;
    }
}

function rememberCount(count: number): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(count));
    } catch {
        // Storage blocked (private mode, policy): the strip just won't hold space on a reload.
    }
}
