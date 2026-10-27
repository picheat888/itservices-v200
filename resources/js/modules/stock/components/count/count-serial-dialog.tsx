// "ตรวจ Serial" dialog: scan or tick the serials found for one serial-tracked count line; a recount can tick back serials the earlier count wrote off.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { matchesAllWords } from '@/shared/lib/search-words';
import { searchGetsFocus } from '@/shared/lib/select-menu';
import { cn } from '@/shared/lib/utils';
import type { StockCountLine } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogBody, DialogFooterBar, focusDialogOnOpen, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { ScanBarcode } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CountChip } from './count-chip';

type Serial = { id: number; serial: string };
type Chip = 'all' | 'found' | 'notfound';
type ScanNote = { kind: 'ok' | 'dup' | 'none'; text: string } | null;

// Violet marks serial tracking, as the S/N tag does
const SERIAL_ACCENT = '#6d28d9';

/** Ticked serials when the dialog opens: a line not counted yet starts with none, else every serial not recorded missing. */
function seedTicks(line: StockCountLine | null): { found: number[]; back: number[] } {
    if (!line) return { found: [], back: [] };
    const serials = line.serials ?? [];
    const lostIds = new Set((line.lost_serials ?? []).map((s) => s.id));
    const missing = new Set(line.missing_serial_ids);
    return {
        found: line.counted_qty === null ? [] : serials.filter((s) => !missing.has(s.id)).map((s) => s.id),
        back: line.found_serial_ids.filter((id) => lostIds.has(id)),
    };
}

