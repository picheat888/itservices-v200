import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { localPair } from '@/shared/lib/local-name';
import { toRecordId } from '@/shared/lib/utils';
import type { StockCount } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useUiStore } from '@/stores/ui';
import { ClipboardList, ClipboardX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CountDoneDialog } from '../../components/count/count-done-dialog';
import { CountOpenDialog } from '../../components/count/count-open-dialog';
import { CountSheetDialog } from '../../components/count/count-sheet-dialog';
import { useStockCount, useStockCountMutations, useStockCounts } from '../../hooks/use-stock';
import { stockRefusalText } from '../../lib/refusal';

const statusTone = (s: StockCount['status']) => (s === 'committed' ? 'green' : s === 'canceled' ? 'gray' : 'amber');

/** Stock Count tab: the list of count sheets; opening, counting and confirming happen in the count dialogs. */
export function AuditTab({ can }: { can: (p: string) => boolean }) {
    const fmt = useDateFormat();
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    // Page and rows-per-page live in the URL (?page, ?per).
    const list = useListParams();
    const { page, perPage } = list;
    const {
        data: sessionsPage,
        isLoading: sessionsLoading,
        isFetching: sessionsFetching,
        isPlaceholderData: sessionsPlaceholder,
    } = useStockCounts({ page, per_page: perPage }, can('view_count'));
    const sessions = sessionsPage?.data ?? [];
    const { cancel } = useStockCountMutations();
    const [creating, setCreating] = useState(false);

    // The open count sheet is in the URL (?count=<id>) so a reload or a shared link reopens it
    const countId = toRecordId(list.get('count') || null);
    const sheetOpen = countId !== null;
    // The last id is kept after close so the loaded session stays mounted during the close animation
    const [lastId, setLastId] = useState<number | null>(countId);
    useEffect(() => {
        if (countId !== null) setLastId(countId);
    }, [countId]);
    const shownId = countId ?? lastId;
    const { data: session, isError: sessionFailed, error: sessionError, refetch: refetchSession } = useStockCount(shownId, sheetOpen);
    const sessionMissing = (sessionError as { response?: { status?: number } } | null)?.response?.status === 404;
    // Opening pushes a history entry so Back closes the sheet (and asks first while counts are typed)
    const dialogs = usePageDialogs();
    const openSheet = (id: number) => dialogs.open({ count: String(id) });
    const closeSheet = () => dialogs.close(['count']);
    // A recount takes this entry's place, so closing it lands on the list
    const swapSheet = (id: number) => dialogs.replace((p) => p.set('count', String(id)));

    // A confirmed sheet opens in its own dialog; before the record arrives the list row says which one
    const status = session?.id === shownId ? session.status : sessions.find((s) => s.id === shownId)?.status;
    const done = status === 'committed';
    const shownCount = session?.id === shownId ? session : undefined;
    const pending = { missing: sessionMissing, failed: sessionFailed, onRetry: () => void refetchSession() };

    const sessionColumns: Column<StockCount>[] = [
        {
            key: 'reference',
            sticky: 'left',
            header: t('stock_doc_no'),
            width: '120px',
            className: 'whitespace-nowrap',
            render: (s) => <span className="text-xs font-semibold">{s.reference}</span>,
        },
        {
            key: 'created_at',
            header: t('audit_time'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (s) => <span className="text-muted-foreground text-xs">{fmt.date(s.created_at)}</span>,
        },
        {
            key: 'warehouse',
            header: t('stock_warehouse'),
            width: '116px',
            render: (s) => <TruncText text={s.warehouse || '—'} className="text-sm" />,
        },
        {
            key: 'category',
            header: t('stock_category'),
            width: '160px',
            className: 'whitespace-nowrap',
            render: (s) => <TruncText text={localPair(s.category, s.category_th, lang)} className="text-sm" />,
        },
        {
            key: 'counted_by',
            header: t('stock_counted_by'),
            minWidth: '11rem',
            className: 'whitespace-nowrap',
            render: (s) => <TruncText text={s.counted_by} className="text-sm" />,
        },
        {
            key: 'note',
            header: t('stock_notes'),
            minWidth: '12rem',
            render: (s) => <TruncText text={s.note} className="text-muted-foreground text-xs" />,
        },
        {
            key: 'progress',
            header: t('stock_count_progress'),
            align: 'right',
            width: '80px',
            className: 'whitespace-nowrap',
            render: (s) => (
                <span className="text-xs tabular-nums">
                    {fmtN(s.counted_lines ?? 0)}/{fmtN(s.line_count ?? 0)}
                </span>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            width: '180px',
            className: 'whitespace-nowrap',
            // Older sheets confirmed to adjust later keep their badge beside the status
            render: (s) => (
                <span className="inline-flex items-center gap-1.5">
                    <StatusBadge tone={statusTone(s.status)}>{t(`stock_count_${s.status}`)}</StatusBadge>
                    {s.status === 'committed' && s.adjust_mode === 'manual' && (
                        <StatusBadge tone="gray">{t('stock_count_mode_badge_manual')}</StatusBadge>
                    )}
                </span>
            ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('actions')}</span>,
            align: 'right',
            width: '60px',
            render: (s) =>
                s.status === 'draft' && can('view_count') ? (
                    <button
                        type="button"
                        // Cancel a draft session — confirm first, and stop the row's open-on-click.
                        onClick={async (e) => {
                            e.stopPropagation();
                            await confirm({
                                variant: 'warn',
                                title: t('stock_count_cancel'),
                                description: t('stock_count_cancel_confirm'),
                                entity: { name: s.reference },
                                confirmText: t('stock_count_cancel'),
                                cancelText: t('stock_count_back'),
                                action: () => cancel.mutateAsync(s.id),
                                errorMessage: (e) => stockRefusalText(e, t),
                            });
                        }}
                        aria-label={t('stock_count_cancel_draft')}
                        title={t('stock_count_cancel_draft')}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                    >
                        <ClipboardX className="h-4 w-4" aria-hidden />
                    </button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-3">
            {can('view_count') && (
                <div className="flex items-center justify-between gap-3">
                    <p id="stock-count-start-hint" className="text-muted-foreground text-sm">
                        {t('stock_count_start_hint')}
                    </p>
                    <Button onClick={() => setCreating(true)} aria-describedby="stock-count-start-hint">
                        <ClipboardList className="h-4 w-4" aria-hidden />
                        {t('stock_count_start_new')}
                    </Button>
                </div>
            )}

            <DataTable
                columns={sessionColumns}
                rows={sessions}
                rowKey={(s) => s.id}
                onRowClick={(s) => openSheet(s.id)}
                loading={sessionsLoading || (sessionsFetching && sessionsPlaceholder)}
                server={{ ...list.table.paging, total: sessionsPage?.meta.total ?? 0 }}
                empty={{
                    title: t('stock_empty_audit'),
                    hint: can('view_count') ? t('stock_empty_audit_hint').replace('{button}', t('stock_count_start_new')) : null,
                }}
            />

            <CountOpenDialog open={creating} onOpenChange={setCreating} onOpened={(created) => openSheet(created.id)} />

            <CountSheetDialog
                open={sheetOpen && !done}
                count={done ? undefined : shownCount}
                {...pending}
                canEdit={can('view_count')}
                onClose={closeSheet}
                onRefetch={() => refetchSession({ cancelRefetch: false })}
            />
            <CountDoneDialog
                open={sheetOpen && done}
                count={done ? shownCount : undefined}
                {...pending}
                canRecount={can('view_count')}
                onClose={closeSheet}
                onOpenCount={swapSheet}
            />
        </div>
    );
}
