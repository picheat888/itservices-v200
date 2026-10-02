/**
 * The Report Center's period (PeriodSwitch beside the heading): the last 7, 30 or 90 days, or a
 * from / to the reader picks. Remembered in localStorage (`reports.snapshot.period`) like a list
 * filter, as JSON. A value saved by the old switch (a plain "7d", or the calendar periods
 * "month" / "quarter" / "year" that ReportSnapshotService no longer takes) is read as the
 * nearest preset, so a returning reader never sends the API a period it refuses.
 */
import { useEffect, useState } from 'react';
import { isoDate } from '../components/report-scope';
import type { SnapshotPreset, SnapshotRange } from '../types';

const STORAGE_KEY = 'reports.snapshot.period';

export const SNAPSHOT_PRESETS: SnapshotPreset[] = ['7d', '30d', '90d'];

const DEFAULT_RANGE: SnapshotRange = { period: '30d' };

/** The old switch's calendar periods → the preset closest in length. */
const LEGACY: Record<string, SnapshotPreset> = { month: '30d', quarter: '90d', year: '90d' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isPreset = (value: unknown): value is SnapshotPreset => typeof value === 'string' && (SNAPSHOT_PRESETS as string[]).includes(value);

/** A custom range the API takes: two dates, in order, not past today. */
export function isValidCustomRange(from: unknown, to: unknown): boolean {
    return typeof from === 'string' && typeof to === 'string' && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to && to <= isoDate(new Date());
}

function load(): SnapshotRange {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_RANGE;
        if (isPreset(raw)) return { period: raw };
        if (LEGACY[raw]) return { period: LEGACY[raw] };
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const { period, from, to } = parsed as Record<string, unknown>;
            if (isPreset(period)) return { period };
            if (period === 'custom' && isValidCustomRange(from, to)) return { period, from: from as string, to: to as string };
        }
    } catch {
        // Storage blocked or a value that is not JSON — fall through to the default.
    }
    return DEFAULT_RANGE;
}

export function useSnapshotRange(): [SnapshotRange, (range: SnapshotRange) => void] {
    const [range, setRange] = useState<SnapshotRange>(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
        } catch {
            // Storage blocked — the period still holds for this visit.
        }
    }, [range]);

    return [range, setRange];
}
