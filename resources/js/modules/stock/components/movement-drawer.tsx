import { useT } from '@/lang';
import { useVendors, useWarehouses } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { digitsOnly, formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { StockItem, StockMovementType } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowRight,
    Box,
    Check,
    Pencil,
    Plus,
    Printer,
    RotateCcw,
    ShieldCheck,
    Trash2,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useExistingSerials, useRecordMovement, useStockItem, useStockItems } from '../hooks/use-stock';
import { countLockFor } from '../lib/count-lock';
import { stockRefusalText } from '../lib/refusal';

type SerialStatus = 'ok' | 'empty' | 'dup-system' | 'dup-batch';

/** Group a raw numeric string's integer part for the locale, keeping the decimal part being typed. */
function formatThousands(raw: string, lang: string): string {
    if (raw === '') {
        return '';
    }
    const [intPart, decPart] = raw.split('.');
    const intFmt = intPart ? formatNumber(Number(intPart), lang) : '';
    return decPart !== undefined ? `${intFmt}.${decPart}` : intFmt;
}

/** The warehouse a SKU holds the most stock in — the default from/to for a movement. */
function primaryWarehouse(item?: StockItem): string {
    const top = [...(item?.balances ?? [])].filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty)[0];
    return top?.warehouse ?? '';
}

/**
 * MovementDrawer — records a stock movement (receive / return / transfer).
 * Issuing stock happens only through a request (request → approve → fulfil), never here.
 * Receiving a serialized SKU captures one serial per unit (typed or scanned) and ends on a printable receipt.
 */
export type MovementKind = Extract<StockMovementType, 'receive' | 'return' | 'transfer'>;

// Same icons as the movement buttons on the stock page
const KIND_ICON: Record<MovementKind, LucideIcon> = { receive: ArrowDownToLine, return: RotateCcw, transfer: ArrowLeftRight };

