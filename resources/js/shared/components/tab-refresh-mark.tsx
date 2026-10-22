// A tab's refresh mark: a slot beside the label that opens only while the tab refreshes (spinner, then a short check), so idle tabs keep their labels centred.
// TabBarStatus announces it once per bar, outside the tablist, because a tab's children are presentational.
import { useT } from '@/lang';
import { barRefreshMark, slotView, type RefreshMark } from '@/shared/lib/refresh-mark';
import { cn } from '@/shared/lib/utils';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

/** The -ml-1.5 cancels the tab's gap while closed; the inner pl-1.5 spaces the icon when open. */
export function TabRefreshMark({ mark }: { mark: RefreshMark }) {
    const [lastShown, setLastShown] = useState<'busy' | 'done'>('busy');
    if (mark !== 'idle' && mark !== lastShown) setLastShown(mark);
    const view = slotView(mark, lastShown);
    return (
        <span
            aria-hidden="true"
            className={cn(
                '-ml-1.5 inline-flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none',
                view.open ? 'w-5 opacity-100' : 'w-0 opacity-0',
            )}
        >
            <span className="inline-flex shrink-0 pl-1.5">
                {view.icon === 'spin' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {view.icon === 'check' && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
            </span>
        </span>
    );
}

export function TabBarStatus({ marks }: { marks: readonly (RefreshMark | undefined)[] }) {
    const t = useT();
    const mark = barRefreshMark(marks);
    return (
        <span role="status" className="sr-only">
            {mark === 'busy' ? t('cmn_refreshing') : mark === 'done' ? t('cmn_refreshed') : ''}
        </span>
    );
}
