// "สแกนเช็ค Lot" dialog: scan or type a Lot (or Serial) code, see its warehouse and balance, and keep a list of what was scanned.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { searchGetsFocus } from '@/shared/lib/select-menu';
import { cn } from '@/shared/lib/utils';
import type { LotLookup } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, focusDialogOnOpen, FormDialogContent } from '@/shared/ui/dialog';
import { ExternalLink, Printer, ScanQrCode } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { lookupLot, lotLabelsPdfUrl } from '../api/stockApi';
import { LOT_ACCENT, LOT_BOX } from '../lib/lot-accent';
import { parseLotCode } from '../lib/lot-code';
import { stockRefusalText } from '../lib/refusal';
import { LotStateBadge } from './lot-state-badge';

// `detail` is read out with the note only (warehouse and balance of a good scan)
type Note = { kind: 'ok' | 'bad'; text: string; detail?: string } | null;

export function LotScanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { format: money } = useCurrency();
    const scanRef = useRef<HTMLInputElement>(null);

    const [code, setCode] = useState('');
    const [note, setNote] = useState<Note>(null);
    // Codes waiting for a lookup: a fast second scan queues behind the first instead of being dropped
    const queue = useRef<string[]>([]);
    const looking = useRef(false);
    const [scans, setScans] = useState<LotLookup[]>([]);
    // Bumped per good scan so the result card remounts and flashes again
    const [flash, setFlash] = useState(0);

    // Each opening starts a fresh round
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setCode('');
            setNote(null);
            setScans([]);
            queue.current = [];
        }
    }

    const current = scans[0] ?? null;

    const leftText = (l: LotLookup) => (l.state === 'empty' ? t('stock_lots_emptied') : `${fmtN(l.remaining)} ${l.item.unit ?? t('stock_units')}`);

    // A repeat scan moves to the top of the list
    const record = (found: LotLookup) => {
        setScans((prev) => [found, ...prev.filter((s) => s.lot_no !== found.lot_no)]);
        setFlash((n) => n + 1);
        const done = t('stock_scan_lot_done').replace('{lot_no}', found.lot_no);
        setNote({
            kind: 'ok',
            text: found.serial ? `${found.serial} → ${done}` : done,
            detail: `${t('stock_lot_held_at')} ${found.warehouse} ${t('stock_scan_lot_left')} ${leftText(found)}`,
        });
    };

    // Looks the queued codes up one at a time, in scan order
    const drain = async () => {
        if (looking.current) return;
        looking.current = true;
        while (queue.current.length > 0) {
            const raw = queue.current.shift() as string;
            try {
                // The server also matches serials, so a code with no lot number still goes through
                record(await lookupLot(parseLotCode(raw) ?? raw));
            } catch (error) {
                setNote({ kind: 'bad', text: stockRefusalText(error, t) });
            }
        }
        looking.current = false;
    };

    const scan = () => {
        const raw = code.trim();
        setCode('');
        if (raw === '') return;
        queue.current.push(raw);
        void drain();
    };

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        scan();
    };

    const clearList = () => {
        setScans([]);
        setNote(null);
    };

    // Touch screens keep the keyboard down until the scan box is tapped
    const onOpenAutoFocus = (e: Event) => {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        if (!searchGetsFocus({ coarsePointer, isAsync: false, optionCount: 0 })) return focusDialogOnOpen(e);
        e.preventDefault();
        scanRef.current?.focus({ preventScroll: true });
    };

    const emptied = current?.state === 'empty';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <FormDialogContent className="h-[780px]" onOpenAutoFocus={onOpenAutoFocus}>
                <FocusDialogHeader icon={ScanQrCode} accent={LOT_ACCENT} eyebrow={t('stock_title')} title={t('stock_scan_lot')} />
                <DialogBody className="flex flex-col gap-3 space-y-0 py-4">
                    {/* Scan box and its result line */}
                    <div className="shrink-0">
                        <label className="border-input bg-background focus-within:ring-ring flex h-12 items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
                            <ScanQrCode className="text-muted-foreground h-[18px] w-[18px] shrink-0" aria-hidden />
                            <input
                                ref={scanRef}
                                type="text"
                                name="lot_scan"
                                autoComplete="off"
                                spellCheck={false}
                                enterKeyHint="done"
                                aria-label={t('stock_scan_lot_ph')}
                                placeholder={t('stock_scan_lot_ph')}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                onKeyDown={onKey}
                                className="min-w-0 flex-1 bg-transparent text-base outline-none"
                            />
                        </label>
                        <p
                            aria-live="polite"
                            className={cn(
                                'mt-1 min-h-5 text-xs',
                                note?.kind === 'bad' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400',
                            )}
                        >
                            {note?.text}
                            {note?.detail && <span className="sr-only"> {note.detail}</span>}
                        </p>
                    </div>

                    {/* Result card for the latest scan */}
                    {current ? (
                        <div key={flash} className={cn('lot-hit shrink-0 rounded-xl border p-4', emptied ? 'border-border bg-muted/40' : LOT_BOX)}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-xl font-bold tracking-wide tabular-nums" translate="no">
                                        {current.lot_no}
                                    </div>
                                    <div className="mt-0.5 text-sm">
                                        {current.item.name}{' '}
                                        <span className="text-muted-foreground text-xs" translate="no">
                                            {current.item.sku}
                                        </span>
                                    </div>
                                </div>
                                <LotStateBadge state={current.state} className="shrink-0" />
                            </div>
                            <dl className="mt-3.5 grid grid-cols-2 gap-3">
                                <div>
                                    <dt className="text-muted-foreground text-xs">{t('stock_lot_held_at')}</dt>
                                    <dd className="text-xl font-bold">{current.warehouse}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground text-xs">{t('stock_scan_lot_left')}</dt>
                                    <dd className="text-xl font-bold tabular-nums">{leftText(current)}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground text-xs">{t('stock_scan_lot_received')}</dt>
                                    <dd className="text-sm">{current.received_at ? fmt.date(current.received_at) : '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground text-xs">{t('stock_lot_unit_cost')}</dt>
                                    <dd className="text-sm tabular-nums">{money(current.unit_cost)}</dd>
                                </div>
                            </dl>
                            {current.item.track_serial && <p className="text-muted-foreground mt-2.5 text-xs">{t('stock_scan_lot_serial_note')}</p>}
                            <div className="mt-3.5 flex flex-wrap gap-2">
                                <a
                                    href={`/stock/lots/${encodeURIComponent(current.lot_no)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={buttonVariants({ variant: 'outline' })}
                                >
                                    {t('stock_scan_lot_view_history')}
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                    <span className="sr-only">{t('stock_opens_new_tab')}</span>
                                </a>
                                <a
                                    href={lotLabelsPdfUrl(current.lot_no)}
                                    target="_blank"
                                    rel="noopener"
                                    className={buttonVariants({ variant: 'outline' })}
                                >
                                    <Printer className="h-4 w-4" aria-hidden />
                                    {t('stock_scan_lot_reprint')}
                                    <span className="sr-only">{t('stock_opens_new_tab')}</span>
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="border-border text-muted-foreground shrink-0 rounded-xl border border-dashed px-4 py-7 text-center text-xs">
                            {t('stock_scan_lot_empty')}
                        </div>
                    )}

                    {/* Scanned this session */}
                    <div className="border-border flex min-h-32 flex-1 flex-col overflow-hidden rounded-lg border">
                        <div className="bg-muted/40 flex shrink-0 items-center px-3 py-2">
                            <span className="text-muted-foreground flex-1 text-xs font-semibold">
                                {t('stock_scan_lot_session').replace('{n}', fmtN(scans.length))}
                            </span>
                            <Button
                                variant="link"
                                size="sm"
                                className="h-auto min-h-6 px-1 text-xs"
                                disabled={scans.length === 0}
                                onClick={clearList}
                            >
                                {t('stock_scan_lot_clear')}
                            </Button>
                        </div>
                        <ul className="min-h-0 flex-1 overflow-auto overscroll-contain">
                            {scans.map((s) => (
                                <li
                                    key={s.lot_no}
                                    className="border-border/60 grid grid-cols-[150px_minmax(0,1fr)_110px_70px] items-center gap-2.5 border-t px-3 py-2 text-[13px]"
                                >
                                    <span className="font-semibold tabular-nums" translate="no">
                                        {s.lot_no}
                                    </span>
                                    <span className="truncate">{s.item.name}</span>
                                    <span className="truncate">{s.warehouse}</span>
                                    <span className="text-right tabular-nums">{leftText(s)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-muted-foreground shrink-0 text-xs">{t('stock_scan_lot_tablet_note')}</p>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('close')}
                    </Button>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
