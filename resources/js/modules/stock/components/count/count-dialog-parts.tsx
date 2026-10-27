// Shared parts of the count sheet and confirmed dialogs: the facts row and the loading / missing / failed body.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { RecordMissing, recordMissingContentClass } from '@/shared/components/record-missing';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { ClipboardCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const FACT_COLS = { 4: 'grid-cols-4', 5: 'grid-cols-5' } as const;

export function CountFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
    return (
        <dl className={cn('grid shrink-0 gap-x-4 gap-y-2', FACT_COLS[items.length === 5 ? 5 : 4])}>
            {items.map((f) => (
                <div key={f.label} className="min-w-0">
                    <dt className="text-muted-foreground text-xs">{f.label}</dt>
                    <dd className="truncate text-sm font-medium">{f.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** The dialog frame switches to the small alert frame while it shows "record missing". */
export const pendingFrameClass = (missing: boolean) => (missing ? recordMissingContentClass : undefined);

/** What a count dialog shows before its record arrives: a skeleton, the retry panel, or "record missing". */
export function CountDialogPending({
    missing,
    failed,
    onRetry,
    onClose,
}: {
    missing: boolean;
    failed: boolean;
    onRetry: () => void;
    onClose: () => void;
}) {
    const t = useT();
    if (missing) return <RecordMissing onClose={onClose} />;
    return (
        <>
            {/* Radix requires a DialogTitle while the record loads */}
            <FocusDialogHeader icon={ClipboardCheck} eyebrow={t('stock')} title={t('stock_count_sheet')} srDescription={t('loading')} />
            <div className="border-t px-6 py-6">
                {failed ? (
                    <LoadFailedPanel onRetry={onRetry} />
                ) : (
                    <div role="status" className="space-y-3">
                        <div className="grid grid-cols-4 gap-2" aria-hidden>
                            {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton key={i} className="h-10" />
                            ))}
                        </div>
                        <div className="space-y-2" aria-hidden>
                            {Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} className="h-10" />
                            ))}
                        </div>
                        <span className="sr-only">{t('loading')}</span>
                    </div>
                )}
            </div>
        </>
    );
}
