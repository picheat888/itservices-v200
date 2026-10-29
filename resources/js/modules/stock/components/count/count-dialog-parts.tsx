// Shared parts of the count sheet and confirmed dialogs: the facts row and the loading / missing / failed body.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { RecordMissing, recordMissingContentClass } from '@/shared/components/record-missing';
import { StatusBadge } from '@/shared/components/status-badge';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockCount } from '@/shared/types';
import { DialogFooterBar } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { ClipboardCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const FACT_COLS = { 4: 'grid-cols-4', 5: 'grid-cols-5' } as const;

const PENDING_TONE: Record<StockCount['status'], 'green' | 'gray' | 'amber'> = { committed: 'green', canceled: 'gray', draft: 'amber' };

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

// Row heights of the two tables (CountSheetRow, CountReadRow) so the skeleton is as tall as what replaces it
const ROW_H = { sheet: 'h-[53px]', done: 'h-[49px]' } as const;
// Footer buttons of each dialog (sheet: cancel, save draft, review; done: print, close)
const FOOTER = { sheet: ['w-[99px]', 'w-[88px]', 'w-[140px]'], done: ['w-[88px]', 'w-[72px]'] } as const;
const SKELETON_ROWS = { sheet: 12, doneFallback: 6, doneMax: 14 } as const;
const COLS = {
    sheet: ['', 'w-[72px] lg:w-[90px]', 'w-[104px] lg:w-[120px]', 'w-[88px] lg:w-[96px]', 'w-[210px] lg:w-[330px]'],
    done: ['', 'w-[72px] lg:w-[90px]', 'w-[72px] lg:w-[90px]', 'w-[88px] lg:w-[96px]', 'w-[220px] lg:w-[360px]'],
} as const;
const bar = (className: string) => <Skeleton className={className} />;

/** What a count dialog shows before its record arrives: a skeleton shaped like the sheet, the retry panel, or "record missing". */
export function CountDialogPending({
    kind,
    missing,
    failed,
    onRetry,
    onClose,
    listed,
}: {
    /** The draft sheet (fixed height) or the confirmed one (as tall as its differing lines). */
    kind: 'sheet' | 'done';
    missing: boolean;
    failed: boolean;
    onRetry: () => void;
    onClose: () => void;
    /** The list row the sheet opened from: its header already shows the reference and status the record will. */
    listed?: Pick<StockCount, 'reference' | 'status' | 'differing_lines'>;
}) {
    const t = useT();
    if (missing) return <RecordMissing onClose={onClose} />;
    const done = kind === 'done';
    const rows = done ? Math.min(listed?.differing_lines ?? SKELETON_ROWS.doneFallback, SKELETON_ROWS.doneMax) : SKELETON_ROWS.sheet;
    const facts = done
        ? ['stock_warehouse', 'stock_count_opened_by', 'stock_count_opened_at', 'stock_count_committed_by', 'stock_count_committed_at']
        : ['stock_warehouse', 'stock_count_opened_by', 'stock_count_opened_at', 'stock_count_fact_progress'];
    const heads = [
        { label: t('stock_item'), align: '' },
        { label: t('stock_count_col_system'), align: 'text-right' },
        { label: t('stock_count_col_counted'), align: 'text-right' },
        { label: t('stock_count_col_diff'), align: 'text-center' },
        { label: t('stock_count_col_reason'), align: '' },
    ];
    return (
        <>
            {/* Radix requires a DialogTitle while the record loads */}
            <FocusDialogHeader
                icon={ClipboardCheck}
                eyebrow={listed?.reference ?? t('stock')}
                title={t('stock_count_sheet')}
                srDescription={t('loading')}
                titleSuffix={listed ? <StatusBadge tone={PENDING_TONE[listed.status]}>{t(`stock_count_${listed.status}`)}</StatusBadge> : undefined}
            />
            <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden border-t px-6 py-4', done ? 'gap-3.5' : 'gap-3')}>
                {failed ? (
                    <LoadFailedPanel onRetry={onRetry} />
                ) : (
                    <div role="status" className={cn('flex min-h-0 flex-1 flex-col', done ? 'gap-3.5' : 'gap-3')}>
                        <div aria-hidden className={cn('flex min-h-0 flex-1 flex-col', done ? 'gap-3.5' : 'gap-3')}>
                            <CountFacts items={facts.map((key) => ({ label: t(key as Parameters<typeof t>[0]), value: bar('my-0.5 h-4 w-24') }))} />
                            {done ? (
                                <>
                                    <div className="grid shrink-0 grid-cols-4 gap-2">
                                        {(
                                            [
                                                'stock_count_kpi_counted',
                                                'stock_count_kpi_same',
                                                'stock_count_kpi_short',
                                                'stock_count_kpi_over',
                                            ] as const
                                        ).map((key) => (
                                            <div key={key} className="border-border rounded-lg border px-3 py-2.5 text-center">
                                                <div className="text-muted-foreground text-xs">{t(key)}</div>
                                                <div className="flex h-7 items-center justify-center">{bar('h-5 w-10')}</div>
                                                <div className="mt-0.5 flex h-4 items-center justify-center">{bar('h-3 w-16')}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex h-5 w-fit shrink-0 items-center gap-2 text-sm">
                                        <span className="border-input size-4 rounded-[4px] border" />
                                        {t('stock_count_only_diff')}
                                    </div>
                                </>
                            ) : (
                                <div className="flex shrink-0 items-center gap-2">
                                    {bar('h-9 max-w-80 min-w-48 flex-1')}
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <Skeleton key={i} className="h-8 w-20 rounded-full" />
                                    ))}
                                </div>
                            )}
                            <div className={cn('border-border min-h-0 overflow-hidden rounded-lg border', done ? 'shrink' : 'flex-1')}>
                                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                                    <colgroup>
                                        {COLS[kind].map((w, i) => (
                                            <col key={i} className={w || undefined} />
                                        ))}
                                    </colgroup>
                                    <thead className={TABLE_HEAD}>
                                        <tr className="text-muted-foreground text-left text-xs font-medium">
                                            {heads.map((h) => (
                                                <th key={h.label} scope="col" className={cn('border-border border-b px-3 py-2', h.align)}>
                                                    {h.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: rows }, (_, i) => (
                                            <tr key={i} className={ROW_H[kind]}>
                                                <td className="border-border/60 border-b px-3">
                                                    {bar('h-3.5 w-24')}
                                                    {bar('mt-1.5 h-3 w-40 max-w-full')}
                                                </td>
                                                <td className="border-border/60 border-b px-3">{bar('ml-auto h-4 w-8')}</td>
                                                <td className="border-border/60 border-b px-3">
                                                    {bar(done ? 'ml-auto h-4 w-8' : 'ml-auto h-8 w-16')}
                                                </td>
                                                <td className="border-border/60 border-b px-3">{bar('mx-auto h-4 w-8')}</td>
                                                <td className="border-border/60 border-b px-3">{bar(done ? 'h-4 w-3/4' : 'h-8 w-full')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {done && rows === 0 && <EmptyState title={t('stock_count_nothing_to_adjust')} className="min-h-0 py-8" />}
                            </div>
                            {!done && bar('h-3 w-1/2 shrink-0')}
                        </div>
                        <span className="sr-only">{t('loading')}</span>
                    </div>
                )}
            </div>
            {!failed && (
                <DialogFooterBar aria-hidden>
                    {FOOTER[kind].map((w) => (
                        <Skeleton key={w} className={cn('h-9', w)} />
                    ))}
                </DialogFooterBar>
            )}
        </>
    );
}
