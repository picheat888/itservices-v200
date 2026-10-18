import { useT } from '@/lang';
import { useWarehouses } from '@/modules/settings';
import { Column, DataTable } from '@/shared/components/data-table';
import { EmptyState } from '@/shared/components/empty-state';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING, TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockCountAdjustMode, StockItem } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, Check, ClipboardList, ClipboardX, FileText, Loader2, Lock, Search, Zap } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useStockCount, useStockCountMutations, useStockCounts, useStockItems } from '../../hooks/use-stock';
import { stockRefusalText } from '../../lib/refusal';

// Small section heading inside the count dialogs.
const EYEBROW = 'text-muted-foreground text-xs font-semibold';

/** Stock Count / Audit: open a session, enter physical counts, commit adjustments. */
export function AuditTab({ can }: { can: (p: string) => boolean }) {
    const fmt = useDateFormat();
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const whFieldId = useId();
    const catFieldId = useId();
    // Page and rows-per-page live in the URL (?page, ?per).
    const list = useListParams();
    const { page, perPage } = list;
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
    // Open state is separate from selectedId so the loaded session stays mounted during the close animation.
    const [sheetOpen, setSheetOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const { data: allItems = [] } = useStockItems({}, creating);
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
    // Separate open state so the serial-verify content stays mounted during the close animation.
    const [serialOpen, setSerialOpen] = useState(false);
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
            setSerialOpen(false);
        }
    };

    const onError = (e: unknown) => {
        useToastStore.getState().push(stockRefusalText(e, t), 'error');
    };

    // Seed the inputs from the session's stored counts whenever it loads/changes or the sheet reopens.
    useEffect(() => {
        if (!session || !sheetOpen) return;
        const seed: Record<number, string> = {};
        (session.lines ?? []).forEach((l) => {
            seed[l.id] = l.counted_qty === null ? '' : String(l.counted_qty);
        });
        setEntries(seed);
    }, [session?.id, session?.status, sheetOpen]);

    // Reset the New count picker back to its defaults.
    const resetPicker = () => {
        setCreating(false);
        setWh('all');
        setCat('all');
        setSelectedSkus([]);
        setSkuSearch('');
    };
    const guardPickerClose = useDiscardGuard(creating && selectedSkus.length > 0);

    const start = async () => {
        if (selectedSkus.length === 0) return;
        try {
            const created = await open.mutateAsync({
                warehouse: wh === 'all' ? null : wh,
                category: cat === 'all' ? null : cat,
                stock_item_ids: selectedSkus,
            });
            setSelectedId(created.id);
            setSheetOpen(true);
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
        { value: 'all', label: `${t('stock_count_all_wh')} (${fmtN(allItems.length)})`, search: t('stock_count_all_wh') },
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
    // Category label in the UI language (the English name stays the filter key).
    const catTh = new Map(itemsInWh.map((i) => [i.category ?? '—', i.category_th] as const));
    const catLabel = (c: string) => localPair(c, catTh.get(c), lang) ?? c;
    const categoryOptions = [
        { value: 'all', label: `${t('stock_count_all_cat')} (${fmtN(itemsInWh.length)})`, search: t('stock_count_all_cat') },
        ...Object.entries(catCounts).map(([c, n]) => ({ value: c, label: `${catLabel(c)} (${fmtN(n)})`, search: `${c} ${catTh.get(c) ?? ''}` })),
    ];
    const skuList = (cat === 'all' ? itemsInWh : itemsInWh.filter((i) => (i.category ?? '—') === cat)).filter((i) =>
        matchesAllWords(`${i.sku} ${i.name} ${i.brand ?? ''} ${i.model ?? ''}`, skuSearch),
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
    // Typed counts that differ from what the session has stored (same parsing as the save payload).
    const sheetDirty =
        isDraft &&
        (session?.lines ?? []).some((l) => {
            const raw = (entries[l.id] ?? '').trim();
            return (raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0)) !== l.counted_qty;
        });
    const guardSheetClose = useDiscardGuard(sheetOpen && sheetDirty);
    const closeSheet = () => setSheetOpen(false);

    // Live audit summary for the open sheet: draft reads the typed entries, committed reads stored values.
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
            // No specific warehouse = the count spanned every warehouse.
            render: (s) => <TruncText text={s.warehouse || t('stock_count_all_wh')} className="text-sm" />,
        },
        {
            key: 'category',
            header: t('stock_category'),
            width: '160px',
            className: 'whitespace-nowrap',
            render: (s) => <TruncText text={localPair(s.category, s.category_th ?? catTh.get(s.category ?? ''), lang)} className="text-sm" />,
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
            width: '110px',
            className: 'whitespace-nowrap',
            render: (s) => <StatusBadge tone={statusTone(s.status)}>{t(`stock_count_${s.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'adjust_mode',
            header: t('stock_count_adjust_by'),
            width: '120px',
            className: 'whitespace-nowrap',
            // Only committed counts carry a mode; drafts/canceled show nothing yet.
            render: (s) =>
                s.status === 'committed' && s.adjust_mode ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        {s.adjust_mode === 'manual' ? <FileText className="h-3 w-3" aria-hidden /> : <Zap className="h-3 w-3" aria-hidden />}
                        {s.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
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
                <div className="flex justify-end">
                    <Button onClick={() => setCreating(true)}>
                        <ClipboardList className="h-4 w-4" aria-hidden />
                        {t('stock_count_start_new')}
                    </Button>
                </div>
            )}

            <DataTable
                columns={sessionColumns}
                rows={sessions}
                rowKey={(s) => s.id}
                onRowClick={(s) => {
                    setSelectedId(s.id);
                    setSheetOpen(true);
                }}
                loading={sessionsLoading || sessionsFetching}
                server={{ ...list.table.paging, total: sessionsPage?.meta.total ?? 0 }}
                empty={{
                    title: t('stock_empty_audit'),
                    hint: can('view_count') ? t('stock_empty_audit_hint').replace('{button}', t('stock_count_start_new')) : null,
                }}
            />

            {/* New count — warehouse → categories (with stock) → pick the SKUs to count. */}
            <Dialog open={creating} onOpenChange={(o) => !o && guardPickerClose(resetPicker)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('stock_new_count')}</DialogTitle>
                        <DialogDescription>{t('stock_new_count_desc')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Scope: warehouse + category (counts show what actually has stock) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor={whFieldId} className="text-muted-foreground mb-1 block text-xs font-medium">
                                    {t('stock_warehouse')}
                                </label>
                                <SearchableSelect id={whFieldId} value={wh} onChange={onPickWarehouse} options={warehouseOptions} />
                            </div>
                            <div>
                                <label htmlFor={catFieldId} className="text-muted-foreground mb-1 block text-xs font-medium">
                                    {t('stock_category')}
                                </label>
                                <SearchableSelect id={catFieldId} value={cat} onChange={setCat} options={categoryOptions} />
                            </div>
                        </div>

                        {/* SKU picker */}
                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-3 border-b px-3 py-2')}>
                                <label
                                    className={cn(
                                        'flex items-center gap-2 text-sm font-medium',
                                        skuList.length === 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                                    )}
                                >
                                    <Checkbox
                                        className="size-4"
                                        checked={allVisibleSelected}
                                        disabled={skuList.length === 0}
                                        onCheckedChange={toggleAllVisible}
                                    />
                                    {t('stock_select_all')}
                                </label>
                                <span className="text-muted-foreground text-xs tabular-nums">
                                    {fmtN(selectedSkus.length)} {t('stock_count_selected')}
                                </span>
                                <div className="relative ml-auto w-44">
                                    <Search
                                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                                        aria-hidden
                                    />
                                    <Input
                                        type="search"
                                        name="sku-search"
                                        autoComplete="off"
                                        aria-label={searchLabel(t('stock_search'))}
                                        value={skuSearch}
                                        onChange={(e) => setSkuSearch(e.target.value)}
                                        placeholder={t('stock_search')}
                                        className="h-8 pl-8 text-sm text-ellipsis"
                                    />
                                </div>
                            </div>
                            <div className="max-h-72 overflow-auto overscroll-contain">
                                {skuList.length === 0 ? (
                                    skuSearch.trim() !== '' ? (
                                        <EmptyState
                                            kind="search"
                                            title={t('stock_empty_audit_new_count_skus_search')}
                                            hint={t('stock_empty_audit_new_count_skus_search_hint')}
                                            className="min-h-0 py-6"
                                        />
                                    ) : (
                                        <EmptyState
                                            kind="pick"
                                            title={t('stock_empty_audit_new_count_skus')}
                                            hint={t('stock_empty_audit_new_count_skus_hint')}
                                            className="min-h-0 py-6"
                                        />
                                    )
                                ) : (
                                    skuList.map((i) => {
                                        const checked = selectedSkus.includes(i.id);
                                        return (
                                            <label
                                                key={i.id}
                                                className={cn(
                                                    'hover:bg-accent/40 border-border/60 flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0',
                                                    checked && 'bg-brand/5',
                                                )}
                                            >
                                                <Checkbox className="size-4" checked={checked} onCheckedChange={() => toggleSku(i.id)} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs">{i.sku}</div>
                                                    <div className="text-muted-foreground truncate text-xs">{i.name}</div>
                                                </div>
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {localPair(i.category, i.category_th, lang) ?? '—'}
                                                </span>
                                                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                                                    {fmtN(i.current_stock)}
                                                </span>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => guardPickerClose(resetPicker)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={start} disabled={open.isPending || selectedSkus.length === 0}>
                            {t('stock_count_start')}
                            {selectedSkus.length > 0 && ` (${fmtN(selectedSkus.length)})`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Count sheet — opens in a dialog when a session row is clicked. */}
            <Dialog open={sheetOpen} onOpenChange={(o) => !o && guardSheetClose(closeSheet)}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
                    {session ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                                    {t('stock_count_sheet_title')}
                                    <StatusBadge tone={statusTone(session.status)}>
                                        {t(`stock_count_${session.status}` as Parameters<typeof t>[0])}
                                    </StatusBadge>
                                    {session.status === 'committed' && session.adjust_mode && (
                                        <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-normal">
                                            {session.adjust_mode === 'manual' ? (
                                                <FileText className="h-3 w-3" aria-hidden />
                                            ) : (
                                                <Zap className="h-3 w-3" aria-hidden />
                                            )}
                                            {session.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                                        </span>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold">{session.reference}</span>
                                    <span>{session.warehouse || t('stock_count_all_wh')}</span>
                                </DialogDescription>
                            </DialogHeader>

                            {/* Audit summary — counted progress, discrepancy count, net variance. */}
                            <div className="border-border grid grid-cols-3 gap-px overflow-hidden rounded-lg border">
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className={EYEBROW}>{t('stock_count_sum_progress')}</div>
                                    <div className="mt-0.5 text-sm font-semibold tabular-nums">
                                        {fmtN(countSummary.counted)}
                                        <span className="text-muted-foreground">/{fmtN(countSummary.total)}</span>
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className={EYEBROW}>{t('stock_count_sum_discrepancies')}</div>
                                    <div
                                        className={cn(
                                            'mt-0.5 text-sm font-semibold tabular-nums',
                                            countSummary.discrepancies > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        {fmtN(countSummary.discrepancies)}
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className={EYEBROW}>{t('stock_count_sum_net')}</div>
                                    <div
                                        className={cn(
                                            'mt-0.5 text-sm font-semibold tabular-nums',
                                            countSummary.net > 0
                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                : countSummary.net < 0
                                                  ? 'text-destructive'
                                                  : 'text-muted-foreground',
                                        )}
                                    >
                                        {countSummary.net > 0 ? `+${fmtN(countSummary.net)}` : fmtN(countSummary.net)}
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-[60vh] overflow-auto overscroll-contain">
                                <table className="w-full text-sm">
                                    <thead className={cn(TABLE_HEAD, 'sticky top-0 z-10 backdrop-blur')}>
                                        <tr className="border-border text-muted-foreground border-b text-left text-xs font-semibold">
                                            <th scope="col" className="w-full px-3 py-2">
                                                {t('stock_item')}
                                            </th>
                                            <th scope="col" className="w-24 px-3 py-2 text-right whitespace-nowrap">
                                                {t('stock_count_system')}
                                            </th>
                                            <th scope="col" className="w-28 px-3 py-2 text-right whitespace-nowrap">
                                                {t('stock_count_counted')}
                                            </th>
                                            <th scope="col" className="w-28 px-3 py-2 text-right whitespace-nowrap">
                                                {t('stock_count_variance')}
                                            </th>
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
                                                                aria-hidden
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
                                                                <div className="text-xs font-medium">{l.sku}</div>
                                                                <div className="text-muted-foreground truncate text-xs">{l.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-muted-foreground px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                                        {fmtN(l.system_qty)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {isDraft ? (
                                                            <Input
                                                                inputMode="numeric"
                                                                name={`count-${l.id}`}
                                                                aria-label={`${t('stock_count_counted')} ${l.sku ?? ''}`}
                                                                value={entered}
                                                                placeholder="0"
                                                                onChange={(e) =>
                                                                    setEntries((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d]/g, '') }))
                                                                }
                                                                className={cn(
                                                                    'ml-auto h-8 w-20 scroll-mt-10 text-right tabular-nums',
                                                                    variance !== null && variance !== 0 && 'border-primary/50',
                                                                )}
                                                            />
                                                        ) : (
                                                            <span className="tabular-nums">{l.counted_qty === null ? '—' : fmtN(l.counted_qty)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {variance === null ? (
                                                            <span className="text-muted-foreground">—</span>
                                                        ) : (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex min-w-[2.75rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                                                                    variance > 0
                                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                                        : variance < 0
                                                                          ? 'text-destructive bg-red-100 dark:bg-red-950/40'
                                                                          : 'text-muted-foreground bg-muted',
                                                                )}
                                                            >
                                                                {variance > 0 ? `+${fmtN(variance)}` : fmtN(variance)}
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
                                    {isDraft && (
                                        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-snug">
                                            <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                            <span>{t('stock_count_freeze_note').replace('{n}', fmtN(session?.lines?.length ?? 0))}</span>
                                        </p>
                                    )}
                                    {/* Commit mode — segmented choice with a fixed contextual hint (no layout jump). */}
                                    <div className="border-border space-y-2.5 rounded-lg border p-3">
                                        <div className={EYEBROW}>{t('stock_count_mode_label')}</div>
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
                                                                      : 'border-brand bg-brand/5 text-brand'
                                                                  : 'border-border text-muted-foreground hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" aria-hidden />
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
                                                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                            ) : (
                                                <Zap className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
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
                                            {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                                            {savingDraft ? t('saving') : t('stock_count_save')}
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
                                                    setSerialOpen(true);
                                                    return;
                                                }

                                                // No shorts — confirm once more and let the dialog own the save+commit steps.
                                                await confirm({
                                                    variant: 'warn',
                                                    title: t('stock_count_commit_confirm'),
                                                    description:
                                                        mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint'),
                                                    entity: { name: session.reference },
                                                    confirmText: t('stock_count_commit'),
                                                    cancelText: t('stock_count_back'),
                                                    errorMessage: (e) => stockRefusalText(e, t),
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
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                            ) : committedFlash ? (
                                                <Check className="h-3.5 w-3.5" aria-hidden />
                                            ) : null}
                                            {committing ? t('saving') : committedFlash ? t('stock_count_committed') : t('stock_count_commit')}
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
                                <DialogDescription className="sr-only">{t('loading')}</DialogDescription>
                            </DialogHeader>
                            <div role="status" className="flex items-center justify-center py-16">
                                <div className="border-muted-foreground/30 border-t-primary h-6 w-6 animate-spin rounded-full border-2" aria-hidden />
                                <span className="sr-only">{t('loading')}</span>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Serial verification — tick the not-found units before an Auto commit adjusts stock. */}
            <Dialog open={serialOpen} onOpenChange={(o) => !o && setSerialOpen(false)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('stock_count_serial_verify_title')}</DialogTitle>
                        <DialogDescription className="text-xs">{t('stock_count_serial_verify_hint')}</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] space-y-3 overflow-auto overscroll-contain">
                        {(serialCheck ?? []).map((it) => {
                            const ticked = missingByItem[it.stock_item_id] ?? [];
                            const ok = ticked.length === it.need;
                            return (
                                <div key={it.stock_item_id} className="border-border rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs font-medium">{it.sku}</div>
                                            <div className="text-muted-foreground truncate text-xs">{it.name}</div>
                                        </div>
                                        <span
                                            aria-live="polite"
                                            className={cn(
                                                'shrink-0 text-[11px] font-semibold tabular-nums',
                                                ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
                                            )}
                                        >
                                            {t('stock_count_serial_tick_n').replace('{n}', fmtN(it.need))} ({fmtN(ticked.length)}/{fmtN(it.need)})
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {it.serials.map((s) => {
                                            const checked = ticked.includes(s.id);
                                            return (
                                                <label
                                                    key={s.id}
                                                    className={cn(
                                                        'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition',
                                                        checked
                                                            ? 'border-destructive bg-red-50 dark:bg-red-950/20'
                                                            : 'border-border hover:bg-muted/40',
                                                    )}
                                                >
                                                    <Checkbox
                                                        className="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground size-4"
                                                        checked={checked}
                                                        onCheckedChange={() => toggleSerial(it.stock_item_id, s.id)}
                                                    />
                                                    <span>{s.serial}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSerialOpen(false)}>
                            {t('stock_count_back')}
                        </Button>
                        <Button disabled={!serialCheckOk || committing} onClick={() => runCommit(missingByItem)}>
                            {committing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                                <Check className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {committing ? t('saving') : t('stock_count_commit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
