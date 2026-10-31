// Count sheet maths: reason lists, reason clearing on a qty change, summary, chip/search filtering, draft edits over saved lines and the row a refusal names.
// Pure (no React or browser imports) so node tests can load it.
import type { CountReason, StockCount } from '@/shared/types';
import { matchesAllWords } from '../../../shared/lib/search-words.ts';
import type { LinePatch } from '../api/stockApi';

/** Badge tone of a sheet's status, shared by the list and the sheet. */
export const countStatusTone = (s: StockCount['status']) => (s === 'committed' ? 'green' : s === 'canceled' ? 'gray' : 'amber');

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

/** The ids a chip and search pick, in sheet order; the sheet keeps this list until the filter changes. */
export function filterIds<T extends DraftLine & { id: number; sku: string | null; name: string | null }>(
    lines: T[],
    chip: SheetChip,
    query: string,
): number[] {
    return filterLines(lines, chip, query).map((l) => l.id);
}

/** The current lines for a kept id list, in sheet order. */
export function linesByIds<T extends { id: number }>(lines: T[], ids: number[]): T[] {
    const keep = new Set(ids);
    return lines.filter((l) => keep.has(l.id));
}

export type SheetSummary = ReturnType<typeof sheetSummary>;

// Draft edits laid over the saved lines
const MAX_QTY = 1_000_000;

/** One line's unsaved edits; a missing key keeps the saved value. */
export interface LineEdit {
    qty?: string;
    reason?: CountReason | null;
    note?: string;
    missing?: number[];
    found?: number[];
}

export interface SavedLine extends DraftLine {
    track_serial: boolean;
    missing_serial_ids: number[];
    found_serial_ids: number[];
}

/** A typed count: blank is not counted, digits cap at the server's limit. */
export function parseQty(raw: string): number | null {
    const digits = raw.replace(/\D/g, '');
    return digits === '' ? null : Math.min(MAX_QTY, parseInt(digits, 10));
}

/** Typed digits as the count box shows them, never above the cap. */
export function clampQtyText(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return digits !== '' && parseInt(digits, 10) > MAX_QTY ? String(MAX_QTY) : digits;
}

/** The line as the sheet shows it; a serial line's count follows its ticks, and a picked reason shows only while it fits. */
export function draftLine<T extends SavedLine>(line: T, edit: LineEdit | undefined): T {
    if (!edit) return line;
    const missing = edit.missing ?? line.missing_serial_ids;
    const found = edit.found ?? line.found_serial_ids;
    const ticked = edit.missing !== undefined || edit.found !== undefined;
    const counted = line.track_serial
        ? ticked
            ? line.system_qty - missing.length + found.length
            : line.counted_qty
        : edit.qty !== undefined
          ? parseQty(edit.qty)
          : line.counted_qty;
    const picked = edit.reason !== undefined ? edit.reason : line.reason;
    return {
        ...line,
        counted_qty: counted,
        reason: reasonAfterQtyChange(picked, counted === null ? null : counted - line.system_qty),
        reason_note: edit.note !== undefined ? edit.note : line.reason_note,
        missing_serial_ids: missing,
        found_serial_ids: found,
    };
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));
const noteOf = (l: DraftLine) => (l.reason === 'custom' ? (l.reason_note ?? '') : null);

/** The save payload for one line: only what differs from the saved copy, or null when nothing does. */
export function linePatch(saved: SavedLine, shown: SavedLine): LinePatch | null {
    if (shown.counted_qty === null) return saved.counted_qty === null ? null : { counted_qty: null };
    const patch: LinePatch = {};
    if (saved.track_serial) {
        const ticksChanged = !sameIds(saved.missing_serial_ids, shown.missing_serial_ids) || !sameIds(saved.found_serial_ids, shown.found_serial_ids);
        if (ticksChanged || saved.counted_qty === null) {
            patch.missing_serial_ids = shown.missing_serial_ids;
            patch.found_serial_ids = shown.found_serial_ids;
        }
    } else if (shown.counted_qty !== saved.counted_qty) {
        patch.counted_qty = shown.counted_qty;
    }
    if (shown.reason !== saved.reason || noteOf(shown) !== noteOf(saved)) {
        patch.reason = shown.reason;
        patch.reason_note = noteOf(shown);
    }
    return Object.keys(patch).length === 0 ? null : patch;
}

const REASON_REFUSALS = ['count_reason_missing', 'count_reason_wrong_side', 'count_reason_note_missing'];

/** The row a server refusal names by sku, and whether its reason or its count needs fixing. */
export function refusedLine<T extends { id: number; sku: string | null }>(
    error: unknown,
    lines: T[],
): { id: number; field: 'reason' | 'count' } | null {
    const data = (error as { response?: { data?: { message?: unknown; sku?: unknown } } } | undefined)?.response?.data;
    if (typeof data?.sku !== 'string' || data.sku === '') return null;
    const line = lines.find((l) => l.sku === data.sku);
    if (!line) return null;
    return { id: line.id, field: REASON_REFUSALS.includes(String(data.message)) ? 'reason' : 'count' };
}
