import { Button } from '@/shared/ui/button';
import { Undo2 } from 'lucide-react';

/**
 * One-line notice above the asset tabs: N assets their holders sent back, waiting for IT to
 * receive them into a warehouse, with a button that lists them (or shows everything again).
 * Receiving itself is done from each row's own button in the inventory table.
 *
 * It sits above the tabs, so arriving late would push the whole page down. It doesn't:
 * `count` comes from the sidebar badge query, which ProtectedRoute loads alongside the
 * signed-in check and waits for (usePrefetchSidebarBadges) — the page draws with it known.
 * Undefined only if that load failed; then the strip is simply left out.
 *
 * Used by: asset page (pages/index.tsx).
 */
export function PendingReturnStrip({
    count,
    active,
    onToggle,
    t,
}: {
    /** Assets awaiting receipt; undefined if the count could not be loaded. */
    count: number | undefined;
    /** The inventory list is currently filtered to these assets. */
    active: boolean;
    onToggle: () => void;
    t: (key: string) => string;
}) {
    if (!count) return null;

    return (
        <section
            aria-label={t('asset_pending_return_strip').replace('{count}', String(count))}
            className="flex h-12 items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4"
        >
            <Undo2 className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            {/* Read as one sentence: what happened, then the count in bold. */}
            <p className="min-w-0 truncate text-sm">
                {t('asset_pending_return_strip_hint')}{' '}
                <strong className="font-bold">{t('asset_pending_return_strip').replace('{count}', String(count))}</strong>
            </p>
            <Button size="sm" variant="outline" className="ml-auto shrink-0" aria-pressed={active} onClick={onToggle}>
                {active ? t('asset_pending_return_show_all') : t('asset_pending_return_show')}
            </Button>
        </section>
    );
}
