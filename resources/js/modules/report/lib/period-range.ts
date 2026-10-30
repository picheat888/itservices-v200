// The dates a Report Center period covers, as the server works them out (pure, node tests).

/** Days each preset period looks back over, today included — ReportSnapshotService::PRESET_DAYS. */
const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

/** A local date as "YYYY-MM-DD". */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The dates a Report Center period covers, worked out as ReportSnapshotService::range does:
 * a preset counts back from today (7 days = today and the six before it); custom is the
 * reader's own from / to. Local dates, so a link from the hub opens a report on the very days
 * its tiles count.
 */
export function periodRange(
    range: { period: '7d' | '30d' | '90d' } | { period: 'custom'; from: string; to: string },
    today = new Date(),
): { from: string; to: string } {
    if (range.period === 'custom') return { from: range.from, to: range.to };
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PRESET_DAYS[range.period] - 1));

    return { from: isoDate(start), to: isoDate(today) };
}
