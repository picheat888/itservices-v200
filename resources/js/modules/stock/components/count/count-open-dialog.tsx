// "นับสต็อกใหม่" dialog: pick one warehouse, then the items to count, and open a draft count sheet.
import { useT } from '@/lang';
import { useWarehouses } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useRefetchOnOpen } from '@/shared/hooks/use-refetch-on-open';
import { useSelectRefresh } from '@/shared/hooks/use-select-refresh';
import { localPair } from '@/shared/lib/local-name';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockCount, StockItem } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooterBar, mediumDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { ClipboardCheck, Loader2, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useStockCountMutations, useStockItems } from '../../hooks/use-stock';
import { countOverlapFor } from '../../lib/count-lock';
import { stockRefusalText } from '../../lib/refusal';
import { HeldSkuRow } from './held-sku-row';
import { SnBadge } from './sn-badge';

// The warehouse sentinel the server never counts
const UNASSIGNED = 'Unassigned';

/** The item's balance in this warehouse; 0 when it has none there. */
const qtyIn = (item: StockItem, warehouse: string) => item.balances?.find((b) => b.warehouse === warehouse)?.qty ?? 0;

function StepHeading({ n, htmlFor, children }: { n: number; htmlFor?: string; children: ReactNode }) {
    const Tag = htmlFor ? 'label' : 'div';
    return (
        <Tag htmlFor={htmlFor} className="mb-2 flex items-center text-sm font-semibold">
            <span
                aria-hidden
                className="bg-brand/10 text-brand mr-2 inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold"
            >
                {n}
            </span>
            {children}
        </Tag>
    );
}

