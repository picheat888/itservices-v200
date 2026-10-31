// Fallback while a page's code downloads: nothing for the first 300ms, then a page header and table skeleton.
import { useT } from '@/lang';
import { TableSkeleton } from '@/shared/components/skeletons';
import { Skeleton } from '@/shared/ui/skeleton';
import { useEffect, useState } from 'react';

/** A fast download never shows the skeleton, so it does not flash. */
export const PAGE_LOADING_DELAY_MS = 300;

export function PageLoading() {
    const t = useT();
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setShown(true), PAGE_LOADING_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, []);

    if (!shown) return null;

    return (
        <div role="status" aria-busy="true" className="motion-safe:animate-in motion-safe:fade-in-0 space-y-6 duration-200">
            <span className="sr-only">{t('loading')}</span>
            <div className="mb-3 space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <TableSkeleton rows={8} cols={5} />
        </div>
    );
}
