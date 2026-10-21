// Spinner while a tab's data refetches, then a short check; sits in the tab's reserved right padding so the tab keeps its width.
// TabBarStatus announces it once per bar, outside the tablist, because a tab's children are presentational.
import { useT } from '@/lang';
import { barRefreshMark, type RefreshMark } from '@/shared/lib/refresh-mark';
import { Check, Loader2 } from 'lucide-react';

export function TabRefreshMark({ mark }: { mark: RefreshMark }) {
    return (
        <>
            {mark === 'busy' && <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin" aria-hidden="true" />}
            {mark === 'done' && (
                <Check
                    className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                />
            )}
        </>
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
