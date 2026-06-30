import { Column, DataTable } from '@/components/shared/data-table';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useWarehouses } from '@/hooks/use-master-data';
import { useStockCount, useStockCountMutations, useStockCounts, useStockItems } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/toast';
import type { StockCountAdjustMode, StockItem } from '@/types';
import { AlertTriangle, Check, ClipboardList, FileText, Loader2, Search, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Stock Count / Audit: open a session, enter physical counts, commit adjustments. */
export function AuditTab({ can }: { can: (p: string) => boolean }) {
    const t = useT();
    const confirm = useConfirm();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const {
        data: sessionsPage,
        isLoading: sessionsLoading,
        isFetching: sessionsFetching,
    } = useStockCounts({ page, per_page: perPage }, can('view_count'));
    const sessions = sessionsPage?.data ?? [];
    const { open, save, commit, cancel } = useStockCountMutations();
    const { data: warehouses = [] } = useWarehouses();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const { data: session } = useStockCount(selectedId);
    const { data: allItems = [] } = useStockItems({});
    const [creating, setCreating] = useState(false);
    const [wh, setWh] = useState('all');
    const [cat, setCat] = useState('all');
    const [selectedSkus, setSelectedSkus] = useState<number[]>([]);
    const [skuSearch, setSkuSearch] = useState('');
    const [entries, setEntries] = useState<Record<number, string>>({});
    const [mode, setMode] = useState<StockCountAdjustMode>('auto');
    // Per-button busy flags so a standalone Save draft never spins the Commit button (and vice-versa).
    const [savingDraft, setSavingDraft] = useState(false);
    const [committing, setCommitting] = useState(false);
    // Brief success flash on the Commit button (the sheet flips to committed view right after).
    const [committedFlash, setCommittedFlash] = useState(false);
    // Serial verification (Auto): serialized lines that came up short need their missing units ticked.
    type SerialCheckItem = {
        stock_item_id: number;
        sku: string | null;
        name: string | null;
        need: number;
        serials: { id: number; serial: string }[];
    };
    const [serialCheck, setSerialCheck] = useState<SerialCheckItem[] | null>(null);
    const [missingByItem, setMissingByItem] = useState<Record<number, number[]>>({});

    const toggleSerial = (itemId: number, serialId: number) =>
        setMissingByItem((prev) => {
            const cur = prev[itemId] ?? [];
            return { ...prev, [itemId]: cur.includes(serialId) ? cur.filter((x) => x !== serialId) : [...cur, serialId] };
        });

    const serialCheckOk = (serialCheck ?? []).every((it) => (missingByItem[it.stock_item_id] ?? []).length === it.need);

    // Persist on-screen counts, then commit with the chosen mode + any ticked-missing serials.
    const runCommit = async (missing: Record<number, number[]>) => {
        if (!session) return;
        setCommitting(true);
        try {
            await save.mutateAsync({ id: session.id, counts: countsPayload() });
            await commit.mutateAsync({ id: session.id, mode, missingSerials: missing });
            setCommittedFlash(true);
            window.setTimeout(() => setCommittedFlash(false), 1200);
        } catch (e) {
            onError(e);
        } finally {
            setCommitting(false);
            setSerialCheck(null);
        }
    };

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
    };

    // Seed the inputs from the session's stored counts whenever it loads/changes.
    useEffect(() => {
        if (!session) return;
        const seed: Record<number, string> = {};
        (session.lines ?? []).forEach((l) => {
            seed[l.id] = l.counted_qty === null ? '' : String(l.counted_qty);
        });
        setEntries(seed);
    }, [session?.id, session?.status]);

    // Reset the New count picker back to its defaults.
    const resetPicker = () => {
        setCreating(false);
        setWh('all');
        setCat('all');
        setSelectedSkus([]);
        setSkuSearch('');
    };

    const start = async () => {
        if (selectedSkus.length === 0) return;
        try {
            const created = await open.mutateAsync({
                warehouse: wh === 'all' ? null : wh,
                category: cat === 'all' ? null : cat,
                stock_item_ids: selectedSkus,
            });
            setSelectedId(created.id);
        } catch (e) {
            onError(e);
        } finally {
            resetPicker();
        }
    };

    const countsPayload = (): Record<number, number | null> => {
        const out: Record<number, number | null> = {};
        Object.entries(entries).forEach(([id, v]) => {
            out[Number(id)] = v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);
        });
        return out;
    };

    const statusTone = (s: string) => (s === 'committed' ? 'green' : s === 'canceled' ? 'gray' : 'amber');

    // ── New count picker: warehouse → categories with stock → selectable SKUs ──
    // "In warehouse W" = the SKU holds stock there (per-warehouse balances).
    const inWarehouse = (i: StockItem, w: string) => (i.balances ?? []).some((b) => b.warehouse === w && b.qty > 0);
    const itemsInWh = wh === 'all' ? allItems : allItems.filter((i) => inWarehouse(i, wh));
    const warehouseOptions = [
        { value: 'all', label: `${t('stock_count_all_wh')} (${allItems.length})`, search: t('stock_count_all_wh') },
        ...warehouses.map((w) => ({
            value: w.name,
            label: `${w.name} (${allItems.filter((i) => inWarehouse(i, w.name)).length})`,
            search: w.name,
        })),
    ];
    const catCounts = itemsInWh.reduce<Record<string, number>>((acc, i) => {
        const c = i.category ?? '—';
        acc[c] = (acc[c] ?? 0) + 1;
        return acc;
    }, {});
    const categoryOptions = [
        { value: 'all', label: `${t('stock_count_all_cat')} (${itemsInWh.length})`, search: t('stock_count_all_cat') },
        ...Object.entries(catCounts).map(([c, n]) => ({ value: c, label: `${c} (${n})`, search: c })),
    ];
    const skuList = (cat === 'all' ? itemsInWh : itemsInWh.filter((i) => (i.category ?? '—') === cat)).filter(
        (i) => !skuSearch || `${i.sku} ${i.name}`.toLowerCase().includes(skuSearch.toLowerCase()),
    );
    const allVisibleSelected = skuList.length > 0 && skuList.every((i) => selectedSkus.includes(i.id));
    const toggleSku = (id: number) => setSelectedSkus((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const toggleAllVisible = () => {
        const ids = skuList.map((i) => i.id);
        setSelectedSkus((prev) => (allVisibleSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));
    };
    // Switching warehouse resets the category + selection (a SKU lives in one warehouse).
    const onPickWarehouse = (v: string) => {
        setWh(v);
        setCat('all');
        setSelectedSkus([]);
    };

    // ── Session list + create form (count sheet opens in a dialog) ──
    const isDraft = session?.status === 'draft';
    const anyCounted = Object.values(entries).some((v) => v.trim() !== '');

    // Live audit summary for the open sheet: counted progress, # of discrepancies, net variance.
    // In draft it reflects what's typed (entries); once committed it reads the stored line values.
    const countSummary = (() => {
        const lines = session?.lines ?? [];
        let counted = 0;
        let discrepancies = 0;
        let net = 0;
        for (const l of lines) {
            const raw = entries[l.id] ?? '';
            const lineVariance = isDraft ? (raw.trim() === '' ? null : (parseInt(raw, 10) || 0) - l.system_qty) : l.variance;
            const lineCounted = isDraft ? raw.trim() !== '' : l.counted_qty !== null;
            if (lineCounted) counted++;
            if (lineVariance !== null && lineVariance !== 0) {
                discrepancies++;
                net += lineVariance;
            }
        }
        return { total: lines.length, counted, discrepancies, net };
    })();

    // A session with any serialized line must commit with Auto (Manual can't reconcile serials).
    const hasSerial = (session?.lines ?? []).some((l) => l.track_serial);
    useEffect(() => {
        if (hasSerial) setMode('auto');
    }, [hasSerial]);

    // Columns mirror the shared DataTable used by the other Stock tabs.
    const sessionColumns: Column<(typeof sessions)[number]>[] = [
        {
            key: 'reference',
            header: t('stock_doc_no'),
            className: 'whitespace-nowrap',
            render: (s) => <span className="font-mono text-xs font-semibold">{s.reference}</span>,
        },
        {
            key: 'created_at',
            header: t('audit_time'),
            className: 'whitespace-nowrap',
            render: (s) => <span className="text-muted-foreground font-mono text-xs">{s.created_at?.slice(0, 10)}</span>,
        },
        {
            key: 'warehouse',
            header: t('stock_warehouse'),
            className: 'whitespace-nowrap',
            // No specific warehouse = the count spanned every warehouse.
            render: (s) => <span className="text-sm">{s.warehouse || t('stock_count_all_wh')}</span>,
        },
        {
            key: 'progress',
            header: t('stock_count_progress'),
            className: 'whitespace-nowrap',
            render: (s) => (
                <span className="font-mono text-xs">
                    {s.counted_lines ?? 0}/{s.line_count ?? 0}
                </span>
            ),
        },
        // Empty spacer soaks up the slack: left group stays tight, right group hugs the edge.
        { key: 'spacer', header: '', className: 'w-full', render: () => null },
        {
            key: 'status',
            header: t('status'),
            className: 'whitespace-nowrap',
            render: (s) => <StatusBadge tone={statusTone(s.status)}>{t(`stock_count_${s.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'adjust_mode',
            header: t('stock_count_adjust_by'),
            className: 'whitespace-nowrap',
            // Only committed counts carry a mode; drafts/canceled show nothing yet.
            render: (s) =>
                s.status === 'committed' && s.adjust_mode ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        {s.adjust_mode === 'manual' ? <FileText className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                        {s.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) =>
                s.status === 'draft' && can('view_count') ? (
                    <button
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
                            });
                        }}
                        title={t('stock_count_cancel')}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">{t('stock_counting_system')}</div>
                {can('view_count') && (
                    <Button onClick={() => setCreating(true)}>
                        <ClipboardList className="h-4 w-4" />
                        {t('stock_count_action')}
                    </Button>
                )}
            </div>

            <DataTable
                columns={sessionColumns}
                rows={sessions}
                rowKey={(s) => s.id}
                onRowClick={(s) => setSelectedId(s.id)}
                loading={sessionsLoading || sessionsFetching}
                server={{
                    page,
                    pageSize: perPage,
                    total: sessionsPage?.meta.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (s) => {
                        setPerPage(s);
                        setPage(1);
                    },
                }}
            />

            {/* New count — warehouse → categories (with stock) → pick the SKUs to count. */}
            <Dialog open={creating} onOpenChange={(o) => !o && resetPicker()}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('stock_new_count')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Scope: warehouse + category (counts show what actually has stock) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_warehouse')}</div>
                                <SearchableSelect value={wh} onChange={onPickWarehouse} options={warehouseOptions} />
                            </div>
                            <div>
                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_category')}</div>
                                <SearchableSelect value={cat} onChange={setCat} options={categoryOptions} />
                            </div>
                        </div>

                        {/* SKU picker */}
                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="border-border bg-muted/30 flex items-center gap-3 border-b px-3 py-2">
                                <button
                                    type="button"
                                    onClick={toggleAllVisible}
                                    disabled={skuList.length === 0}
                                    className="flex items-center gap-2 text-sm font-medium disabled:opacity-40"
                                >
                                    <span
                                        className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded border',
                                            allVisibleSelected ? 'bg-brand border-brand text-white' : 'border-input',
                                        )}
                                    >
                                        {allVisibleSelected && <Check className="h-3 w-3" />}
                                    </span>
                                    {t('stock_select_all')}
                                </button>
                                <span className="text-muted-foreground text-xs">
                                    {selectedSkus.length} {t('stock_count_selected')}
                                </span>
                                <div className="relative ml-auto w-44">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                                    <Input
                                        value={skuSearch}
                                        onChange={(e) => setSkuSearch(e.target.value)}
                                        placeholder={t('stock_search')}
                                        className="h-8 pl-8 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="max-h-72 overflow-auto">
                                {skuList.length === 0 ? (
                                    <div className="text-muted-foreground py-10 text-center text-sm">{t('stock_count_empty_scope')}</div>
                                ) : (
                                    skuList.map((i) => {
                                        const checked = selectedSkus.includes(i.id);
                                        return (
                                            <button
                                                key={i.id}
                                                type="button"
                                                onClick={() => toggleSku(i.id)}
                                                className="hover:bg-accent/40 border-border/60 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0"
                                            >
                                                <span
                                                    className={cn(
                                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                        checked ? 'bg-brand border-brand text-white' : 'border-input',
                                                    )}
                                                >
                                                    {checked && <Check className="h-3 w-3" />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-mono text-xs">{i.sku}</div>
                                                    <div className="text-muted-foreground truncate text-xs">{i.name}</div>
                                                </div>
                                                <span className="text-muted-foreground shrink-0 text-xs">{i.category ?? '—'}</span>
                                                <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold">{i.current_stock}</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={resetPicker}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={start} disabled={open.isPending || selectedSkus.length === 0}>
                            {t('stock_count_start')}
                            {selectedSkus.length > 0 && ` (${selectedSkus.length})`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Count sheet — opens in a dialog when a session row is clicked. */}
            <Dialog open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
                <DialogContent className="max-w-3xl">
                    {session ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="space-y-1">
                                    {/* Title + status on top; reference drops to its own line below. */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-base font-semibold">{t('stock_count_sheet_title')}</span>
                                        <StatusBadge tone={statusTone(session.status)}>
                                            {t(`stock_count_${session.status}` as Parameters<typeof t>[0])}
                                        </StatusBadge>
                                        {session.status === 'committed' && session.adjust_mode && (
                                            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-normal">
                                                {session.adjust_mode === 'manual' ? <FileText className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                                                {session.adjust_mode === 'manual'
                                                    ? t('stock_count_mode_badge_manual')
                                                    : t('stock_count_mode_badge_auto')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-muted-foreground font-mono text-xs font-semibold">{session.reference}</span>
                                        <span className="text-muted-foreground text-xs font-normal">
                                            · {session.warehouse || t('stock_count_all_wh')}
                                        </span>
                                    </div>
                                </DialogTitle>
                            </DialogHeader>

                            {/* Audit summary — counted progress, discrepancy count, net variance. */}
                            <div className="border-border grid grid-cols-3 gap-px overflow-hidden rounded-lg border">
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_progress')}
                                    </div>
                                    <div className="mt-0.5 font-mono text-sm font-semibold">
                                        {countSummary.counted}
                                        <span className="text-muted-foreground">/{countSummary.total}</span>
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_discrepancies')}
                                    </div>
                                    <div
                                        className={cn(
                                            'mt-0.5 font-mono text-sm font-semibold',
                                            countSummary.discrepancies > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        {countSummary.discrepancies}
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_net')}
                                    </div>
                                    <div
                                        className={cn(
                                            'mt-0.5 font-mono text-sm font-semibold',
                                            countSummary.net > 0
                                                ? 'text-emerald-600'
                                                : countSummary.net < 0
                                                  ? 'text-destructive'
                                                  : 'text-muted-foreground',
                                        )}
                                    >
                                        {countSummary.net > 0 ? `+${countSummary.net}` : countSummary.net}
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-[60vh] overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wide uppercase">
                                            <th className="w-full px-3 py-2">{t('stock_item')}</th>
                                            <th className="w-24 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_system')}</th>
                                            <th className="w-28 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_counted')}</th>
                                            <th className="w-28 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_variance')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(session.lines ?? []).map((l) => {
                                            const entered = entries[l.id] ?? '';
                                            const variance = isDraft
                                                ? entered.trim() === ''
                                                    ? null
                                                    : (parseInt(entered, 10) || 0) - l.system_qty
                                                : l.variance;
                                            return (
                                                <tr
                                                    key={l.id}
                                                    className={cn(
                                                        'border-border/60 border-b transition-colors last:border-0',
                                                        variance !== null && variance !== 0
                                                            ? variance > 0
                                                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                                                : 'bg-red-50/40 dark:bg-red-950/20'
                                                            : 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            {/* State dot: hollow = uncounted, green = over, red = short, grey = matched. */}
                                                            <span
                                                                className={cn(
                                                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                                                    variance === null
                                                                        ? 'border-muted-foreground/40 border'
                                                                        : variance > 0
                                                                          ? 'bg-emerald-500'
                                                                          : variance < 0
                                                                            ? 'bg-destructive'
                                                                            : 'bg-muted-foreground/40',
                                                                )}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="font-mono text-xs font-medium">{l.sku}</div>
                                                                <div className="text-muted-foreground truncate text-xs">{l.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-muted-foreground px-3 py-2 text-right font-mono tabular-nums">
                                                        {l.system_qty}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {isDraft ? (
                                                            <Input
                                                                inputMode="numeric"
                                                                value={entered}
                                                                placeholder="0"
                                                                onChange={(e) =>
                                                                    setEntries((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d]/g, '') }))
                                                                }
                                                                className={cn(
                                                                    'ml-auto h-8 w-20 text-right font-mono tabular-nums',
                                                                    variance !== null && variance !== 0 && 'border-primary/50',
                                                                )}
                                                            />
                                                        ) : (
                                                            <span className="font-mono tabular-nums">{l.counted_qty ?? '—'}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {variance === null ? (
                                                            <span className="text-muted-foreground">—</span>
                                                        ) : (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex min-w-[2.75rem] justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
                                                                    variance > 0
                                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                                        : variance < 0
                                                                          ? 'text-destructive bg-red-100 dark:bg-red-950/40'
                                                                          : 'text-muted-foreground bg-muted',
                                                                )}
                                                            >
                                                                {variance > 0 ? `+${variance}` : variance}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {(isDraft || committedFlash) && can('view_count') && (
                                <>
                                    {/* Commit mode — segmented choice with a fixed contextual hint (no layout jump). */}
                                    <div className="border-border space-y-2.5 rounded-lg border p-3">
                                        <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                                            {t('stock_count_mode_label')}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['auto', 'manual'] as const).map((m) => {
                                                const active = mode === m;
                                                const disabled = m === 'manual' && hasSerial;
                                                const Icon = m === 'auto' ? Zap : FileText;
                                                return (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => !disabled && setMode(m)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition',
                                                            disabled
                                                                ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                                                                : active
                                                                  ? m === 'manual'
                                                                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-400'
                                                                      : 'border-primary bg-primary/10 text-primary'
                                                                  : 'border-border text-muted-foreground hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                        {t(m === 'auto' ? 'stock_count_mode_auto_name' : 'stock_count_mode_manual_name')}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {hasSerial && <div className="text-muted-foreground text-[11px]">{t('stock_count_serial_only_auto')}</div>}
                                        {/* Hint stays mounted so selecting Manual never shifts the layout. */}
                                        <div
                                            className={cn(
                                                'flex items-start gap-2 text-[11px] leading-snug transition-colors',
                                                mode === 'manual' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                            )}
                                        >
                                            {mode === 'manual' ? (
                                                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                                            ) : (
                                                <Zap className="mt-px h-3.5 w-3.5 shrink-0" />
                                            )}
                                            <span>{mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint')}</span>
                                        </div>
                                    </div>
                                    <DialogFooter className="sm:justify-between">
                                        <Button
                                            variant="outline"
                                            disabled={savingDraft || committing}
                                            onClick={async () => {
                                                setSavingDraft(true);
                                                try {
                                                    await save.mutateAsync({ id: session.id, counts: countsPayload() });
                                                } catch (e) {
                                                    onError(e);
                                                } finally {
                                                    setSavingDraft(false);
                                                }
                                            }}
                                        >
                                            {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {t('stock_count_save')}
                                        </Button>
                                        <Button
                                            disabled={!anyCounted || savingDraft || committing || committedFlash}
                                            onClick={async () => {
                                                // Serialized lines that came up short must have their missing units ticked first.
                                                const shorts: SerialCheckItem[] = (session.lines ?? [])
                                                    .filter((l) => l.track_serial)
                                                    .map((l) => {
                                                        const entered = entries[l.id] ?? '';
                                                        const variance = entered.trim() === '' ? 0 : (parseInt(entered, 10) || 0) - l.system_qty;
                                                        return { l, variance };
                                                    })
                                                    .filter((x) => x.variance < 0)
                                                    .map((x) => ({
                                                        stock_item_id: x.l.stock_item_id,
                                                        sku: x.l.sku,
                                                        name: x.l.name,
                                                        need: -x.variance,
                                                        serials: x.l.serials ?? [],
                                                    }));

                                                // Shorts need ticking in the serial-verify dialog (which then commits).
                                                if (shorts.length > 0) {
                                                    setMissingByItem({});
                                                    setSerialCheck(shorts);
                                                    return;
                                                }

                                                // No shorts — confirm once more (message reflects the chosen mode's
                                                // effect on stock) and let the dialog own the save+commit steps.
                                                await confirm({
                                                    variant: 'warn',
                                                    title: t('stock_count_commit_confirm'),
                                                    description:
                                                        mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint'),
                                                    entity: { name: session.reference },
                                                    confirmText: t('stock_count_commit'),
                                                    cancelText: t('stock_count_back'),
                                                    action: async () => {
                                                        await save.mutateAsync({ id: session.id, counts: countsPayload() });
                                                        await commit.mutateAsync({ id: session.id, mode, missingSerials: {} });
                                                        setCommittedFlash(true);
                                                        window.setTimeout(() => setCommittedFlash(false), 1200);
                                                    },
                                                });
                                            }}
                                        >
                                            {committing ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : committedFlash ? (
                                                <Check className="h-3.5 w-3.5" />
                                            ) : null}
                                            {committedFlash ? t('stock_count_committed') : t('stock_count_commit')}
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Radix requires a DialogTitle even while the session loads. */}
                            <DialogHeader>
                                <DialogTitle className="text-base font-semibold">{t('stock_count_sheet_title')}</DialogTitle>
                            </DialogHeader>
                            <div className="flex items-center justify-center py-16">
                                <div className="border-muted-foreground/30 border-t-primary h-6 w-6 animate-spin rounded-full border-2" />
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Serial verification — tick the not-found units before an Auto commit adjusts stock. */}
            <Dialog open={serialCheck !== null} onOpenChange={(o) => !o && setSerialCheck(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('stock_count_serial_verify_title')}</DialogTitle>
                    </DialogHeader>
                    <div className="text-muted-foreground text-xs">{t('stock_count_serial_verify_hint')}</div>
                    <div className="max-h-[60vh] space-y-3 overflow-auto">
                        {(serialCheck ?? []).map((it) => {
                            const ticked = missingByItem[it.stock_item_id] ?? [];
                            const ok = ticked.length === it.need;
                            return (
                                <div key={it.stock_item_id} className="border-border rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs font-medium">{it.sku}</div>
                                            <div className="text-muted-foreground truncate text-xs">{it.name}</div>
                                        </div>
                                        <span className={cn('shrink-0 text-[11px] font-semibold', ok ? 'text-emerald-600' : 'text-amber-600')}>
                                            {t('stock_count_serial_tick_n').replace('{n}', String(it.need))} ({ticked.length}/{it.need})
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {it.serials.map((s) => {
                                            const checked = ticked.includes(s.id);
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => toggleSerial(it.stock_item_id, s.id)}
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition',
                                                        checked
                                                            ? 'border-destructive bg-red-50 dark:bg-red-950/20'
                                                            : 'border-border hover:bg-muted/40',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                            checked ? 'bg-destructive border-destructive text-white' : 'border-input',
                                                        )}
                                                    >
                                                        {checked && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="font-mono">{s.serial}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSerialCheck(null)}>
                            {t('stock_count_back')}
                        </Button>
                        <Button disabled={!serialCheckOk || committing} onClick={() => runCommit(missingByItem)}>
                            {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {t('stock_count_commit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
