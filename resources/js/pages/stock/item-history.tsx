import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useStockItemHistory } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import type { SerialEvent, StockItemHistory } from '@/shared/types';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronLeft, Printer, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

type View = 'issue' | 'receive' | 'adjust' | 'transfer';
type Movement = StockItemHistory['movements'][number];

const VIEW_META: Record<View, { titleKey: string; icon: typeof ArrowDownToLine; tone: string; bg: string }> = {
    issue: { titleKey: 'stock_hist_issue', icon: ArrowUpFromLine, tone: 'text-destructive', bg: 'bg-red-100 dark:bg-red-950/40' },
    receive: { titleKey: 'stock_hist_receive', icon: ArrowDownToLine, tone: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/40' },
    adjust: { titleKey: 'stock_hist_adjust', icon: SlidersHorizontal, tone: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/40' },
    transfer: { titleKey: 'stock_hist_transfer', icon: ArrowLeftRight, tone: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950/40' },
};

/** Which movement types + serial-event name belong to each view. */
const VIEW_FILTER: Record<View, { types: string[]; event: SerialEvent['event'] }> = {
    issue: { types: ['issue'], event: 'issued' },
    receive: { types: ['receive'], event: 'received' },
    adjust: { types: ['adjust_up', 'adjust_down'], event: 'adjusted' },
    transfer: { types: ['transfer'], event: 'transferred' },
};

/** "YYYY-MM-DD HH:mm" from an ISO string. */
function fmt(iso: string | null): string {
    return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : '—';
}

export default function ItemHistoryPage() {
    const t = useT();
    useDocumentTitle('stock_history'); // tab title → "History - <brand>"
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const view = (params.get('v') as View | null) ?? null;
    const { data, isLoading } = useStockItemHistory(id ? Number(id) : null);

    if (isLoading || !data) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="border-muted-foreground/30 border-t-primary h-7 w-7 animate-spin rounded-full border-2" />
            </div>
        );
    }

    /** Serial codes touched by a movement, matched via the serial-event doc_no / reference. */
    const serialsOf = (m: Movement, event: SerialEvent['event']): string[] =>
        data.serials
            .filter((s) =>
                s.events.some((e) => e.event === event && ((m.doc_no && e.doc_no === m.doc_no) || (m.reference && e.reference === m.reference))),
            )
            .map((s) => s.serial);

    const moves = (v: View) => data.movements.filter((m) => VIEW_FILTER[v].types.includes(m.type));

    return (
        <div className="bg-background mx-auto min-h-screen max-w-5xl px-6 py-8">
            {/* Print-only document header (A4) */}
            <div className="mb-4 hidden print:block">
                <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-base font-semibold">
                            {view ? t(VIEW_META[view].titleKey as Parameters<typeof t>[0]) : t('stock_hist_overview')} · {data.item.name}
                        </div>
                        <div className="mt-0.5 font-mono text-sm">SKU : {data.item.sku}</div>
                    </div>
                    <div className="text-right text-sm whitespace-nowrap">
                        {t('stock_current')} <span className="font-mono text-base font-bold">{data.item.current_stock}</span>
                    </div>
                </div>
                <hr className="mt-2 border-black/50" />
            </div>

            {/* Back (only on a sub-view) */}
            {view && (
                <button
                    type="button"
                    onClick={() => setParams({})}
                    className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm font-medium print:hidden"
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('stock_hist_back')}
                </button>
            )}

            {/* Header (screen only) */}
            <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
                <div className="min-w-0">
                    <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t('stock_history_title')}</div>
                    <h1 className="mt-1 truncate text-xl font-semibold">{data.item.name}</h1>
                    <div className="text-muted-foreground mt-1 font-mono text-sm">{data.item.sku}</div>
                </div>
                <button
                    type="button"
                    onClick={() => window.open(`/api/stock-items/${data.item.id}/history/pdf?v=${view ?? 'summary'}`, '_blank')}
                    className="border-border hover:bg-muted/50 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium print:hidden"
                >
                    <Printer className="h-4 w-4" />
                    {t('stock_history_pdf')}
                </button>
            </div>

            {view ? <CategoryView view={view} movements={moves(view)} serialsOf={serialsOf} /> : <Hub data={data} onOpen={(v) => setParams({ v })} />}

            {/* Print-only footer */}
            <div className="mt-6 hidden border-t border-black/30 pt-2 text-center text-xs print:block">
                {data.item.sku} · {data.item.name}
            </div>
        </div>
    );

    // ── Hub ───────────────────────────────────────────────────────────────
    function Hub({ data, onOpen }: { data: StockItemHistory; onOpen: (v: View) => void }) {
        return (
            <>
                <h2 className="mb-2 text-sm font-semibold">{t('stock_history_other')}</h2>
                <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
                    {(Object.keys(VIEW_META) as View[]).map((v) => {
                        const meta = VIEW_META[v];
                        const Icon = meta.icon;
                        return (
                            <button
                                key={v}
                                type="button"
                                onClick={() => onOpen(v)}
                                className="border-border hover:bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition"
                            >
                                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.bg)}>
                                    <Icon className={cn('h-4 w-4', meta.tone)} />
                                </span>
                                <span className="truncate">{t(meta.titleKey as Parameters<typeof t>[0])}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="border-border bg-muted/30 mb-6 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm print:hidden">
                    <span className="text-muted-foreground">{t('stock_current')}</span>
                    <span className="font-mono text-lg font-bold">{data.item.current_stock}</span>
                </div>

                {data.item.track_serial && (
                    <Table
                        headers={['#', t('stock_hist_serial'), t('stock_hist_receive_date'), t('stock_hist_receive_no')]}
                        rows={data.serials.map((s, i) => {
                            const recv = s.events.find((e) => e.event === 'received');
                            return [String(i + 1), <span className="font-mono">{s.serial}</span>, fmt(recv?.occurred_at ?? null), recv?.doc_no ?? '—'];
                        })}
                    />
                )}
            </>
        );
    }

    // ── A category sub-view ────────────────────────────────────────────────
    function CategoryView({
        view,
        movements,
        serialsOf,
    }: {
        view: View;
        movements: Movement[];
        serialsOf: (m: Movement, e: SerialEvent['event']) => string[];
    }) {
        const meta = VIEW_META[view];
        const ev = VIEW_FILTER[view].event;
        const action = (m: Movement) => t(`stock_mv_${m.type}` as Parameters<typeof t>[0]);
        const serialCell = (m: Movement) => {
            const list = serialsOf(m, ev);
            return list.length ? <span className="font-mono text-xs">{list.join(', ')}</span> : '—';
        };

        let headers: string[];
        let rows: ReactNode[][];

        if (view === 'issue') {
            headers = ['#', t('stock_doc_no'), t('audit_time'), t('stock_hist_action'), t('stock_warehouse'), t('stock_hist_issue_by'), t('stock_hist_request_by'), t('stock_hist_request_no'), t('stock_hist_serials')];
            rows = movements.map((m, i) => [String(i + 1), <span className="font-mono">{m.doc_no ?? '—'}</span>, fmt(m.moved_at), action(m), m.from_label ?? '—', m.recorded_by ?? '—', m.to_label ?? '—', m.reference ?? '—', serialCell(m)]);
        } else if (view === 'receive') {
            headers = ['#', t('stock_doc_no'), t('audit_time'), t('stock_hist_action'), t('stock_supplier'), t('stock_hist_ref_doc'), t('stock_warehouse'), t('stock_cost'), t('stock_hist_serials'), t('stock_qty'), t('stock_hist_note')];
            rows = movements.map((m, i) => [String(i + 1), <span className="font-mono">{m.doc_no ?? '—'}</span>, fmt(m.moved_at), action(m), m.from_label ?? '—', m.reference ?? '—', m.to_label ?? '—', m.unit_cost != null ? <span className="font-mono">{m.unit_cost}</span> : '—', serialCell(m), <span className="font-mono">{m.qty}</span>, m.notes ?? '—']);
        } else if (view === 'adjust') {
            headers = ['#', t('stock_doc_no'), t('audit_time'), t('stock_hist_ref_doc'), t('stock_hist_action'), t('stock_hist_adjust_by'), t('stock_hist_serials'), t('stock_qty'), t('stock_hist_note')];
            rows = movements.map((m, i) => [String(i + 1), <span className="font-mono">{m.doc_no ?? '—'}</span>, fmt(m.moved_at), m.reference ?? '—', action(m), m.recorded_by ?? '—', serialCell(m), <span className="font-mono">{m.qty}</span>, m.notes ?? '—']);
        } else {
            headers = ['#', t('stock_doc_no'), t('audit_time'), t('stock_hist_action'), t('stock_from'), t('stock_to'), t('stock_hist_transfer_by'), t('stock_hist_serials'), t('stock_qty'), t('stock_hist_note')];
            rows = movements.map((m, i) => [String(i + 1), <span className="font-mono">{m.doc_no ?? '—'}</span>, fmt(m.moved_at), action(m), m.from_label ?? '—', m.to_label ?? '—', m.recorded_by ?? '—', serialCell(m), <span className="font-mono">{m.qty}</span>, m.notes ?? '—']);
        }

        const Icon = meta.icon;
        return (
            <>
                <div className="mb-3 flex items-center gap-2 print:hidden">
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', meta.bg)}>
                        <Icon className={cn('h-4 w-4', meta.tone)} />
                    </span>
                    <h2 className="text-base font-semibold">{t(meta.titleKey as Parameters<typeof t>[0])}</h2>
                    <span className="text-muted-foreground text-sm">· {movements.length}</span>
                </div>
                <Table headers={headers} rows={rows} />
            </>
        );
    }

    // ── Shared table shell (horizontal scroll for wide tables) ─────────────
    function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
        return (
            <div className="border-border overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                        <tr className="text-muted-foreground border-border border-b text-left text-[11px] font-semibold tracking-wide uppercase">
                            {headers.map((h, i) => (
                                <th key={i} className="px-3 py-2 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((cells, r) => (
                            <tr key={r} className="border-border/60 border-b last:border-0">
                                {cells.map((c, ci) => (
                                    <td key={ci} className="px-3 py-2 align-top whitespace-nowrap">
                                        {c}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={headers.length} className="text-muted-foreground px-3 py-8 text-center">
                                    {t('stock_history_no_events')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    }
}