export function MovementDrawer({ kind, onClose }: { kind: MovementKind | null; onClose: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const open = kind !== null;
    // Last non-null kind keeps the body mounted through the close animation
    const [shownKind, setShownKind] = useState<MovementKind | null>(null);
    useEffect(() => {
        if (kind) setShownKind(kind);
    }, [kind]);
    const k = kind ?? shownKind;
    const isReceive = k === 'receive';
    const record = useRecordMovement();
    const { data: items = [] } = useStockItems({}, kind !== null);
    const { data: existingSerials = [] } = useExistingSerials(kind !== null);
    const { data: warehouses = [] } = useWarehouses();
    const { data: vendors = [] } = useVendors();

    const [sku, setSku] = useState<string>('');
    const [qty, setQty] = useState(1);
    const [unitCost, setUnitCost] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    // Transfer: selected serial ids (serialized SKUs)
    const [transferSerialIds, setTransferSerialIds] = useState<Set<number>>(new Set());

    // Return: selected issued-serial ids (serialized SKUs)
    const [returnSerialIds, setReturnSerialIds] = useState<Set<number>>(new Set());

    // Receive: serial capture
    const [serials, setSerials] = useState<string[]>([]);
    const [mode, setMode] = useState<'manual' | 'scan'>('manual');
    const [scan, setScan] = useState('');
    const scanRef = useRef<HTMLInputElement>(null);
    const serialStatusId = useId();

    // Receipt step (receive only)
    const [done, setDone] = useState<{
        item: StockItem;
        serials: string[];
        qty: number;
        prevStock: number;
        movementId: number;
        docNo: string | null;
    } | null>(null);
    // Form snapshot taken right after seeding; null = capture on the next render
    const [baseline, setBaseline] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const selected = items.find((i) => String(i.id) === sku);
    const isSerial = isReceive && !!selected?.track_serial;
    const isTransfer = k === 'transfer';

    // Per-warehouse detail (balances + serials) for a transfer
    const transferItemId = isTransfer && sku ? Number(sku) : null;
    const { data: transferItemDetail } = useStockItem(transferItemId);

    const isReturn = k === 'return';
    const returnIsSerial = isReturn && !!selected?.track_serial;
    // Item detail (serials) for a serialized return
    const returnItemId = returnIsSerial && sku ? Number(sku) : null;
    const { data: returnItemDetail } = useStockItem(returnItemId);
    const availableReturnSerials = useMemo(() => (returnItemDetail?.serials ?? []).filter((s) => s.status === 'issued'), [returnItemDetail]);

    // Every serial known to the system, lower-cased for matching
    const existingSet = useMemo(() => new Set(existingSerials.map((s) => s.trim().toLowerCase())), [existingSerials]);

    // Reset the form whenever the drawer (re)opens; the SKU starts unpicked
    useEffect(() => {
        if (!open) {
            return;
        }
        setSku('');
        setQty(1);
        setUnitCost('');
        setReference('');
        setNotes('');
        setSerials([]);
        setMode('manual');
        setScan('');
        setDone(null);
        setTransferSerialIds(new Set());
        setReturnSerialIds(new Set());
        setBaseline(null);
        setSaved(false);
        setFrom('');
        setTo('');
    }, [open, kind]);

    // Focus the scan input when entering scan mode
    useEffect(() => {
        if (isSerial && mode === 'scan' && scanRef.current) {
            scanRef.current.focus();
        }
    }, [isSerial, mode, sku]);

    // Picking a SKU reseeds serial rows and prefills from/to for the movement kind
    const onSkuChange = (value: string) => {
        const it = items.find((i) => String(i.id) === value);
        setSku(value);
        setQty(1);
        setSerials(isReceive && it?.track_serial ? [''] : []);
        setTransferSerialIds(new Set());
        setReturnSerialIds(new Set());
        if (kind === 'receive') {
            setFrom('');
            setTo(primaryWarehouse(it));
        } else if (kind === 'transfer') {
            setFrom(primaryWarehouse(it));
            setTo('');
        } else {
            setFrom(primaryWarehouse(it));
            setTo(kind === 'return' ? primaryWarehouse(it) : '');
        }
    };

    // A from/to control bound to master data (warehouse / vendor) or free text
    const locationField = (
        type: 'warehouse' | 'vendor' | 'text',
        name: string,
        value: string,
        onChange: (v: string) => void,
        placeholder: string,
    ) => {
        if (type === 'text') {
            return <Input name={name} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
        }
        const options = type === 'warehouse' ? warehouses : vendors;
        return (
            <SearchableSelect
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                options={options.map((o) => ({ value: o.name, label: o.name, search: o.name }))}
            />
        );
    };

    // Which master-data source backs the from/to fields for this movement kind
    const fromType: 'warehouse' | 'vendor' | 'text' = k === 'receive' ? 'vendor' : k === 'return' ? 'text' : 'warehouse';
    const toType = 'warehouse' as const;

    // Serial slot management
    const setSerialCount = (n: number) => {
        const target = Math.max(1, Math.min(999, Math.trunc(n) || 1));
        setSerials((prev) => {
            const next = prev.slice(0, target);
            while (next.length < target) {
                next.push('');
            }
            return next;
        });
    };
    const updSerial = (i: number, v: string) => setSerials((prev) => prev.map((s, idx) => (idx === i ? v : s)));
    const removeSerial = (i: number) => setSerials((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
    const addRow = () => setSerials((prev) => [...prev, '']);
    const pushScan = () => {
        const v = scan.trim();
        if (!v) {
            return;
        }
        setSerials((prev) => [...prev, v]);
        setScan('');
        scanRef.current?.focus();
    };

    // Live validation
    const statuses = useMemo<SerialStatus[]>(() => {
        const seen = new Set<string>();
        return serials.map((raw) => {
            const v = raw.trim().toLowerCase();
            if (!v) {
                return 'empty';
            }
            if (existingSet.has(v)) {
                return 'dup-system';
            }
            if (seen.has(v)) {
                return 'dup-batch';
            }
            seen.add(v);
            return 'ok';
        });
    }, [serials, existingSet]);

    const okCount = statuses.filter((s) => s === 'ok').length;
    const dupCount = statuses.filter((s) => s === 'dup-system' || s === 'dup-batch').length;
    const emptyCount = statuses.filter((s) => s === 'empty').length;
    const serialValid = isSerial && serials.length > 0 && statuses.every((s) => s === 'ok');

    // Transfer validation from the per-warehouse detail
    const transferIsSerial = isTransfer && !!selected?.track_serial;
    const sourceBalance = isTransfer ? (transferItemDetail?.balances?.find((b) => b.warehouse === from)?.qty ?? 0) : 0;
    const availableTransferSerials = useMemo(
        () => (transferItemDetail?.serials ?? []).filter((s) => s.status === 'in_stock' && s.warehouse === from),
        [transferItemDetail, from],
    );
    const transferQtyValid = !transferIsSerial && qty >= 1 && qty <= sourceBalance;
    const transferSerialValid = transferIsSerial && transferSerialIds.size > 0;
    const sameWarehouse = isTransfer && !!from && from === to;
    const canSubmitTransfer =
        isTransfer && !!selected && !!from && !!to && !sameWarehouse && (transferIsSerial ? transferSerialValid : transferQtyValid);
    const transferQtyError =
        qty > sourceBalance && sourceBalance > 0 ? t('stock_mv_qty_over_source') : sourceBalance === 0 ? t('stock_mv_source_empty') : undefined;

    const returnSerialValid = returnIsSerial && returnSerialIds.size > 0 && !!to;
    // Receive requires a reference, supplier, destination warehouse and unit cost
    const receiveValid = !isReceive || (!!reference.trim() && !!from.trim() && !!to.trim() && unitCost.trim() !== '');
    const canSubmit = isTransfer
        ? canSubmitTransfer
        : returnIsSerial
          ? returnSerialValid
          : !!selected && (isSerial ? serialValid : qty >= 1) && receiveValid;

    // Count freeze: the warehouse sides this movement touches (receive/return arrive, transfer leaves and arrives).
    const countedBy = countLockFor(selected, isTransfer ? [from, to] : [to]);
    const countedReason = countedBy ? t('stock_refusal_count_in_progress').replace('{reference}', countedBy) : null;

    const snapshot = JSON.stringify([sku, qty, unitCost, from, to, reference, notes, serials, scan, [...transferSerialIds], [...returnSerialIds]]);
    useEffect(() => {
        if (open && baseline === null) {
            setBaseline(snapshot);
        }
    }, [open, baseline, snapshot]);
    const isDirty = baseline !== null && snapshot !== baseline;
    const guardClose = useDiscardGuard(open && !done && !saved && isDirty);

    // Action label always carries the movement name; serial modes append the count
    const actionLabel = (() => {
        if (isSerial) {
            return `${t('stock_mv_receive')} (${fmtN(okCount)})`;
        }
        if (isTransfer) {
            return transferIsSerial && transferSerialIds.size > 0
                ? `${t('stock_mv_transfer')} (${fmtN(transferSerialIds.size)})`
                : t('stock_mv_transfer');
        }
        if (returnIsSerial) {
            return returnSerialIds.size > 0 ? `${t('stock_mv_return')} (${fmtN(returnSerialIds.size)})` : t('stock_mv_return');
        }
        return k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : t('save');
    })();
    const dialogTitle = k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : '';

    const closeAfterSave = useCloseAfterSave(open, onClose);
    // One movement per press
    const sending = useRef(false);
    const submit = async () => {
        if (sending.current || saved || done) return;
        sending.current = true;
        try {
            await send();
        } finally {
            sending.current = false;
        }
    };

    const send = async () => {
        if (!selected || !canSubmit || countedBy !== null) {
            return;
        }

        // Transfer payload: no reference, serial_ids instead of serials
        if (isTransfer) {
            const effectiveQty = transferIsSerial ? transferSerialIds.size : qty;
            try {
                await record.mutateAsync({
                    type: 'transfer',
                    stock_item_id: selected.id,
                    qty: effectiveQty,
                    from_label: from.trim() || undefined,
                    to_label: to.trim() || undefined,
                    notes: notes.trim() || undefined,
                    serial_ids: transferIsSerial ? [...transferSerialIds] : undefined,
                });
                setSaved(true);
                closeAfterSave();
            } catch (e) {
                useToastStore.getState().push(stockRefusalText(e, t), 'error');
            }
            return;
        }

        // Serialized return: the chosen issued serials (qty derived from them)
        if (returnIsSerial) {
            try {
                await record.mutateAsync({
                    type: 'return',
                    stock_item_id: selected.id,
                    qty: returnSerialIds.size,
                    to_label: to.trim() || undefined,
                    notes: notes.trim() || undefined,
                    serial_ids: [...returnSerialIds],
                });
                setSaved(true);
                closeAfterSave();
            } catch (e) {
                useToastStore.getState().push(stockRefusalText(e, t), 'error');
            }
            return;
        }

        const cleanSerials = isSerial ? serials.map((s) => s.trim()) : undefined;
        const effectiveQty = isSerial ? serials.length : qty;
        try {
            const movement = await record.mutateAsync({
                type: kind!,
                stock_item_id: selected.id,
                qty: effectiveQty,
                from_label: from.trim() || undefined,
                to_label: to.trim() || undefined,
                reference: reference.trim() || undefined,
                notes: notes.trim() || undefined,
                serials: cleanSerials,
                unit_cost: isReceive && unitCost.trim() !== '' ? Number(unitCost) : undefined,
            });
            if (isReceive) {
                // Receipt step: the movement id drives the label PDF
                setDone({
                    item: selected,
                    serials: cleanSerials ?? [],
                    qty: effectiveQty,
                    prevStock: selected.current_stock,
                    movementId: movement.id,
                    docNo: movement.doc_no,
                });
            } else {
                setSaved(true);
                closeAfterSave();
            }
        } catch (e) {
            useToastStore.getState().push(stockRefusalText(e, t), 'error');
        }
    };

    const skuOptions = items.map((i) => ({
        value: String(i.id),
        label: i.name,
        sub: i.sku,
        hint: `${t('stock_stock')} ${fmtN(i.current_stock)} ${i.unit ?? ''}`.trim(),
        search: `${i.sku} ${i.name}`,
    }));

    // Receipt step (receive only)
    if (done) {
        return (
            <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
                <FormDialogContent>
                    <FocusDialogHeader
                        icon={Check}
                        tone="success"
                        eyebrow={t('stock')}
                        title={t('stock_received_ok')}
                        code={done.docNo ?? undefined}
                        srDescription={t('stock_received_ok')}
                    />
                    <DialogBody className="space-y-4">
                        <div className="flex flex-col items-center gap-1 py-2 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                <ArrowDownToLine className="h-6 w-6" aria-hidden />
                            </span>
                            <div className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">+{fmtN(done.qty)}</div>
                            <div className="text-sm font-medium">{done.item.name}</div>
                            <div className="text-muted-foreground text-xs">
                                {t('stock_new_onhand')} <b>{fmtN(done.prevStock + done.qty)}</b>
                            </div>
                        </div>

                        {done.serials.length > 0 && (
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs font-semibold">
                                        {t('stock_captured_serials')} <span>{fmtN(done.serials.length)}</span>
                                    </span>
                                    <a
                                        href={`/pdf/stock-movements/${done.movementId}/labels`}
                                        target="_blank"
                                        rel="noopener"
                                        className={buttonVariants({ size: 'sm' })}
                                    >
                                        <Printer className="h-3.5 w-3.5" aria-hidden />
                                        {t('stock_print')}
                                        <span className="sr-only">{t('stock_opens_new_tab')}</span>
                                    </a>
                                </div>
                                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                                    {done.serials.map((s, i) => (
                                        <span key={i} className="bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                                            <span className="text-muted-foreground">{i + 1}</span>
                                            <span translate="no">{s}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </DialogBody>
                    <DialogFooterBar>
                        <Button
                            variant="outline"
                            onClick={() => {
                                // Fresh capture form, keeping the chosen SKU
                                setDone(null);
                                setReference('');
                                setNotes('');
                                onSkuChange(sku);
                                setBaseline(null);
                            }}
                        >
                            <Plus className="h-4 w-4" aria-hidden />
                            {t('stock_receive_another')}
                        </Button>
                        <Button onClick={onClose}>
                            <Check className="h-4 w-4" aria-hidden />
                            {t('stock_done')}
                        </Button>
                    </DialogFooterBar>
                </FormDialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={k ? KIND_ICON[k] : ArrowDownToLine}
                    eyebrow={t('stock')}
                    title={dialogTitle}
                    code={selected?.sku}
                    srDescription={dialogTitle}
                    subtitle={selected && <span className="text-muted-foreground text-sm">{selected.name}</span>}
                />
                <DialogBody className="space-y-3 overscroll-contain">
                    <Field label={t('stock_item')} required help={isTransfer ? t('stock_mv_doc_auto') : undefined}>
                        <SearchableSelect value={sku} onChange={onSkuChange} placeholder={t('stock_select_sku')} options={skuOptions} />
                    </Field>

                    {/* Transfer */}
                    {isTransfer && selected && (
                        <div className="space-y-3">
                            {/* From / arrow / To */}
                            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                                <Field label={t('stock_from')} required>
                                    <SearchableSelect
                                        value={from}
                                        onChange={(v) => {
                                            setFrom(v);
                                            setTransferSerialIds(new Set());
                                            setQty(1);
                                        }}
                                        placeholder={t('stock_warehouse')}
                                        options={warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }))}
                                    />
                                </Field>

                                <div className="flex h-9 w-8 shrink-0 items-center justify-center">
                                    <ArrowRight className="text-muted-foreground h-4 w-4" aria-hidden />
                                </div>

                                <Field label={t('stock_to')} required>
                                    <SearchableSelect
                                        value={to}
                                        onChange={setTo}
                                        placeholder={t('stock_warehouse')}
                                        options={warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }))}
                                    />
                                </Field>
                            </div>

                            {sameWarehouse && <FormErrorBanner message={t('stock_mv_same_warehouse')} className="text-xs" />}

                            {/* Availability at the source warehouse */}
                            {from && !sameWarehouse && (
                                <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2">
                                    <span className="text-muted-foreground text-xs">
                                        {t('stock_mv_available_at')} <b className="text-foreground">{from}</b>
                                    </span>
                                    <span
                                        className={cn(
                                            'text-sm font-semibold tabular-nums',
                                            sourceBalance === 0
                                                ? 'text-destructive'
                                                : sourceBalance <= (selected.min_stock ?? 0)
                                                  ? 'text-amber-700 dark:text-amber-400'
                                                  : 'text-emerald-700 dark:text-emerald-400',
                                        )}
                                    >
                                        {fmtN(sourceBalance)}
                                    </span>
                                </div>
                            )}

                            {/* Qty-only transfer */}
                            {!selected.track_serial && from && !sameWarehouse && (
                                <Field label={t('stock_qty')} required error={transferQtyError}>
                                    <Input
                                        name="qty"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={qty || ''}
                                        disabled={sourceBalance === 0}
                                        onChange={(e) => setQty(Math.min(sourceBalance, Number(digitsOnly(e.target.value))))}
                                    />
                                </Field>
                            )}

                            {/* Serialized transfer: pick list */}
                            {selected.track_serial && from && !sameWarehouse && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground text-xs font-semibold">{t('stock_mv_pick_transfer_serials')}</span>
                                        {availableTransferSerials.length > 0 && (
                                            <button
                                                type="button"
                                                className="text-brand hover:text-brand/80 min-h-6 px-1 text-xs font-medium transition-colors"
                                                onClick={() => {
                                                    if (transferSerialIds.size === availableTransferSerials.length) {
                                                        setTransferSerialIds(new Set());
                                                    } else {
                                                        setTransferSerialIds(new Set(availableTransferSerials.map((s) => s.id)));
                                                    }
                                                }}
                                            >
                                                {transferSerialIds.size === availableTransferSerials.length
                                                    ? t('stock_return_select_none')
                                                    : t('stock_return_select_all')}
                                            </button>
                                        )}
                                    </div>

                                    {availableTransferSerials.length > 0 ? (
                                        <div className="max-h-52 space-y-1 overflow-y-auto">
                                            {availableTransferSerials.map((s) => {
                                                const checked = transferSerialIds.has(s.id);
                                                return (
                                                    <label
                                                        key={s.id}
                                                        className={cn(
                                                            'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                                                            checked ? 'border-brand/40 bg-brand/5' : 'border-border hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <input
                                                            name="transfer_serials"
                                                            type="checkbox"
                                                            className="accent-brand h-4 w-4 shrink-0 rounded"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setTransferSerialIds((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(s.id)) {
                                                                        next.delete(s.id);
                                                                    } else {
                                                                        next.add(s.id);
                                                                    }
                                                                    return next;
                                                                });
                                                            }}
                                                        />
                                                        <span className="text-sm" translate="no">
                                                            {s.serial}
                                                        </span>
                                                        {checked && <Check className="text-brand ml-auto h-3.5 w-3.5" aria-hidden />}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            kind="pick"
                                            title={t('stock_empty_movement_transfer_serials').replace('{warehouse}', from || '—')}
                                            hint={t('stock_empty_movement_transfer_serials_hint')}
                                            className="min-h-0 rounded-md border border-dashed py-4"
                                        />
                                    )}

                                    {/* Transfer serial summary */}
                                    {availableTransferSerials.length > 0 && (
                                        <div className="bg-muted/50 rounded-md p-2.5">
                                            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                                <span
                                                    className="bg-brand block h-full rounded-full"
                                                    style={{
                                                        width: `${availableTransferSerials.length ? (transferSerialIds.size / availableTransferSerials.length) * 100 : 0}%`,
                                                    }}
                                                />
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-x-3 text-xs">
                                                <span>
                                                    <b>{fmtN(transferSerialIds.size)}</b>/{fmtN(availableTransferSerials.length)}{' '}
                                                    {t('stock_mv_selected')}
                                                </span>
                                                {transferSerialIds.size > 0 && (
                                                    <span className="text-brand flex items-center gap-1">
                                                        <Check className="h-3 w-3" aria-hidden />
                                                        {t('stock_mv_ready_to_move')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Receive / return */}

                    {/* Tracking badge — receive only */}
                    {selected && isReceive && (
                        <div
                            className={cn(
                                'flex items-center gap-2.5 rounded-lg border p-2.5',
                                isSerial ? 'border-brand/40 bg-brand/5' : 'border-border bg-muted/40',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                                    isSerial ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {isSerial ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <Box className="h-4 w-4" aria-hidden />}
                            </span>
                            <div className="min-w-0 flex-1 text-xs">
                                <span className="font-medium">{isSerial ? t('stock_serialized') : t('stock_qty_only')}</span>
                            </div>
                        </div>
                    )}

                    {/* Reference + From — receive only */}
                    {!isTransfer && !isReturn && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('stock_reference')} required={isReceive}>
                                <Input
                                    name="reference"
                                    autoComplete="off"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder={t('stock_reference_ph')}
                                />
                            </Field>
                            <Field label={k === 'receive' ? t('stock_supplier') : t('stock_from')} required={isReceive}>
                                {locationField(fromType, 'from_label', from, setFrom, k === 'receive' ? t('stock_supplier') : t('stock_warehouse'))}
                            </Field>
                        </div>
                    )}

                    {/* Destination — every non-transfer movement */}
                    {!isTransfer && (
                        <Field label={t('stock_to')} required={isReceive}>
                            {locationField(toType, 'to_label', to, setTo, t('stock_warehouse'))}
                        </Field>
                    )}

                    {/* Receive: per-lot unit cost (FIFO valuation) */}
                    {selected && isReceive && (
                        <Field label={t('stock_unit_cost')} required>
                            <Input
                                type="text"
                                name="unit_cost"
                                autoComplete="off"
                                inputMode="decimal"
                                value={formatThousands(unitCost, lang)}
                                onChange={(e) => {
                                    // Digits + a single dot (max 2 decimals); store raw, display grouped
                                    let v = e.target.value.replace(/[^0-9.]/g, '');
                                    const dot = v.indexOf('.');
                                    if (dot !== -1) {
                                        v =
                                            v.slice(0, dot + 1) +
                                            v
                                                .slice(dot + 1)
                                                .replace(/\./g, '')
                                                .slice(0, 2);
                                    }
                                    setUnitCost(v);
                                }}
                                onBlur={() => unitCost !== '' && setUnitCost((Number(unitCost) || 0).toFixed(2))}
                                placeholder="0.00"
                            />
                        </Field>
                    )}

                    {/* Quantity-only capture — receive/return */}
                    {selected && !isSerial && !isTransfer && !returnIsSerial && (
                        <Field label={isReceive ? t('stock_qty_received') : t('stock_qty')} required>
                            <Input
                                name="qty"
                                inputMode="numeric"
                                autoComplete="off"
                                value={qty || ''}
                                onChange={(e) => setQty(Number(digitsOnly(e.target.value)))}
                            />
                        </Field>
                    )}

                    {/* Serialized return — pick the issued serials coming back */}
                    {returnIsSerial && selected && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold">{t('stock_return_pick')}</span>
                                {availableReturnSerials.length > 0 && (
                                    <button
                                        type="button"
                                        className="text-brand hover:text-brand/80 min-h-6 px-1 text-xs font-medium transition-colors"
                                        onClick={() => {
                                            if (returnSerialIds.size === availableReturnSerials.length) {
                                                setReturnSerialIds(new Set());
                                            } else {
                                                setReturnSerialIds(new Set(availableReturnSerials.map((s) => s.id)));
                                            }
                                        }}
                                    >
                                        {returnSerialIds.size === availableReturnSerials.length
                                            ? t('stock_return_select_none')
                                            : t('stock_return_select_all')}
                                    </button>
                                )}
                            </div>

                            {availableReturnSerials.length > 0 ? (
                                <div className="max-h-52 space-y-1 overflow-y-auto">
                                    {availableReturnSerials.map((s) => {
                                        const checked = returnSerialIds.has(s.id);
                                        return (
                                            <label
                                                key={s.id}
                                                className={cn(
                                                    'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                                                    checked ? 'border-brand/40 bg-brand/5' : 'border-border hover:bg-muted/50',
                                                )}
                                            >
                                                <input
                                                    name="return_serials"
                                                    type="checkbox"
                                                    className="accent-brand h-4 w-4 shrink-0 rounded"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setReturnSerialIds((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(s.id)) {
                                                                next.delete(s.id);
                                                            } else {
                                                                next.add(s.id);
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                />
                                                <span className="text-sm" translate="no">
                                                    {s.serial}
                                                </span>
                                                {checked && <Check className="text-brand ml-auto h-3.5 w-3.5" aria-hidden />}
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState
                                    kind="pick"
                                    title={t('stock_empty_movement_return_serials')}
                                    hint={t('stock_empty_movement_return_serials_hint')}
                                    className="min-h-0 rounded-md border border-dashed py-4"
                                />
                            )}
                        </div>
                    )}

                    {/* Serialized capture — receive only */}
                    {selected && isSerial && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold">{t('stock_capture_serials')}</span>
                                <div className="bg-muted flex rounded-md p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setMode('manual')}
                                        aria-pressed={mode === 'manual'}
                                        className={cn(
                                            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                                            mode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Pencil className="h-3 w-3" aria-hidden />
                                        {t('stock_manual')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('scan')}
                                        aria-pressed={mode === 'scan'}
                                        className={cn(
                                            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                                            mode === 'scan' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Zap className="h-3 w-3" aria-hidden />
                                        {t('stock_scan')}
                                    </button>
                                </div>
                            </div>

                            {mode === 'manual' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs">{t('stock_qtyword')}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setSerialCount(serials.length - 1)}
                                            disabled={serials.length <= 1}
                                            aria-label={t('stock_serial_rows_fewer')}
                                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                        >
                                            −
                                        </button>
                                        <Input
                                            name="serial_rows"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            value={serials.length}
                                            onChange={(e) => setSerialCount(Number(digitsOnly(e.target.value)))}
                                            aria-label={t('stock_serial_rows')}
                                            className="h-7 w-16 text-center"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setSerialCount(serials.length + 1)}
                                            aria-label={t('stock_serial_rows_more')}
                                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <span className="text-muted-foreground text-xs">{t('stock_serial_rows_hint')}</span>
                                </div>
                            )}

                            {mode === 'scan' && (
                                <div className="border-brand/40 bg-brand/5 focus-within:border-brand focus-within:ring-brand/15 flex items-center gap-2 rounded-md border border-dashed p-2 focus-within:ring-[3px]">
                                    <Zap className="text-brand h-4 w-4 shrink-0" aria-hidden />
                                    <Input
                                        ref={scanRef}
                                        name="scan"
                                        autoComplete="off"
                                        spellCheck={false}
                                        aria-label={t('stock_scan')}
                                        value={scan}
                                        onChange={(e) => setScan(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                pushScan();
                                            }
                                        }}
                                        placeholder={t('stock_scan_ph')}
                                        className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
                                    />
                                    <Button size="sm" variant="outline" onClick={pushScan} disabled={!scan.trim()}>
                                        {t('stock_scan_add')}
                                    </Button>
                                </div>
                            )}

                            {/* Serial rows */}
                            {serials.length > 0 ? (
                                <div className="max-h-56 space-y-1.5 overflow-y-auto p-1">
                                    {serials.map((s, i) => {
                                        const st = statuses[i];
                                        const bad = st === 'dup-system' || st === 'dup-batch';
                                        const statusId = `${serialStatusId}-${i}`;
                                        const rowLabel = `${t('stock_serial_n')}${i + 1}`;
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-muted-foreground w-5 shrink-0 text-right text-xs">{i + 1}</span>
                                                <Input
                                                    name={`serials[${i}]`}
                                                    autoComplete="off"
                                                    spellCheck={false}
                                                    aria-label={rowLabel}
                                                    aria-invalid={bad || undefined}
                                                    aria-describedby={bad ? statusId : undefined}
                                                    value={s}
                                                    onChange={(e) => updSerial(i, e.target.value)}
                                                    placeholder={rowLabel}
                                                    className={cn(
                                                        'h-8',
                                                        bad &&
                                                            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                                    )}
                                                />
                                                <span id={statusId} aria-live="polite" className="w-20 shrink-0 text-xs">
                                                    {st === 'ok' && <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />}
                                                    {st === 'dup-system' && <span className="text-destructive">{t('stock_serial_in_stock')}</span>}
                                                    {st === 'dup-batch' && <span className="text-destructive">{t('stock_serial_dup')}</span>}
                                                    {st === 'empty' && <span className="text-muted-foreground">{t('stock_serial_empty')}</span>}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSerial(i)}
                                                    disabled={serials.length <= 1}
                                                    aria-label={`${t('delete')} ${rowLabel}`}
                                                    className="text-muted-foreground hover:text-destructive flex h-7 w-7 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {mode === 'manual' && (
                                        <button
                                            type="button"
                                            onClick={addRow}
                                            className="text-brand hover:bg-brand/5 flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs font-medium"
                                        >
                                            <Plus className="h-3.5 w-3.5" aria-hidden />
                                            {t('stock_add_serial_row')}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <EmptyState
                                    kind="pick"
                                    title={t('stock_empty_movement_receive_serials')}
                                    hint={t('stock_empty_movement_receive_serials_hint')}
                                    className="min-h-0 rounded-md border border-dashed py-4"
                                />
                            )}

                            {/* Summary bar */}
                            <div className="bg-muted/50 rounded-md p-2.5">
                                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                    <span
                                        className={cn('block h-full rounded-full', dupCount ? 'bg-destructive' : 'bg-emerald-500')}
                                        style={{ width: `${serials.length ? (okCount / serials.length) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                    <span>
                                        <b>{fmtN(okCount)}</b>/{fmtN(serials.length)} {t('stock_serials_valid')}
                                    </span>
                                    {dupCount > 0 && (
                                        <span className="text-destructive flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" aria-hidden />
                                            <b>{fmtN(dupCount)}</b> {t('stock_serial_dup')}
                                        </span>
                                    )}
                                    {emptyCount > 0 && (
                                        <span className="text-muted-foreground">
                                            {fmtN(emptyCount)} {t('stock_serial_empty')}
                                        </span>
                                    )}
                                    {serialValid && (
                                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                            <Check className="h-3 w-3" aria-hidden />
                                            {t('stock_serials_ready')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <Field label={t('stock_notes')}>
                        <Textarea
                            name="notes"
                            autoComplete="off"
                            rows={2}
                            className="min-h-0"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </Field>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={record.isPending}>
                        {t('cancel')}
                    </Button>
                    <DisabledReason reason={saved ? null : countedReason} label={actionLabel}>
                        <SaveButton
                            loading={record.isPending}
                            success={saved}
                            onClick={submit}
                            disabled={!saved && (!canSubmit || countedBy !== null)}
                        >
                            {actionLabel}
                        </SaveButton>
                    </DisabledReason>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