function SerialRow({ serial, ticked, onToggle }: { serial: Serial; ticked: boolean; onToggle: () => void }) {
    const t = useT();
    return (
        <label
            className={cn(
                'hover:bg-accent/40 border-border/60 flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm transition-colors last:border-0',
                ticked && 'bg-brand/5',
            )}
        >
            <Checkbox className="size-4" checked={ticked} onCheckedChange={onToggle} />
            <span className="min-w-0 flex-1 truncate tabular-nums">{serial.serial}</span>
            <span className={cn('shrink-0 text-xs', ticked ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                {ticked ? t('stock_count_chip_found') : t('stock_count_chip_notfound')}
            </span>
        </label>
    );
}

export function CountSerialDialog({
    line,
    warehouse,
    lostGroupRef,
    open,
    onOpenChange,
    onApply,
}: {
    line: StockCountLine | null;
    warehouse: string;
    /** The earlier count's reference, heading the group of serials it recorded lost (recounts only). */
    lostGroupRef?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApply: (missing: number[], found: number[]) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const scanRef = useRef<HTMLInputElement>(null);

    // The last line stays on screen through the close animation
    const [kept, setKept] = useState(line);
    if (line && line !== kept) setKept(line);
    const shown = line ?? kept;

    const [found, setFound] = useState<number[]>([]);
    const [back, setBack] = useState<number[]>([]);
    const [query, setQuery] = useState('');
    const [chip, setChip] = useState<Chip>('all');
    const [note, setNote] = useState<ScanNote>(null);
    const [seed, setSeed] = useState(() => seedTicks(null));

    // Each opening seeds the ticks from the line
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            const next = seedTicks(line);
            setSeed(next);
            setFound(next.found);
            setBack(next.back);
            setQuery('');
            setChip('all');
            setNote(null);
        }
    }

    const serials = shown?.serials ?? [];
    const lost = shown?.lost_serials ?? [];
    const foundSet = new Set(found);
    const backSet = new Set(back);
    const foundCount = serials.filter((s) => foundSet.has(s.id)).length;
    const backCount = lost.filter((s) => backSet.has(s.id)).length;
    const missingCount = serials.length - foundCount;
    const allFound = serials.length > 0 && missingCount === 0;

    const rowShows = (s: Serial, ticked: boolean) => (chip === 'all' || (chip === 'found' ? ticked : !ticked)) && matchesAllWords(s.serial, query);
    const serialRows = serials.filter((s) => rowShows(s, foundSet.has(s.id)));
    const lostRows = lost.filter((s) => rowShows(s, backSet.has(s.id)));
    const tickedRows = foundCount + backCount;
    const totalRows = serials.length + lost.length;

    const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));
    const guardClose = useDiscardGuard(open && !(sameIds(found, seed.found) && sameIds(back, seed.back)));
    const close = () => onOpenChange(false);

    const toggleIn = (set: (fn: (prev: number[]) => number[]) => void, id: number) =>
        set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const toggleAll = () => {
        setFound(allFound ? [] : serials.map((s) => s.id));
        setNote(null);
    };

    // Enter ticks the scanned serial, says what happened, clears the box and keeps focus there
    const onScanKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const code = query.trim();
        if (code === '') return;
        const same = (s: Serial) => s.serial.toLowerCase() === code.toLowerCase();
        const inStock = serials.find(same);
        const wasLost = inStock ? undefined : lost.find(same);
        const hit = inStock ?? wasLost;
        if (!hit) {
            setNote({ kind: 'none', text: t('stock_count_scan_none').replace('{serial}', code) });
        } else if ((inStock ? foundSet : backSet).has(hit.id)) {
            setNote({ kind: 'dup', text: t('stock_count_scan_dup').replace('{serial}', hit.serial) });
        } else {
            (inStock ? setFound : setBack)((prev) => [...prev, hit.id]);
            setNote({ kind: 'ok', text: t('stock_count_scan_found').replace('{serial}', hit.serial) });
        }
        setQuery('');
        scanRef.current?.focus();
    };

    const apply = () => {
        onApply(
            serials.filter((s) => !foundSet.has(s.id)).map((s) => s.id),
            lost.filter((s) => backSet.has(s.id)).map((s) => s.id),
        );
        close();
    };

    // Touch screens keep the keyboard down until the scan box is tapped
    const onOpenAutoFocus = (e: Event) => {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        if (!searchGetsFocus({ coarsePointer, isAsync: false, optionCount: totalRows })) return focusDialogOnOpen(e);
        e.preventDefault();
        scanRef.current?.focus({ preventScroll: true });
    };

    // "เจอ {n} จาก {total}" with the found number in bold
    const foundOf = t('stock_count_found_of').split('{n}');
    const where = t('stock_count_serial_where')
        .replace('{name}', shown?.name ?? '')
        .replace('{warehouse}', warehouse);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(close)}>
            <FormDialogContent className="h-[680px]" onOpenAutoFocus={onOpenAutoFocus}>
                <FocusDialogHeader
                    icon={ScanBarcode}
                    accent={SERIAL_ACCENT}
                    eyebrow={shown?.sku ?? ''}
                    title={t('stock_count_serial_title')}
                    srDescription={where}
                    subtitle={<span className="text-muted-foreground text-sm">{where}</span>}
                />
                <DialogBody className="flex flex-col gap-2.5 space-y-0 py-4">
                    {/* Scan box and its result line */}
                    <div className="shrink-0">
                        <div className="relative">
                            <ScanBarcode
                                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                aria-hidden
                            />
                            <Input
                                ref={scanRef}
                                type="search"
                                name="serial-scan"
                                autoComplete="off"
                                spellCheck={false}
                                enterKeyHint="done"
                                aria-label={t('stock_count_scan')}
                                placeholder={t('stock_count_scan')}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onScanKey}
                                className="h-10 pl-9 text-sm"
                            />
                        </div>
                        <p
                            aria-live="polite"
                            className={cn(
                                'mt-1 min-h-5 text-xs',
                                note?.kind === 'ok'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : note?.kind === 'none'
                                      ? 'text-destructive'
                                      : 'text-muted-foreground',
                            )}
                        >
                            {note?.text}
                        </p>
                    </div>

                    {/* Serial list: heading with toggle all, chips, scrolling rows */}
                    <div className="border-border flex min-h-40 flex-1 flex-col overflow-hidden rounded-lg border">
                        <div className="border-border bg-muted/40 flex shrink-0 items-center gap-2 border-b px-3 py-2">
                            <span className="text-muted-foreground text-xs font-semibold">{t('stock_count_tick_found')}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                                {fmtN(foundCount)}/{fmtN(serials.length)}
                            </span>
                            <Button
                                variant="link"
                                size="sm"
                                className="ml-auto h-auto min-h-6 px-1 text-xs"
                                disabled={serials.length === 0}
                                onClick={toggleAll}
                            >
                                {allFound ? t('stock_return_select_none') : t('stock_return_select_all')}
                            </Button>
                        </div>
                        <div
                            className="border-border/60 flex shrink-0 flex-wrap gap-1.5 border-b px-3 py-2"
                            role="group"
                            aria-label={t('stock_count_tick_found')}
                        >
                            <CountChip label={t('stock_count_chip_all')} count={totalRows} selected={chip === 'all'} onClick={() => setChip('all')} />
                            <CountChip
                                label={t('stock_count_chip_found')}
                                count={tickedRows}
                                selected={chip === 'found'}
                                onClick={() => setChip('found')}
                            />
                            <CountChip
                                label={t('stock_count_chip_notfound')}
                                count={totalRows - tickedRows}
                                selected={chip === 'notfound'}
                                onClick={() => setChip('notfound')}
                            />
                        </div>
                        <div className="min-h-0 flex-1 scroll-py-2 overflow-auto overscroll-contain">
                            {totalRows === 0 ? (
                                <EmptyState title={t('stock_empty_requests_fulfil_serials')} className="min-h-0 py-8" />
                            ) : serialRows.length + lostRows.length === 0 ? (
                                <EmptyState kind="search" title={t('stock_count_no_match')} className="min-h-0 py-8" />
                            ) : (
                                <>
                                    {serialRows.map((s) => (
                                        <SerialRow key={s.id} serial={s} ticked={foundSet.has(s.id)} onToggle={() => toggleIn(setFound, s.id)} />
                                    ))}
                                    {lostRows.length > 0 && (
                                        <div role="group" aria-label={t('stock_count_lost_group').replace('{reference}', lostGroupRef ?? '—')}>
                                            <div className="border-border bg-muted/40 text-muted-foreground border-y px-3 py-1.5 text-xs font-semibold">
                                                {t('stock_count_lost_group').replace('{reference}', lostGroupRef ?? '—')}
                                            </div>
                                            {lostRows.map((s) => (
                                                <SerialRow
                                                    key={s.id}
                                                    serial={s}
                                                    ticked={backSet.has(s.id)}
                                                    onToggle={() => toggleIn(setBack, s.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>
                            {foundOf[0]}
                            <b className="tabular-nums">{fmtN(foundCount)}</b>
                            {(foundOf[1] ?? '').replace('{total}', fmtN(serials.length))}
                        </span>
                        {missingCount > 0 && (
                            <span className="text-destructive">{t('stock_count_missing_note').replace('{n}', fmtN(missingCount))}</span>
                        )}
                        {backCount > 0 && (
                            <span className="text-emerald-700 dark:text-emerald-400">
                                {t('stock_count_found_back').replace('{n}', fmtN(backCount))}
                            </span>
                        )}
                    </p>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(close)}>
                        {t('close')}
                    </Button>
                    <Button onClick={apply}>{t('stock_count_use_qty').replace('{n}', fmtN(foundCount + backCount))}</Button>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
