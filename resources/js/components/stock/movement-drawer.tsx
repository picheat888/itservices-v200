import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { SerialLabelSheet } from '@/components/stock/serial-label-sheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useVendors, useWarehouses } from '@/hooks/use-master-data';
import { useExistingSerials, useRecordMovement, useStockItems } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { StockItem, StockMovementType } from '@/types';
import { AlertTriangle, ArrowDownToLine, Box, Check, Pencil, Plus, Printer, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';

const CLOSE_DELAY_MS = 1100;

type SerialStatus = 'ok' | 'empty' | 'dup-system' | 'dup-batch';

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
    const isReceive = kind === 'receive';
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

    // Serialized capture state.
    const [serials, setSerials] = useState<string[]>([]);
    const [mode, setMode] = useState<'manual' | 'scan'>('manual');
    const [scan, setScan] = useState('');
    const scanRef = useRef<HTMLInputElement>(null);

    // Success step (receive only).
    const [done, setDone] = useState<{ item: StockItem; serials: string[]; qty: number; prevStock: number } | null>(null);
    const [labelOpen, setLabelOpen] = useState(false);

    const selected = items.find((i) => String(i.id) === sku);
    const isSerial = isReceive && !!selected?.track_serial;

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
        setLabelOpen(false);
        // Sensible from/to defaults per movement kind, prefilled from the item's
        // own master-data fields (supplier / warehouse) when receiving.
        setFrom(kind === 'receive' ? (first?.supplier ?? '') : (first?.warehouse ?? ''));
        setTo(kind === 'receive' || kind === 'return' ? (first?.warehouse ?? '') : '');
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
    const onSkuChange = (value: string) => {
        const it = items.find((i) => String(i.id) === value);
        setSku(value);
        setQty(1);
        setSerials(isReceive && it?.track_serial ? [''] : []);
        if (kind === 'receive') {
            setFrom(it?.supplier ?? '');
            setTo(it?.warehouse ?? '');
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
    const fromType: 'warehouse' | 'vendor' | 'text' = kind === 'receive' ? 'vendor' : kind === 'return' ? 'text' : 'warehouse';
    const toType: 'warehouse' | 'vendor' | 'text' = kind === 'issue' ? 'text' : 'warehouse';

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
    const canSubmit = !!selected && (isSerial ? serialValid : qty >= 1);

    const submit = async () => {
        if (!selected || !canSubmit) {
            return;
        }
        const cleanSerials = isSerial ? serials.map((s) => s.trim()) : undefined;
        const effectiveQty = isSerial ? serials.length : qty;
        try {
            await record.mutateAsync({
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
                // Show the receipt so the user can print serial labels.
                setDone({ item: selected, serials: cleanSerials ?? [], qty: effectiveQty, prevStock: selected.current_stock });
            } else {
                setTimeout(onClose, CLOSE_DELAY_MS);
            }
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'Something went wrong.' });
        }
    };

    // ===== Success / receipt step (receive only) =====
    if (done) {
        return (
            <>
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
                                        <Button size="sm" onClick={() => setLabelOpen(true)}>
                                            <Printer className="h-3.5 w-3.5" />
                                            {t('stock_print_labels')}
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
                                    setLabelOpen(false);
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
                <SerialLabelSheet
                    open={labelOpen}
                    onClose={() => setLabelOpen(false)}
                    item={done.item}
                    serials={done.serials}
                    warehouse={to || done.item.warehouse}
                    date={new Date().toISOString()}
                />
            </>
        );
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{kind ? t(`stock_mv_${kind}` as Parameters<typeof t>[0]) : ''}</DialogTitle>
                </DialogHeader>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                    <Field label={t('stock_item')} required>
                        <SearchableSelect
                            value={sku}
                            onChange={onSkuChange}
                            placeholder="—"
                            options={items.map((i) => ({
                                value: String(i.id),
                                label: `${i.sku} — ${i.name} (${i.current_stock})${i.track_serial ? ' · S/N' : ''}`,
                                search: `${i.sku} ${i.name}`,
                            }))}
                        />
                    </Field>

                    {/* Tracking badge */}
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

                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_reference')}>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO-2026-118 / REQ-12" className="font-mono" />
                        </Field>
                        <Field label={t('stock_from')}>
                            {locationField(fromType, from, setFrom, kind === 'receive' ? t('stock_supplier') : t('stock_warehouse'))}
                        </Field>
                    </div>
                    <Field label={t('stock_to')}>
                        {locationField(toType, to, setTo, kind === 'issue' ? 'EMP-1234' : t('stock_warehouse'))}
                    </Field>

                    {/* Receive captures the per-lot unit cost (optional) for FIFO valuation. */}
                    {selected && isReceive && (
                        <Field label={t('stock_unit_cost')}>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={unitCost}
                                onChange={(e) => setUnitCost(e.target.value)}
                                placeholder="0.00"
                                className="font-mono"
                            />
                        </Field>
                    )}

                    {/* Quantity-only capture */}
                    {selected && !isSerial && (
                        <Field label={isReceive ? t('stock_qty_received') : t('stock_qty')} required>
                            <Input type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} className="font-mono" />
                        </Field>
                    )}

                    {/* Serialized capture */}
                    {selected && isSerial && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('stock_capture_serials')}</span>
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
                                <div className="max-h-56 space-y-1.5 overflow-y-auto">
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
                                <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">{t('stock_no_serials')}</div>
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
                        {isSerial ? `${t('stock_mv_receive')} (${okCount})` : undefined}
                    </SaveButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