export function CountOpenDialog({
    open,
    onOpenChange,
    onOpened,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpened: (count: StockCount) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const whFieldId = useId();
    const { open: openCount } = useStockCountMutations();

    const warehousesQuery = useWarehouses();
    const refreshWarehouses = useSelectRefresh(warehousesQuery);
    const warehouses = useMemo(() => (warehousesQuery.data ?? []).filter((w) => w.name !== UNASSIGNED), [warehousesQuery.data]);
    // Every item, with its per-warehouse balances and the draft counts holding it; asked only while open
    const itemsQuery = useStockItems({}, open);
    const refreshItems = useSelectRefresh(itemsQuery);
    useRefetchOnOpen(open, itemsQuery);
    const allItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

    const [whId, setWhId] = useState('');
    const [cat, setCat] = useState('all');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<number[]>([]);

    // Each opening starts empty; the last picks stay on screen through the close animation
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setWhId('');
            setCat('all');
            setSearch('');
            setPicked([]);
        }
    }

    const warehouse = warehouses.find((w) => String(w.id) === whId) ?? null;
    const whName = warehouse?.name ?? null;
    const heldBy = (i: StockItem) => (whName === null ? null : countOverlapFor(i, whName));

    // A refresh showing a picked item now held by another count drops it, since its row cannot be unticked
    useEffect(() => {
        if (whName === null) return;
        const held = new Set(allItems.filter((i) => countOverlapFor(i, whName) !== null).map((i) => i.id));
        setPicked((prev) => (prev.some((id) => held.has(id)) ? prev.filter((id) => !held.has(id)) : prev));
    }, [allItems, whName]);

    const warehouseOptions = warehouses.map((w) => ({ value: String(w.id), label: w.name, search: w.name }));

    // Category label in the UI language; the English name stays the filter key
    const catTh = new Map(allItems.map((i) => [i.category ?? '—', i.category_th] as const));
    const categoryOptions = [
        { value: 'all', label: t('stock_count_all_cat'), search: t('stock_count_all_cat') },
        ...[...new Set(allItems.map((i) => i.category ?? '—'))].map((c) => ({
            value: c,
            label: localPair(c, catTh.get(c), lang) ?? c,
            search: `${c} ${catTh.get(c) ?? ''}`,
        })),
    ];

    const rows = allItems.filter(
        (i) => (cat === 'all' || (i.category ?? '—') === cat) && matchesAllWords(`${i.sku} ${i.name} ${i.brand ?? ''} ${i.model ?? ''}`, search),
    );
    const pickable = rows.filter((i) => heldBy(i) === null);
    const allVisiblePicked = pickable.length > 0 && pickable.every((i) => picked.includes(i.id));

    const toggle = (id: number) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const toggleAllVisible = () => {
        const ids = pickable.map((i) => i.id);
        setPicked((prev) => (allVisiblePicked ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));
    };
    // Another warehouse means other balances and other held rows, so the picks start over
    const pickWarehouse = (v: string) => {
        setWhId(v);
        setCat('all');
        setPicked([]);
    };

    const guardClose = useDiscardGuard(open && picked.length > 0);
    const close = () => onOpenChange(false);

    const start = async () => {
        if (warehouse === null || picked.length === 0) return;
        try {
            const created = await openCount.mutateAsync({ warehouse_id: warehouse.id, stock_item_ids: picked });
            close();
            onOpened(created);
        } catch (e) {
            // A refused start keeps the picks; fresh rows show which items another count took
            useToastStore.getState().push(stockRefusalText(e, t), 'error');
            void itemsQuery.refetch();
        }
    };

    const stepTwoOff = warehouse === null;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(close)}>
            <DialogContent className={cn(mediumDialogContentClass, 'overflow-visible')}>
                <FocusDialogHeader
                    icon={ClipboardCheck}
                    eyebrow={t('stock_title')}
                    title={t('stock_count_new')}
                    srDescription={t('stock_count_new_desc')}
                    subtitle={<span className="text-muted-foreground text-sm">{t('stock_count_new_desc')}</span>}
                />
                <DialogBody className="space-y-4 py-5">
                    {/* Step 1: warehouse */}
                    <div>
                        <StepHeading n={1} htmlFor={whFieldId}>
                            {t('stock_count_step_wh')}
                        </StepHeading>
                        <SearchableSelect
                            id={whFieldId}
                            value={whId}
                            onChange={pickWarehouse}
                            options={warehouseOptions}
                            placeholder={t('stock_select_warehouse')}
                            refresh={refreshWarehouses}
                            aria-required
                        />
                        <p className="text-muted-foreground mt-1.5 text-xs">{t('stock_count_wh_hint')}</p>
                    </div>

                    {/* Step 2: items, off until a warehouse is chosen */}
                    <div aria-disabled={stepTwoOff || undefined} className={cn(stepTwoOff && 'opacity-60')}>
                        <StepHeading n={2}>{t('stock_count_step_items')}</StepHeading>
                        <div className="mb-2 flex flex-wrap gap-2">
                            <div className="w-52 shrink-0">
                                <SearchableSelect
                                    value={cat}
                                    onChange={setCat}
                                    options={categoryOptions}
                                    refresh={refreshItems}
                                    active={cat !== 'all'}
                                    disabled={stepTwoOff}
                                />
                            </div>
                            <div className="relative min-w-48 flex-1">
                                <Search
                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                                    aria-hidden
                                />
                                <Input
                                    type="search"
                                    name="count-item-search"
                                    autoComplete="off"
                                    aria-label={searchLabel(t('stock_search'))}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('stock_search')}
                                    disabled={stepTwoOff}
                                    className="h-9 pl-8 text-sm text-ellipsis"
                                />
                            </div>
                        </div>

                        <div className="border-border overflow-hidden rounded-xl border">
                            {/* Select all, picked count, column title */}
                            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-3 border-b px-3 py-2')}>
                                <label
                                    className={cn(
                                        'flex items-center gap-2 text-sm font-medium',
                                        pickable.length === 0 || stepTwoOff ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                                    )}
                                >
                                    <Checkbox
                                        className="size-4"
                                        checked={!stepTwoOff && allVisiblePicked}
                                        disabled={stepTwoOff || pickable.length === 0}
                                        onCheckedChange={toggleAllVisible}
                                    />
                                    {t('stock_return_select_all')}
                                </label>
                                <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
                                    {t('stock_count_picked').replace('{n}', fmtN(picked.length))}
                                </span>
                                <span className="text-muted-foreground ml-auto text-xs">{t('stock_count_in_wh')}</span>
                            </div>
                            <div className="h-64 scroll-py-2 overflow-auto overscroll-contain">
                                {stepTwoOff ? (
                                    <EmptyState kind="pick" title={t('stock_count_pick_wh_first')} className="min-h-0 py-10" />
                                ) : itemsQuery.isLoading ? (
                                    <div role="status" className="space-y-2 p-3">
                                        {Array.from({ length: 5 }, (_, i) => (
                                            <Skeleton key={i} className="h-10" aria-hidden />
                                        ))}
                                        <span className="sr-only">{t('loading')}</span>
                                    </div>
                                ) : itemsQuery.isError && allItems.length === 0 ? (
                                    <LoadFailedPanel onRetry={() => void itemsQuery.refetch()} />
                                ) : rows.length === 0 ? (
                                    search.trim() !== '' ? (
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
                                    rows.map((i) => {
                                        const qty = whName === null ? 0 : qtyIn(i, whName);
                                        const held = heldBy(i);
                                        if (held !== null) return <HeldSkuRow key={i.id} item={i} reference={held} qty={qty} serialBadge />;
                                        const checked = picked.includes(i.id);
                                        return (
                                            <label
                                                key={i.id}
                                                className={cn(
                                                    'hover:bg-accent/40 border-border/60 flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0',
                                                    checked && 'bg-brand/5',
                                                )}
                                            >
                                                <Checkbox className="size-4" checked={checked} onCheckedChange={() => toggle(i.id)} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-medium">
                                                        {i.sku}
                                                        {i.track_serial && <SnBadge />}
                                                    </div>
                                                    <div className="text-muted-foreground truncate text-xs">{i.name}</div>
                                                </div>
                                                <span className="text-muted-foreground w-32 shrink-0 truncate text-xs">
                                                    {localPair(i.category, i.category_th, lang) ?? '—'}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'w-12 shrink-0 text-right text-sm font-semibold tabular-nums',
                                                        qty === 0 && 'text-muted-foreground',
                                                    )}
                                                >
                                                    {fmtN(qty)}
                                                </span>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(close)}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={start} disabled={openCount.isPending || picked.length === 0 || warehouse === null}>
                        {openCount.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {t('stock_count_start').replace('{n}', fmtN(picked.length))}
                    </Button>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}
