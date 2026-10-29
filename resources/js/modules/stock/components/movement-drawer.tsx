import { useT } from '@/lang';
import { useCurrency, useVendors, useWarehouses } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { MoneyInput } from '@/shared/components/money-input';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useSelectRefresh } from '@/shared/hooks/use-select-refresh';
import { digitsOnly } from '@/shared/lib/number';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { ReceiveLot, ReturnableRequest, StockItem, StockMovementType } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { detailDialogHeightClass, Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowRight,
    Check,
    Minus,
    Pencil,
    Plus,
    Printer,
    RotateCcw,
    Trash2,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    useExistingSerials,
    useRecordMovement,
    useReloadReturnable,
    useReturnableRequests,
    useStockItem,
    useStockItems,
    useStockRequest,
} from '../hooks/use-stock';
import { countLockFor } from '../lib/count-lock';
import { refusalField, returnLines, transferLots } from '../lib/movement-form';
import { stockRefusalText } from '../lib/refusal';
import { LotCard } from './lot-card';
import { ReturnRequestFields } from './return-request-fields';
import { TransferLotList } from './transfer-lot-list';

// The form fields a return or transfer refusal can point at
type MovementFieldErrors = Partial<Record<'stock_request_id' | 'lots' | 'serial_ids' | 'lot_ids' | 'from_label' | 'to_label', string>>;
const RETURN_FIELDS = ['stock_request_id', 'lots', 'serial_ids'];
const TRANSFER_FIELDS = ['lot_ids', 'from_label', 'to_label'];

type SerialStatus = 'ok' | 'empty' | 'dup-system' | 'dup-batch';

// Receive fields in screen order, so the first missing one takes focus
type ReceiveField = 'sku' | 'reference' | 'supplier' | 'to' | 'unit_cost' | 'qty' | 'serials';

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

