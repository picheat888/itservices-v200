// Count sheet maths: reason lists, reason clearing on a qty change, summary and chip/search filtering.
// Pure (no React or browser imports) so node tests can load it.
import type { CountReason } from '@/shared/types';
import { matchesAllWords } from '../../../shared/lib/search-words.ts';

export const SHORT_REASONS: CountReason[] = ['lost', 'broken', 'used', 'miscount', 'custom'];
export const OVER_REASONS: CountReason[] = ['inbound', 'returned', 'miscount', 'custom'];

export interface DraftLine {
    system_qty: number;
    counted_qty: number | null;
    reason: CountReason | null;
    reason_note: string | null;
}

export type SheetChip = 'all' | 'pending' | 'short' | 'over' | 'same' | 'no_reason';

const varianceOf = (l: DraftLine): number | null => (l.counted_qty === null ? null : l.counted_qty - l.system_qty);

/** Keeps the reason while it still fits the new variance, otherwise clears it. */
export function reasonAfterQtyChange(reason: CountReason | null, variance: number | null): CountReason | null {
    if (reason === null || variance === null || variance === 0) return null;
    const allowed = variance < 0 ? SHORT_REASONS : OVER_REASONS;
    return allowed.includes(reason) ? reason : null;
}

/** A differing line needs a reason, and a custom reason needs a note. */
export function lineNeedsReason(l: DraftLine): boolean {
    const variance = varianceOf(l);
    if (variance === null || variance === 0) return false;
    if (l.reason === null) return true;
    return l.reason === 'custom' && (l.reason_note ?? '').trim() === '';
}

export function sheetSummary(lines: DraftLine[]) {
    const out = { total: lines.length, counted: 0, same: 0, short: 0, over: 0, shortQty: 0, overQty: 0, noReason: 0 };
    for (const l of lines) {
        const variance = varianceOf(l);
        if (variance === null) continue;
        out.counted += 1;
        if (variance === 0) out.same += 1;
        else if (variance < 0) {
            out.short += 1;
            out.shortQty += -variance;
        } else {
            out.over += 1;
            out.overQty += variance;
        }
        if (lineNeedsReason(l)) out.noReason += 1;
    }
    return out;
}

export function filterLines<T extends DraftLine & { sku: string | null; name: string | null }>(lines: T[], chip: SheetChip, query: string): T[] {
    return lines.filter((l) => {
        const variance = varianceOf(l);
        const chipOk =
            chip === 'all' ||
            (chip === 'pending' && variance === null) ||
            (chip === 'short' && variance !== null && variance < 0) ||
            (chip === 'over' && variance !== null && variance > 0) ||
            (chip === 'same' && variance === 0) ||
            (chip === 'no_reason' && lineNeedsReason(l));
        return chipOk && matchesAllWords(`${l.sku ?? ''} ${l.name ?? ''}`, query);
    });
}
