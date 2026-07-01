import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useVendors, useWarehouses } from '@/modules/settings';
import { useExistingSerials, useRecordMovement, useStockItem, useStockItems } from '../hooks/use-stock';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useToastStore } from '@/stores/toast';
import type { StockItem, StockMovementType } from '@/shared/types';
import { AlertTriangle, ArrowDownToLine, ArrowRight, Box, Check, MoveRight, Pencil, Plus, Printer, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const CLOSE_DELAY_MS = 1100;

type SerialStatus = 'ok' | 'empty' | 'dup-system' | 'dup-batch';

/** Group a raw numeric string with thousands separators, preserving the decimal
 *  part being typed (e.g. "1234.5" → "1,234.5"). Empty stays empty. */
function formatThousands(raw: string): string {
    if (raw === '') {
        return '';
    }
    const [intPart, decPart] = raw.split('.');
    const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${intFmt}.${decPart}` : intFmt;
}

/** The warehouse a SKU holds the most stock in — used to pre-fill movement
 *  from/to defaults now that the SKU no longer stores a home warehouse. */
function primaryWarehouse(item?: StockItem): string {
    const top = [...(item?.balances ?? [])].filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty)[0];
    return top?.warehouse ?? '';
}

/**
 * MovementDrawer — records a stock movement of the given kind
 * (receive / issue / return / transfer) and adjusts on-hand stock on save.
 *
 * When receiving a serialized SKU it switches to per-unit serial capture
 * (manual rows or barcode scan), validates duplicates live against the system
 * and the current batch, and finishes on a receipt with printable labels.
 */
export function MovementDrawer({ kind, onClose }: { kind: StockMovementType | null; onClose: () => void }) {
    const t = useT();
    const open = kind !== null;
    // Retain the last non-null kind so the type-specific form content stays mounted while
    // the dialog animates closed — kind → null on close would otherwise blank the body
    // (every section branches on the movement kind), reading as a flash instead of a fade.
    const [shownKind, setShownKind] = useState<StockMovementType | null>(null);
    useEffect(() => {
        if (kind) setShownKind(kind);
    }, [kind]);
    const k = kind ?? shownKind;
    const isReceive = k === 'receive';
    const record = useRecordMovement();
    const { data: items = [] } = useStockItems({});
    const { data: existingSerials = [] } = useExistingSerials();
    const { data: warehouses = [] } = useWarehouses();
    const { data: vendors = [] } = useVendors();

    const [sku, setSku] = useState<string>('');
    const [qty, setQty] = useState(1);
    const [unitCost, setUnitCost] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    // Transfer-specific state: selected serial ids (for serialized SKUs).
    const [transferSerialIds, setTransferSerialIds] = useState<Set<number>>(new Set());

    // Return-specific state: selected issued-serial ids (for serialized SKUs).
    const [returnSerialIds, setReturnSerialIds] = useState<Set<number>>(new Set());

    // Serialized capture state (receive mode).
    const [serials, setSerials] = useState<string[]>([]);
    const [mode, setMode] = useState<'manual' | 'scan'>('manual');
    const [scan, setScan] = useState('');
    const scanRef = useRef<HTMLInputElement>(null);

    // Success step (receive only).
    const [done, setDone] = useState<{ item: StockItem; serials: string[]; qty: number; prevStock: number; movementId: number } | null>(null);

    const selected = items.find((i) => String(i.id) === sku);
    const isSerial = isReceive && !!selected?.track_serial;
    const isTransfer = k === 'transfer';

    // Fetch per-warehouse detail (balances + serials) only when in transfer mode and a SKU is selected.
    const transferItemId = isTransfer && sku ? Number(sku) : null;
    const { data: transferItemDetail } = useStockItem(transferItemId);

    const isReturn = k === 'return';
    const returnIsSerial = isReturn && !!selected?.track_serial;
    // Item detail (serials) for a serialized return — to list the units currently issued.
    const returnItemId = returnIsSerial && sku ? Number(sku) : null;
    const { data: returnItemDetail } = useStockItem(returnItemId);
    const availableReturnSerials = useMemo(() => (returnItemDetail?.serials ?? []).filter((s) => s.status === 'issued'), [returnItemDetail]);

    // Every serial already known to the system, normalised for case-insensitive matching.
    const existingSet = useMemo(() => new Set(existingSerials.map((s) => s.trim().toLowerCase())), [existingSerials]);

    // Reset the form whenever the drawer (re)opens.
    useEffect(() => {
        if (!open) {
            return;
        }
        const first = items[0];
        const firstId = first ? String(first.id) : '';
        setSku(firstId);
        setQty(1);
        setUnitCost('');
        setReference('');
        setNotes('');
        setSerials(isReceive && first?.track_serial ? [''] : []);
        setMode('manual');
        setScan('');
        setDone(null);
        setTransferSerialIds(new Set());
        setReturnSerialIds(new Set());
        // Sensible from/to defaults per movement kind, prefilled from the item's
        // own master-data fields (supplier / warehouse) when receiving.
        // Transfer: From = item's default warehouse, To = empty (user must pick).
        if (kind === 'transfer') {
            setFrom(primaryWarehouse(first));
            setTo('');
        } else {
            // Receive: From is the supplier (typed per receipt) → start empty.
            setFrom(kind === 'receive' ? '' : primaryWarehouse(first));
            setTo(kind === 'receive' || kind === 'return' ? primaryWarehouse(first) : '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kind]);

    // Focus the scan input when entering scan mode.
    useEffect(() => {
        if (isSerial && mode === 'scan' && scanRef.current) {
            scanRef.current.focus();
        }
    }, [isSerial, mode, sku]);

    // Picking a different SKU reseeds serial rows and, when receiving, prefills the
    // supplier/warehouse from the item's master-data fields.
    // For transfer, resets From to the item's default warehouse and clears serial selection.
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
        }
    };

    // Render a from/to control bound to master data (warehouse / vendor) or free text.
    const locationField = (type: 'warehouse' | 'vendor' | 'text', value: string, onChange: (v: string) => void, placeholder: string) => {
        if (type === 'text') {
            return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
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

    // Which master-data source backs the from/to fields for this movement kind.
    const fromType: 'warehouse' | 'vendor' | 'text' = k === 'receive' ? 'vendor' : k === 'return' ? 'text' : 'warehouse';
    const toType: 'warehouse' | 'vendor' | 'text' = k === 'issue' ? 'text' : 'warehouse';

    // ---- serial slot management ----
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

    // ---- live validation ----
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

    // Transfer validation derived from per-warehouse detail.
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

    const returnSerialValid = returnIsSerial && returnSerialIds.size > 0 && !!to;
    // Receive requires a reference (PO/doc), supplier, destination warehouse and unit cost.
    const receiveValid = !isReceive || (!!reference.trim() && !!from.trim() && !!to.trim() && unitCost.trim() !== '');
    const canSubmit = isTransfer
        ? canSubmitTransfer
        : returnIsSerial
          ? returnSerialValid
          : !!selected && (isSerial ? serialValid : qty >= 1) && receiveValid;

    // Always give the action button a full label (never an empty/shrunk button).
    // Serial modes append the selected/valid count.
    const actionLabel = (() => {
        if (isSerial) {
            return `${t('stock_mv_receive')} (${okCount})`;
        }
        if (isTransfer) {
            return transferIsSerial && transferSerialIds.size > 0 ? `${t('stock_mv_transfer')} (${transferSerialIds.size})` : t('stock_mv_transfer');
        }
        if (returnIsSerial) {
            return returnSerialIds.size > 0 ? `${t('stock_mv_return')} (${returnSerialIds.size})` : t('stock_mv_return');
        }
        return k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : t('save');
    })();

    const submit = async () => {
        if (!selected || !canSubmit) {
            return;
        }

        // Build payload — transfer has its own shape (no reference, uses serial_ids not serials).
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
                setTimeout(onClose, CLOSE_DELAY_MS);
            } catch (e) {
                const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
            }
            return;
        }

        // Serialized return: send the chosen issued serials (qty derived from them).
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
                setTimeout(onClose, CLOSE_DELAY_MS);
            } catch (e) {
                const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
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
                // Show the receipt so the user can print serial labels (movement id drives the PDF).
                setDone({
                    item: selected,
                    serials: cleanSerials ?? [],
                    qty: effectiveQty,
                    prevStock: selected.current_stock,
                    movementId: movement.id,
                });
            } else {
                setTimeout(onClose, CLOSE_DELAY_MS);
            }
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
        }
    };

    // ===== Success / receipt step (receive only) =====
    if (done) {
        return (
            <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-600">
                            <Check className="h-5 w-5" />
                            {t('stock_received_ok')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-1 py-2 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                                <ArrowDownToLine className="h-6 w-6" />
                            </span>
                            <div className="mt-1 font-mono text-3xl font-bold text-emerald-600">+{done.qty}</div>
                            <div className="text-sm font-medium">{done.item.name}</div>
                            <div className="text-muted-foreground text-xs">
                                {t('stock_new_onhand')} <b className="font-mono">{done.prevStock + done.qty}</b>
                            </div>
                        </div>

                        {done.serials.length > 0 && (
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                        {t('stock_captured_serials')} <span className="font-mono">{done.serials.length}</span>
                                    </span>
                                    <Button size="sm" onClick={() => window.open(`/api/stock-movements/${done.movementId}/labels/pdf`, '_blank')}>
                                        <Printer className="h-3.5 w-3.5" />
                                        {t('stock_print')}
                                    </Button>
                                </div>
                                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                                    {done.serials.map((s, i) => (
                                        <span key={i} className="bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs">
                                            <span className="text-muted-foreground">{i + 1}</span>
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                // Back to a fresh capture form, keeping the chosen SKU.
                                setDone(null);
                                setReference('');
                                setNotes('');
                                onSkuChange(sku);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            {t('stock_receive_another')}
                        </Button>
                        <Button onClick={onClose}>
                            <Check className="h-4 w-4" />
                            {t('stock_done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : ''}</DialogTitle>
                </DialogHeader>
                {/* -mx-2/px-2 keeps content aligned while pushing the scroll clip edge
                    out so focused inputs' rings (ring-2 + ring-offset-2) aren't cut off. */}
                <div className="-mx-2 max-h-[70vh] space-y-3 overflow-y-auto px-2 py-1.5">
                    <Field label={t('stock_item')} required>
                        <SearchableSelect
                            value={sku}
                            onChange={onSkuChange}
                            placeholder="—"
                            options={items.map((i) => ({
                                value: String(i.id),
                                label: `${i.sku} — ${i.name}`,
                                sub: `(${i.current_stock})`,
                                search: `${i.sku} ${i.name}`,
                            }))}
                        />
                    </Field>

                    {/* ====================================================
                        TRANSFER MODE — rebuilt warehouse-aware experience
                        ==================================================== */}
                    {isTransfer && selected && (
                        <div className="space-y-3">
                            {/* Auto doc-no hint chip */}
                            <div className="flex items-center gap-1.5">
                                <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs">
                                    <MoveRight className="h-3 w-3" />
                                    TRF-XXXXXX — เลขเอกสารจะสร้างอัตโนมัติ
                                </span>
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                                        selected.track_serial ? 'border-brand/40 bg-brand/5 text-brand border' : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {selected.track_serial ? (
                                        <>
                                            <ShieldCheck className="h-3 w-3" />
                                            {t('stock_serialized')}
                                        </>
                                    ) : (
                                        <>
                                            <Box className="h-3 w-3" />
                                            {t('stock_qty_only')}
                                        </>
                                    )}
                                </span>
                            </div>

                            {/* From / Arrow / To — three-column flow layout */}
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

                                {/* Arrow icon — centred between the two selects */}
                                <div className="flex h-9 w-8 shrink-0 items-center justify-center">
                                    <ArrowRight className="text-muted-foreground h-4 w-4" />
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

                            {/* Same-warehouse guard banner */}
                            {sameWarehouse && (
                                <div className="text-destructive flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs dark:border-red-800 dark:bg-red-950/30">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    ต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน
                                </div>
                            )}

                            {/* Per-warehouse availability badge */}
                            {from && !sameWarehouse && (
                                <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2">
                                    <span className="text-muted-foreground text-xs">
                                        คงเหลือที่ <b className="text-foreground">{from}</b>
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono text-sm font-semibold',
                                            sourceBalance === 0
                                                ? 'text-destructive'
                                                : sourceBalance <= (selected.min_stock ?? 0)
                                                  ? 'text-amber-600'
                                                  : 'text-emerald-600',
                                        )}
                                    >
                                        {sourceBalance}
                                    </span>
                                </div>
                            )}

                            {/* Qty-only transfer: quantity input */}
                            {!selected.track_serial && from && !sameWarehouse && (
                                <Field label={t('stock_qty')} required>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={sourceBalance}
                                        value={qty}
                                        disabled={sourceBalance === 0}
                                        onChange={(e) => setQty(Math.max(1, Math.min(sourceBalance, +e.target.value)))}
                                        className="font-mono"
                                    />
                                    {qty > sourceBalance && sourceBalance > 0 && (
                                        <p className="text-destructive mt-1 text-xs">จำนวนเกินคงเหลือในคลังต้นทาง</p>
                                    )}
                                    {sourceBalance === 0 && <p className="text-destructive mt-1 text-xs">ไม่มีสินค้าในคลังต้นทาง</p>}
                                </Field>
                            )}

                            {/* Serialized transfer: checkbox pick list */}
                            {selected.track_serial && from && !sameWarehouse && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                            เลือก Serial ที่จะย้าย
                                        </span>
                                        {availableTransferSerials.length > 0 && (
                                            <button
                                                type="button"
                                                className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
                                                onClick={() => {
                                                    if (transferSerialIds.size === availableTransferSerials.length) {
                                                        setTransferSerialIds(new Set());
                                                    } else {
                                                        setTransferSerialIds(new Set(availableTransferSerials.map((s) => s.id)));
                                                    }
                                                }}
                                            >
                                                {transferSerialIds.size === availableTransferSerials.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
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
                                                        <span className="font-mono text-sm">{s.serial}</span>
                                                        {checked && <Check className="text-brand ml-auto h-3.5 w-3.5" />}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">
                                            ไม่มี Serial ที่พร้อมย้ายจากคลัง {from || '—'}
                                        </div>
                                    )}

                                    {/* Transfer serial summary bar */}
                                    {availableTransferSerials.length > 0 && (
                                        <div className="bg-muted/50 rounded-md p-2.5">
                                            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                                <span
                                                    className="bg-brand block h-full rounded-full transition-all"
                                                    style={{
                                                        width: `${availableTransferSerials.length ? (transferSerialIds.size / availableTransferSerials.length) * 100 : 0}%`,
                                                    }}
                                                />
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-x-3 text-xs">
                                                <span>
                                                    <b className="font-mono">{transferSerialIds.size}</b>/{availableTransferSerials.length} เลือก
                                                </span>
                                                {transferSerialIds.size > 0 && (
                                                    <span className="text-brand flex items-center gap-1">
                                                        <Check className="h-3 w-3" />
                                                        พร้อมย้าย
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ====================================================
                        RECEIVE / RETURN / ISSUE modes (unchanged)
                        ==================================================== */}

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
                                {isSerial ? <ShieldCheck className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1 text-xs">
                                <span className="font-medium">{isSerial ? t('stock_serialized') : t('stock_qty_only')}</span>
                            </div>
                        </div>
                    )}

                    {/* Reference + From — receive/issue only (transfer has its own block;
                        return drops them — it only needs the destination warehouse). */}
                    {!isTransfer && !isReturn && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('stock_reference')} required={isReceive}>
                                <Input
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="PO-2026-118 / REQ-12"
                                    className="font-mono"
                                />
                            </Field>
                            <Field label={k === 'receive' ? t('stock_supplier') : t('stock_from')} required={isReceive}>
                                {locationField(fromType, from, setFrom, k === 'receive' ? t('stock_supplier') : t('stock_warehouse'))}
                            </Field>
                        </div>
                    )}

                    {/* Destination warehouse — every non-transfer movement (receive/issue/return). */}
                    {!isTransfer && (
                        <Field label={t('stock_to')} required={isReceive}>
                            {locationField(toType, to, setTo, k === 'issue' ? 'EMP-1234' : t('stock_warehouse'))}
                        </Field>
                    )}

                    {/* Receive captures the per-lot unit cost (required) for FIFO valuation. */}
                    {selected && isReceive && (
                        <Field label={t('stock_unit_cost')} required>
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={formatThousands(unitCost)}
                                onChange={(e) => {
                                    // Keep digits + a single dot (max 2 decimals); store raw, display grouped.
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
                                // Normalise to two decimals on blur (e.g. "1234.5" → "1,234.50").
                                onBlur={() => unitCost !== '' && setUnitCost((Number(unitCost) || 0).toFixed(2))}
                                placeholder="0.00"
                                className="font-mono"
                            />
                        </Field>
                    )}

                    {/* Quantity-only capture — receive/return/issue only */}
                    {selected && !isSerial && !isTransfer && !returnIsSerial && (
                        <Field label={isReceive ? t('stock_qty_received') : t('stock_qty')} required>
                            <Input type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} className="font-mono" />
                        </Field>
                    )}

                    {/* Serialized return — pick the issued serials coming back into stock */}
                    {returnIsSerial && selected && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('stock_return_pick')}</span>
                                {availableReturnSerials.length > 0 && (
                                    <button
                                        type="button"
                                        className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
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
                                                <span className="font-mono text-sm">{s.serial}</span>
                                                {checked && <Check className="text-brand ml-auto h-3.5 w-3.5" />}
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">
                                    {t('stock_return_none')}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Serialized capture — receive only */}
                    {selected && isSerial && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                    {t('stock_capture_serials')}
                                </span>
                                <div className="bg-muted flex rounded-md p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setMode('manual')}
                                        className={cn(
                                            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                                            mode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground',
                                        )}
                                    >
                                        <Pencil className="h-3 w-3" />
                                        {t('stock_manual')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('scan')}
                                        className={cn(
                                            'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                                            mode === 'scan' ? 'bg-background shadow-sm' : 'text-muted-foreground',
                                        )}
                                    >
                                        <Zap className="h-3 w-3" />
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
                                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                        >
                                            −
                                        </button>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={serials.length}
                                            onChange={(e) => setSerialCount(+e.target.value)}
                                            className="h-7 w-16 text-center font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setSerialCount(serials.length + 1)}
                                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <span className="text-muted-foreground text-xs">{t('stock_serial_rows_hint')}</span>
                                </div>
                            )}

                            {mode === 'scan' && (
                                <div className="border-brand/40 bg-brand/5 flex items-center gap-2 rounded-md border border-dashed p-2">
                                    <Zap className="text-brand h-4 w-4 shrink-0" />
                                    <Input
                                        ref={scanRef}
                                        value={scan}
                                        onChange={(e) => setScan(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                pushScan();
                                            }
                                        }}
                                        placeholder={t('stock_scan_ph')}
                                        className="h-8 border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
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
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-muted-foreground w-5 shrink-0 text-right font-mono text-xs">{i + 1}</span>
                                                <Input
                                                    value={s}
                                                    onChange={(e) => updSerial(i, e.target.value)}
                                                    placeholder={`${t('stock_serial_n')}${i + 1}`}
                                                    className={cn('h-8 font-mono', bad && 'border-destructive focus-visible:ring-destructive')}
                                                />
                                                <span className="w-20 shrink-0 text-xs">
                                                    {st === 'ok' && <Check className="h-4 w-4 text-emerald-600" />}
                                                    {st === 'dup-system' && <span className="text-destructive">{t('stock_serial_in_stock')}</span>}
                                                    {st === 'dup-batch' && <span className="text-destructive">{t('stock_serial_dup')}</span>}
                                                    {st === 'empty' && <span className="text-muted-foreground">{t('stock_serial_empty')}</span>}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSerial(i)}
                                                    disabled={serials.length <= 1}
                                                    className="text-muted-foreground hover:text-destructive flex h-7 w-7 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
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
                                            <Plus className="h-3.5 w-3.5" />
                                            {t('stock_add_serial_row')}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">
                                    {t('stock_no_serials')}
                                </div>
                            )}

                            {/* Summary bar */}
                            <div className="bg-muted/50 rounded-md p-2.5">
                                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                    <span
                                        className={cn('block h-full rounded-full transition-all', dupCount ? 'bg-destructive' : 'bg-emerald-500')}
                                        style={{ width: `${serials.length ? (okCount / serials.length) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                    <span>
                                        <b className="font-mono">{okCount}</b>/{serials.length} {t('stock_serials_valid')}
                                    </span>
                                    {dupCount > 0 && (
                                        <span className="text-destructive flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            <b className="font-mono">{dupCount}</b> {t('stock_serial_dup')}
                                        </span>
                                    )}
                                    {emptyCount > 0 && (
                                        <span className="text-muted-foreground">
                                            {emptyCount} {t('stock_serial_empty')}
                                        </span>
                                    )}
                                    {serialValid && (
                                        <span className="flex items-center gap-1 text-emerald-600">
                                            <Check className="h-3 w-3" />
                                            {t('stock_serials_ready')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <Field label={t('stock_notes')}>
                        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={record.isPending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={record.isPending} onClick={submit} disabled={!canSubmit}>
                        {actionLabel}
                    </SaveButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
