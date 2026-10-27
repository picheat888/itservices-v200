// Small pieces of a count line shared by the sheet, review and confirmed dialogs: item cell, difference badge, reason text.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { StockCountLine } from '@/shared/types';
import { movementNote } from '../../lib/movement-note';
import { SnBadge } from './sn-badge';

export const varianceOf = (l: Pick<StockCountLine, 'counted_qty' | 'system_qty'>) => (l.counted_qty === null ? null : l.counted_qty - l.system_qty);

/** Serial numbers of the line's missing ids: in-stock ones from the draft, written-off ones from the server. */
export function missingSerialNames(line: StockCountLine): string[] {
    const names = new Map([...(line.serials ?? []), ...(line.missing_serials ?? [])].map((s) => [s.id, s.serial] as const));
    return line.missing_serial_ids.map((id) => names.get(id)).filter((s): s is string => s !== undefined);
}

/** The reason in words; a custom reason shows the typed text. */
export function useReasonText() {
    const t = useT();
    return (line: Pick<StockCountLine, 'reason' | 'reason_note'>) => movementNote({ reason: line.reason, notes: line.reason_note }, t);
}

export function SignedQty({ value }: { value: number }) {
    const fmtN = useNumberFormat();
    return <>{value > 0 ? `+${fmtN(value)}` : value < 0 ? `−${fmtN(-value)}` : fmtN(0)}</>;
}

export function DiffBadge({ variance }: { variance: number | null }) {
    const t = useT();
    if (variance === null) return <span className="text-muted-foreground">—</span>;
    return (
        <span
            className={cn(
                'inline-flex min-w-11 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                variance > 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : variance < 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                      : 'bg-muted text-muted-foreground',
            )}
        >
            {variance === 0 ? t('stock_count_same') : <SignedQty value={variance} />}
        </span>
    );
}

export function ItemCell({ line }: { line: Pick<StockCountLine, 'sku' | 'name' | 'track_serial'> }) {
    return (
        <div className="min-w-0">
            <div className="truncate text-xs font-medium">
                {line.sku}
                {line.track_serial && <SnBadge />}
            </div>
            <div className="text-muted-foreground truncate text-xs">{line.name}</div>
        </div>
    );
}

/** Read-only reason cell: the reason, then the lost serials of an S/N line. */
export function ReasonCell({ line }: { line: StockCountLine }) {
    const t = useT();
    const reasonText = useReasonText();
    const variance = varianceOf(line);
    if (variance === null || variance === 0) return <span className="text-muted-foreground">—</span>;
    const lost = missingSerialNames(line);
    return (
        <div className="min-w-0 text-sm">
            <div className="break-words">{reasonText(line) ?? '—'}</div>
            {lost.length > 0 && (
                <div className="text-muted-foreground text-xs break-words">{t('stock_count_lost_serial').replace('{serials}', lost.join(', '))}</div>
            )}
        </div>
    );
}
