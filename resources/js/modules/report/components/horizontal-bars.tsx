/**
 * Labelled horizontal bars (category counts, SLA % by priority). An optional `goal` draws a
 * marker line at that value. Widths are data-driven, hence the style prop.
 */
export interface HBar {
    key: string;
    label: string;
    value: number | null;
    /** Tailwind bg class for the fill. */
    tone?: string;
}

export function HorizontalBars({ bars, max, unit = '', goal, emptyLabel }: { bars: HBar[]; max: number; unit?: string; goal?: number; emptyLabel: string }) {
    if (bars.length === 0) return <div className="text-muted-foreground py-6 text-center text-sm">{emptyLabel}</div>;
    const pct = (v: number) => `${Math.min(100, (v / Math.max(max, 1)) * 100)}%`;

    return (
        <div className="space-y-2.5 px-5 py-4">
            {bars.map((b) => (
                <div key={b.key} className="grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-2.5 text-sm">
                    <span className="truncate">{b.label}</span>
                    <div className="bg-muted relative h-2.5 overflow-hidden rounded-full">
                        {b.value !== null && <span className={`block h-full rounded-full ${b.tone ?? 'bg-brand'}`} style={{ width: pct(b.value) }} />}
                        {goal !== undefined && <em className="bg-foreground/50 absolute -top-0.5 -bottom-0.5 w-0.5" style={{ left: pct(goal) }} />}
                    </div>
                    <span className="text-right font-mono text-xs font-bold">{b.value === null ? '—' : `${b.value}${unit}`}</span>
                </div>
            ))}
        </div>
    );
}