export function MovementDrawer({
    kind,
    onClose,
    initialRequestId,
    onCloseAutoFocus,
}: {
    kind: MovementKind | null;
    onClose: () => void;
    /** Return mode opened from a request: its item and the request start chosen. */
    initialRequestId?: number;
    /** Where focus goes once the dialog has closed (the request row it came from). */
    onCloseAutoFocus?: (e: Event) => void;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { format: money } = useCurrency();
    const open = kind !== null;
    // Last non-null kind keeps the body mounted through the close animation
    const [shownKind, setShownKind] = useState<MovementKind | null>(null);
    useEffect(() => {
        if (kind) setShownKind(kind);
    }, [kind]);
    const k = kind ?? shownKind;
    const isReceive = k === 'receive';
    const record = useRecordMovement();
    const itemsQuery = useStockItems({}, kind !== null);
    const refreshItems = useSelectRefresh(itemsQuery);
    const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
    const { data: existingSerials = [] } = useExistingSerials(kind !== null);
    const warehousesQuery = useWarehouses();
    const vendorsQuery = useVendors();
    const refreshWarehouses = useSelectRefresh(warehousesQuery);
    const refreshVendors = useSelectRefresh(vendorsQuery);
    const warehouses = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data]);
    const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

    const [sku, setSku] = useState<string>('');
    const [qty, setQty] = useState(1);
    const [unitCost, setUnitCost] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    // Transfer: the whole lots being moved
    const [transferLotIds, setTransferLotIds] = useState<Set<number>>(new Set());

    // Return: the request, per-lot quantities (non-serial) or its serials (serial)
    const [returnRequest, setReturnRequest] = useState<ReturnableRequest | null>(null);
    const [returnQtys, setReturnQtys] = useState<Record<number, string>>({});
    const [returnSerialIds, setReturnSerialIds] = useState<Set<number>>(new Set());

    // Refusals the server tied to a return / transfer field
    const [fieldErrors, setFieldErrors] = useState<MovementFieldErrors>({});
    const clearErrors = (...fields: (keyof MovementFieldErrors)[]) =>
        setFieldErrors((prev) =>
            fields.some((f) => prev[f])
                ? Object.fromEntries(Object.entries(prev).filter(([f]) => !fields.includes(f as keyof MovementFieldErrors)))
                : prev,
        );

    // Opened from a request: seed its item, then let the return fields choose it
    const { data: seedRequest } = useStockRequest(initialRequestId ?? null, kind === 'return');
    const [seedSkuDone, setSeedSkuDone] = useState(false);
    const [seedDone, setSeedDone] = useState(false);
    // The request it opened from has nothing left to return
    const [seedNote, setSeedNote] = useState<string | null>(null);
    // Whether the user has edited the form; the late seeds never reset the baseline over their edits
    const dirtyRef = useRef(false);
    const reloadReturnable = useReloadReturnable();

    // Receive: serial capture
    const [serials, setSerials] = useState<string[]>([]);
    const [mode, setMode] = useState<'manual' | 'scan'>('manual');
    const [scan, setScan] = useState('');
    const scanRef = useRef<HTMLInputElement>(null);
    const serialStatusId = useId();
    const receiveId = useId();

    // Receive: a press with fields missing marks them; each press shakes the banner again
    const [tried, setTried] = useState(false);
    const [tryCount, setTryCount] = useState(0);
    const [noteOpen, setNoteOpen] = useState(false);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    // Receipt step (receive only)
    const [done, setDone] = useState<{
        item: StockItem;
        serials: string[];
        qty: number;
        prevStock: number;
        movementId: number;
        docNo: string | null;
        lot: ReceiveLot | null;
    } | null>(null);
    // Form snapshot taken right after seeding; null = capture on the next render
    const [baseline, setBaseline] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const selected = items.find((i) => String(i.id) === sku);
    const isSerial = isReceive && !!selected?.track_serial;
    const isTransfer = k === 'transfer';

    // Per-warehouse detail (balances + lots) for a transfer
    const transferItemId = isTransfer && sku ? Number(sku) : null;
    const { data: transferItemDetail } = useStockItem(transferItemId);

    const isReturn = k === 'return';
    const returnIsSerial = isReturn && !!selected?.track_serial;

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
        setTransferLotIds(new Set());
        setReturnRequest(null);
        setReturnQtys({});
        setReturnSerialIds(new Set());
        setFieldErrors({});
        setSeedSkuDone(false);
        setSeedDone(false);
        setSeedNote(null);
        setBaseline(null);
        setSaved(false);
        setFrom('');
        setTo('');
        setTried(false);
        setNoteOpen(false);
    }, [open, kind]);

    useEffect(() => {
        if (noteOpen) notesRef.current?.focus();
    }, [noteOpen]);

    // Opened from a request: its item is the SKU (the form stays clean until the user edits); a SKU the user picked wins
    useEffect(() => {
        if (kind !== 'return' || !initialRequestId || seedSkuDone || seedRequest?.id !== initialRequestId) {
            return;
        }
        setSku(String(seedRequest.stock_item_id));
        setSeedSkuDone(true);
        if (!dirtyRef.current) setBaseline(null);
    }, [kind, initialRequestId, seedSkuDone, seedRequest]);

    // ...then the request itself, asked for by its id
    const seedPending = !!initialRequestId && seedSkuDone && !seedDone;
    const seedQuery = useReturnableRequests(seedPending ? Number(sku) : null, '', seedPending, initialRequestId);
    useEffect(() => {
        if (!seedPending || !seedQuery.isSuccess || seedQuery.isPlaceholderData) {
            return;
        }
        const found = seedQuery.data.find((r) => r.id === initialRequestId);
        setSeedDone(true);
        if (!found) {
            setSeedNote(t('stock_return_seed_nothing_left'));
            return;
        }
        setReturnRequest(found);
        if (!dirtyRef.current) setBaseline(null);
    }, [seedPending, seedQuery.isSuccess, seedQuery.isPlaceholderData, seedQuery.data, initialRequestId, t]);

    const onReturnRequestChange = (request: ReturnableRequest | null) => {
        setReturnRequest(request);
        setReturnQtys({});
        setReturnSerialIds(new Set());
        setSeedDone(true);
        setSeedNote(null);
        clearErrors('stock_request_id', 'lots', 'serial_ids');
    };

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
        setTransferLotIds(new Set());
        setReturnRequest(null);
        setReturnQtys({});
        setReturnSerialIds(new Set());
        setSeedSkuDone(true);
        setSeedDone(true);
        setSeedNote(null);
        setFieldErrors({});
        setFrom(kind === 'transfer' ? primaryWarehouse(it) : '');
        setTo(kind === 'receive' ? primaryWarehouse(it) : '');
    };

    // A receive's supplier / destination control bound to master data
    const locationField = (type: 'warehouse' | 'vendor', value: string, onChange: (v: string) => void, placeholder: string) => {
        const options = type === 'warehouse' ? warehouses : vendors;
        return (
            <SearchableSelect
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                refresh={type === 'warehouse' ? refreshWarehouses : refreshVendors}
                options={options.map((o) => ({ value: o.name, label: o.name, search: o.name }))}
            />
        );
    };

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

    // Transfer: whole lots of the source warehouse
    const sourceBalance = isTransfer ? (transferItemDetail?.balances?.find((b) => b.warehouse === from)?.qty ?? 0) : 0;
    const sourceLots = useMemo(() => transferLots(transferItemDetail?.lots ?? [], from), [transferItemDetail, from]);
    const pickedLots = sourceLots.filter((l) => transferLotIds.has(l.id));
    const transferQty = pickedLots.reduce((sum, l) => sum + l.qty_remaining, 0);
    const sameWarehouse = isTransfer && !!from && from === to;
    const canSubmitTransfer = isTransfer && !!selected && !!from && !!to && !sameWarehouse && pickedLots.length > 0;

    // Return: what goes back into each lot the request drew, or the request's serials
    const returned = returnLines(returnRequest?.lots ?? [], returnQtys);
    const returnCount = returnIsSerial ? returnSerialIds.size : returned.total;
    const canSubmitReturn = isReturn && !!selected && !!returnRequest && returnCount > 0 && (returnIsSerial || !returned.over);
    // The warehouses a return arrives in: where the touched lots sit now
    const returnWarehouses = (() => {
        if (!returnRequest) return [];
        const pickedLotNos = new Set(returnRequest.serials.filter((s) => returnSerialIds.has(s.id)).map((s) => s.lot_no));
        return returnRequest.lots
            .filter((l) => (returnIsSerial ? pickedLotNos.has(l.lot_no) : Number(returnQtys[l.lot_id] || 0) > 0))
            .map((l) => l.warehouse);
    })();

    // Receive requires a reference, supplier, destination warehouse and unit cost
    const receiveValid = !!reference.trim() && !!from.trim() && !!to.trim() && unitCost.trim() !== '';
    const canSubmit = isTransfer ? canSubmitTransfer : isReturn ? canSubmitReturn : !!selected && (isSerial ? serialValid : qty >= 1) && receiveValid;

    // Receive: what is still missing, with how to fix it
    const receiveMissing = (): Partial<Record<ReceiveField, string>> => {
        const missing: Partial<Record<ReceiveField, string>> = {};
        if (!selected) missing.sku = t('stock_receive_need_item');
        if (!reference.trim()) missing.reference = t('stock_receive_need_reference');
        if (!from.trim()) missing.supplier = t('stock_receive_need_supplier');
        if (!to.trim()) missing.to = t('stock_receive_need_warehouse');
        if (unitCost.trim() === '') missing.unit_cost = t('stock_receive_need_cost');
        if (selected && !isSerial && qty < 1) missing.qty = t('stock_receive_need_qty');
        if (isSerial && !serialValid) {
            missing.serials =
                dupCount > 0
                    ? t('stock_receive_bad_serials').replace('{n}', fmtN(dupCount))
                    : emptyCount > 0
                      ? t('stock_receive_empty_serials').replace('{n}', fmtN(emptyCount))
                      : t('stock_receive_need_serials');
        }
        return missing;
    };
    const receiveErrors = isReceive && tried ? receiveMissing() : {};
    const missingCount = Object.keys(receiveErrors).length;
    const receiveQty = isSerial ? okCount : qty;

    // Count freeze: the warehouse sides this movement touches (receive/return arrive, transfer leaves and arrives).
    const countedBy = countLockFor(selected, isTransfer ? [from, to] : isReturn ? returnWarehouses : [to]);
    const countedReason = countedBy ? t('stock_refusal_count_in_progress').replace('{reference}', countedBy) : null;

    const snapshot = JSON.stringify([
        sku,
        qty,
        unitCost,
        from,
        to,
        reference,
        notes,
        serials,
        scan,
        [...transferLotIds],
        returnRequest?.id ?? null,
        returnQtys,
        [...returnSerialIds],
    ]);
    useEffect(() => {
        if (open && baseline === null) {
            setBaseline(snapshot);
        }
    }, [open, baseline, snapshot]);
    const isDirty = baseline !== null && snapshot !== baseline;
    dirtyRef.current = isDirty;
    const guardClose = useDiscardGuard(open && !done && !saved && isDirty);

    // Action label always carries the movement name; serial modes append the count
    const actionLabel = (() => {
        if (isReceive) {
            return selected && receiveQty > 0 ? t('stock_receive_submit').replace('{n}', fmtN(receiveQty)) : t('stock_mv_receive');
        }
        if (isTransfer) {
            return transferQty > 0 ? t('stock_transfer_submit').replace('{n}', fmtN(transferQty)) : t('stock_mv_transfer');
        }
        if (isReturn) {
            return returnCount > 0 ? t('stock_return_submit').replace('{n}', fmtN(returnCount)) : t('stock_mv_return');
        }
        return k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : t('save');
    })();
    const dialogTitle = k ? t(`stock_mv_${k}` as Parameters<typeof t>[0]) : '';

    const closeAfterSave = useCloseAfterSave(open, onClose);
    // One movement per press
    const sending = useRef(false);
    const submit = async () => {
        if (sending.current || saved || done) return;
        if (isReceive) {
            const missing = receiveMissing();
            if (Object.keys(missing).length > 0) {
                setTried(true);
                setTryCount((n) => n + 1);
                focusFirstError(missing as Record<string, string>);
                return;
            }
        }
        sending.current = true;
        try {
            await send();
        } finally {
            sending.current = false;
        }
    };

    // A refusal tied to a form field shows under it; anything else is a toast
    const showRefusal = (e: unknown, fields: string[]) => {
        const text = stockRefusalText(e, t, fmt.dateTime);
        const field = refusalField(e);
        if (field && fields.includes(field)) {
            setFieldErrors({ [field]: text });
        } else {
            useToastStore.getState().push(text, 'error');
        }
    };

    // After a refused return the request's "left" may be stale: read it again (gone = nothing left to return)
    const refreshReturnRequest = async (itemId: number, requestId: number) => {
        try {
            const fresh = await reloadReturnable(itemId, requestId);
            setReturnRequest(fresh);
            if (!fresh) {
                setReturnQtys({});
                setReturnSerialIds(new Set());
                setSeedNote(t('stock_return_seed_nothing_left'));
            }
        } catch {
            // The refusal is already on screen; the old figures stay until the next pick
        }
    };

    const send = async () => {
        if (!selected || !canSubmit || countedBy !== null) {
            return;
        }

        // Transfer: the whole lots picked
        if (isTransfer) {
            try {
                await record.mutateAsync({
                    type: 'transfer',
                    stock_item_id: selected.id,
                    from_label: from,
                    to_label: to,
                    lot_ids: pickedLots.map((l) => l.id),
                    notes: notes.trim() || undefined,
                });
                setSaved(true);
                closeAfterSave();
            } catch (e) {
                showRefusal(e, TRANSFER_FIELDS);
            }
            return;
        }

        // Return: against the request, into its lots or with its serials
        if (isReturn && returnRequest) {
            try {
                await record.mutateAsync({
                    type: 'return',
                    stock_item_id: selected.id,
                    stock_request_id: returnRequest.id,
                    ...(returnIsSerial ? { serial_ids: [...returnSerialIds] } : { lots: returned.payload }),
                    notes: notes.trim() || undefined,
                });
                setSaved(true);
                closeAfterSave();
            } catch (e) {
                showRefusal(e, RETURN_FIELDS);
                await refreshReturnRequest(selected.id, returnRequest.id);
            }
            return;
        }

        const cleanSerials = isSerial ? serials.map((s) => s.trim()) : undefined;
        const effectiveQty = isSerial ? serials.length : qty;
        try {
            const movement = await record.mutateAsync({
                type: 'receive',
                stock_item_id: selected.id,
                qty: effectiveQty,
                from_label: from.trim() || undefined,
                to_label: to.trim() || undefined,
                reference: reference.trim() || undefined,
                notes: notes.trim() || undefined,
                serials: cleanSerials,
                unit_cost: unitCost.trim() !== '' ? Number(unitCost) : undefined,
            });
            // Receipt step: the movement id drives the label PDF
            setDone({
                item: selected,
                serials: cleanSerials ?? [],
                qty: effectiveQty,
                prevStock: selected.current_stock,
                movementId: movement.id,
                docNo: movement.doc_no,
                lot: movement.lot ?? null,
            });
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
                <FormDialogContent className={detailDialogHeightClass} onCloseAutoFocus={onCloseAutoFocus}>
                    <FocusDialogHeader
                        icon={Check}
                        tone="success"
                        eyebrow={t('stock')}
                        title={t('stock_received_ok')}
                        code={done.docNo ?? undefined}
                        srDescription={t('stock_received_ok')}
                    />
                    <DialogBody className="flex flex-col space-y-0">
                        {/* Centred in the fixed frame; scrolls from the top when taller */}
                        <div className="my-auto space-y-4">
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

                            {/* Lot opened by this receive */}
                            {done.lot && done.serials.length === 0 && (
                                <LotCard
                                    lotNo={done.lot.lot_no}
                                    warehouse={done.lot.warehouse}
                                    qty={done.lot.qty}
                                    unitCost={done.lot.unit_cost}
                                    unit={done.item.unit}
                                    printable
                                />
                            )}

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
                                            {t('stock_lot_print_serial_stickers')}
                                            <span className="sr-only">{t('stock_opens_new_tab')}</span>
                                        </a>
                                    </div>
                                    <p className="text-muted-foreground mb-2 text-xs">{t('stock_lot_serial_sticker_hint')}</p>
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
                        </div>
                    </DialogBody>
                    <DialogFooterBar>
                        <Button
                            variant="outline"
                            onClick={() => {
                                // Fresh capture form, keeping the chosen SKU
                                setDone(null);
                                setReference('');
                                setNotes('');
                                setTried(false);
                                setNoteOpen(false);
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
            <FormDialogContent className={detailDialogHeightClass} onCloseAutoFocus={onCloseAutoFocus}>
                <FocusDialogHeader
                    icon={k ? KIND_ICON[k] : ArrowDownToLine}
                    eyebrow={t('stock')}
                    title={dialogTitle}
                    code={selected?.sku}
                    srDescription={dialogTitle}
                />
                <DialogBody className={cn('overscroll-contain', isReceive ? 'flex flex-col gap-3 space-y-0' : 'space-y-3')}>
                    {missingCount > 0 && (
                        <FormErrorBanner message={t('stock_receive_missing').replace('{n}', fmtN(missingCount))} shakeKey={tryCount} />
                    )}
                    <Field
                        name="sku"
                        label={t('stock_item')}
                        required
                        error={receiveErrors.sku}
                        help={isTransfer ? t('stock_mv_doc_auto') : undefined}
                        action={
                            isReceive &&
                            selected && (
                                <span
                                    className={cn(
                                        'rounded-full px-2 text-[11px] leading-5 font-medium',
                                        isSerial ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {isSerial ? t('stock_serialized') : t('stock_qty_only')}
                                </span>
                            )
                        }
                    >
                        <SearchableSelect
                            value={sku}
                            onChange={onSkuChange}
                            placeholder={t('stock_select_sku')}
                            options={skuOptions}
                            refresh={refreshItems}
                            flagRemoved
                        />
                    </Field>

                    {/* Transfer */}
                    {isTransfer && selected && (
                        <div className="space-y-3">
                            {/* From / arrow / To */}
                            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                                <Field label={t('stock_from')} required error={fieldErrors.from_label}>
                                    <SearchableSelect
                                        value={from}
                                        onChange={(v) => {
                                            setFrom(v);
                                            setTransferLotIds(new Set());
                                            clearErrors('from_label', 'to_label', 'lot_ids');
                                        }}
                                        placeholder={t('stock_warehouse')}
                                        refresh={refreshWarehouses}
                                        options={warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }))}
                                    />
                                </Field>

                                <div className="flex h-9 w-8 shrink-0 items-center justify-center">
                                    <ArrowRight className="text-muted-foreground h-4 w-4" aria-hidden />
                                </div>

                                <Field label={t('stock_to')} required error={fieldErrors.to_label}>
                                    <SearchableSelect
                                        value={to}
                                        onChange={(v) => {
                                            setTo(v);
                                            clearErrors('to_label');
                                        }}
                                        placeholder={t('stock_warehouse')}
                                        refresh={refreshWarehouses}
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

                            {/* Whole lots to move */}
                            {from && !sameWarehouse && (
                                <TransferLotList
                                    lots={sourceLots}
                                    from={from}
                                    to={to}
                                    unit={selected.unit}
                                    isSerial={selected.track_serial}
                                    selected={transferLotIds}
                                    onChange={(ids) => {
                                        setTransferLotIds(ids);
                                        clearErrors('lot_ids');
                                    }}
                                    error={fieldErrors.lot_ids}
                                />
                            )}
                        </div>
                    )}

                    {/* Return */}
                    {isReturn && selected && (
                        <ReturnRequestFields
                            itemId={selected.id}
                            unit={selected.unit}
                            isSerial={selected.track_serial}
                            request={returnRequest}
                            onRequestChange={onReturnRequestChange}
                            qtys={returnQtys}
                            onQtysChange={(qtys) => {
                                setReturnQtys(qtys);
                                clearErrors('lots');
                            }}
                            serialIds={returnSerialIds}
                            onSerialIdsChange={(ids) => {
                                setReturnSerialIds(ids);
                                clearErrors('serial_ids');
                            }}
                            errors={fieldErrors}
                            seedNote={seedNote ?? undefined}
                        />
                    )}

                    {/* Receive: the document fields and the unit cost, two by two */}
                    {isReceive && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field name="reference" label={t('stock_reference')} required error={receiveErrors.reference}>
                                <Input
                                    name="reference"
                                    autoComplete="off"
                                    maxLength={100}
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder={t('stock_reference_ph')}
                                />
                            </Field>
                            <Field name="supplier" label={t('stock_supplier')} required error={receiveErrors.supplier}>
                                {locationField('vendor', from, setFrom, t('stock_supplier'))}
                            </Field>
                            <Field name="to" label={t('stock_to')} required error={receiveErrors.to}>
                                {locationField('warehouse', to, setTo, t('stock_warehouse'))}
                            </Field>
                            <Field name="unit_cost" label={t('stock_unit_cost')} required error={receiveErrors.unit_cost}>
                                <MoneyInput name="unit_cost" value={unitCost} onValueChange={setUnitCost} maxWholeDigits={10} />
                            </Field>
                        </div>
                    )}

                    {/* Receive: the work area waits for an item */}
                    {isReceive && !selected && (
                        <section aria-labelledby={`${receiveId}-area`} className="flex min-h-0 flex-1 flex-col gap-2">
                            <h3 id={`${receiveId}-area`} className="text-muted-foreground text-xs font-semibold">
                                {t('stock_qty_received')}
                            </h3>
                            <EmptyState
                                kind="pick"
                                title={t('stock_receive_area_empty')}
                                hint={t('stock_receive_area_empty_hint')}
                                className="min-h-28 rounded-lg border border-dashed py-4"
                            />
                        </section>
                    )}

                    {/* Quantity-only capture — receive */}
                    {selected && isReceive && !isSerial && (
                        <div data-field="qty" className="space-y-1.5">
                            <Label htmlFor={`${receiveId}-qty`}>
                                {t('stock_qty_received')}
                                <span className="text-destructive ml-0.5" aria-hidden>
                                    *
                                </span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setQty(Math.max(1, qty - 1))}
                                    disabled={qty <= 1}
                                    aria-label={t('stock_qty_less')}
                                >
                                    <Minus className="h-4 w-4" aria-hidden />
                                </Button>
                                <Input
                                    id={`${receiveId}-qty`}
                                    name="qty"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    aria-required
                                    aria-invalid={receiveErrors.qty ? true : undefined}
                                    value={qty || ''}
                                    onChange={(e) => setQty(Number(digitsOnly(e.target.value)))}
                                    className={cn(
                                        'h-10 w-28 text-center text-base font-semibold tabular-nums',
                                        receiveErrors.qty && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                    )}
                                />
                                <Button type="button" variant="outline" size="icon" onClick={() => setQty(qty + 1)} aria-label={t('stock_qty_more')}>
                                    <Plus className="h-4 w-4" aria-hidden />
                                </Button>
                                {selected.unit && <span className="text-muted-foreground text-sm">{selected.unit}</span>}
                                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                                    {t('stock_receive_on_hand_now').replace('{n}', `${fmtN(selected.current_stock)} ${selected.unit ?? ''}`.trim())}
                                </span>
                            </div>
                            {receiveErrors.qty && <p className="text-destructive text-xs">{receiveErrors.qty}</p>}
                        </div>
                    )}

                    {/* Serialized capture — receive only; the list takes the room left and scrolls on its own */}
                    {selected && isSerial && (
                        <div data-field="serials" className="flex min-h-56 flex-1 flex-col gap-2.5">
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
                                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-1">
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
                            {receiveErrors.serials && <p className="text-destructive text-xs">{receiveErrors.serials}</p>}
                        </div>
                    )}

                    {/* Receive keeps the notes behind a link until wanted */}
                    {isReceive && !noteOpen && !notes ? (
                        <Button type="button" variant="link" className="h-auto self-start p-0 text-xs" onClick={() => setNoteOpen(true)}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            {t('stock_add_note')}
                        </Button>
                    ) : (
                        <Field label={t('stock_notes')}>
                            <Textarea
                                ref={notesRef}
                                name="notes"
                                autoComplete="off"
                                rows={2}
                                className="min-h-0"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </Field>
                    )}
                </DialogBody>
                <DialogFooterBar>
                    {/* Receive: what the press will do */}
                    {isReceive && (
                        <p aria-live="polite" className="text-muted-foreground mr-auto line-clamp-2 min-w-0 text-xs tabular-nums">
                            {selected && to && receiveQty > 0 ? (
                                <>
                                    <b className="text-emerald-700 dark:text-emerald-400">
                                        +{fmtN(receiveQty)} {selected.unit ?? ''}
                                    </b>{' '}
                                    {t('stock_receive_into').replace('{warehouse}', to)}
                                    {unitCost.trim() !== '' &&
                                        ` ${t('stock_receive_worth').replace('{value}', money(receiveQty * Number(unitCost)))}`}
                                </>
                            ) : (
                                t('stock_receive_summary_empty')
                            )}
                        </p>
                    )}
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={record.isPending}>
                        {t('cancel')}
                    </Button>
                    <DisabledReason reason={saved ? null : countedReason} label={actionLabel}>
                        <SaveButton
                            loading={record.isPending}
                            success={saved}
                            onClick={submit}
                            disabled={!saved && ((!isReceive && !canSubmit) || countedBy !== null)}
                        >
                            {actionLabel}
                        </SaveButton>
                    </DisabledReason>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
