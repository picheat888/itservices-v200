// Tiny charts at the right of a summary tile's footer: seats by month (line), a count per group (columns).
import { useT } from '@/lang';
import { InfoPopover, NoteRow } from '@/shared/components/info-popover';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { SummaryChart } from '../types';
import { monthLabel } from './chart-parts';
import { FILL } from './chart-tones';

type Line = Extract<SummaryChart, { kind: 'line' }>;
type Columns = Extract<SummaryChart, { kind: 'columns' }>;

export function TileChart({ chart, title, lineClass }: { chart: SummaryChart; title: string; lineClass: string }) {
    if (chart.kind === 'line') return <LineChart chart={chart} title={title} className={lineClass} />;
    return <ColumnChart chart={chart} title={title} />;
}

const Dot = ({ className }: { className: string }) => <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} />;

// Line — the last point is this month so far
const W = 70;
const H = 20;

function LineChart({ chart, title, className }: { chart: Line; title: string; className: string }) {
    const lang = useUiStore((s) => s.lang);
    const { points, months } = chart;
    if (points.length < 2) return null;
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const x = (i: number) => 2 + (i * (W - 4)) / (points.length - 1);
    const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
    const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const last = points.length - 1;
    const count = (n: number) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');

    return (
        <InfoPopover
            label={`${title}: ${months.map((m, i) => `${monthLabel(m, lang, true)} ${count(points[i])}`).join(', ')}`}
            className="block shrink-0 cursor-pointer"
            content={
                <div className="min-w-40 space-y-1">
                    <div className="font-semibold">{title}</div>
                    {months.map((m, i) => (
                        <NoteRow
                            key={m}
                            mark={<Dot className={FILL['soft-blue']} />}
                            text={monthLabel(m, lang, true, true)}
                            value={count(points[i])}
                        />
                    ))}
                </div>
            }
        >
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cn('block', className)} aria-hidden="true">
                <path d={`${line} L${x(last).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`} fill="currentColor" fillOpacity={0.12} />
                <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
                <circle cx={x(last)} cy={y(points[last])} r={2.4} fill="currentColor" />
            </svg>
        </InfoPopover>
    );
}

// Columns — a count per group, on the largest group's scale
function ColumnChart({ chart, title }: { chart: Columns; title: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { items } = chart;
    const max = Math.max(1, ...items.map((c) => c.value));
    const count = (n: number) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');

    return (
        <InfoPopover
            label={`${title}: ${items.map((c) => `${t(c.label_key)} ${count(c.value)}`).join(', ')}`}
            className="flex h-5 shrink-0 cursor-pointer items-end gap-[3px]"
            content={
                <div className="min-w-44 space-y-1">
                    <div className="font-semibold">{title}</div>
                    {items.map((c) => (
                        <NoteRow
                            key={c.key}
                            mark={<Dot className={FILL[c.tone]} />}
                            text={t(c.label_key)}
                            value={count(c.value)}
                            muted={c.value === 0}
                        />
                    ))}
                </div>
            }
        >
            {items.map((c) => (
                <span
                    key={c.key}
                    className={cn('block w-2 rounded-t-[2px]', c.value > 0 ? FILL[c.tone] : 'bg-muted-foreground/30 h-0.5')}
                    style={c.value > 0 ? { height: `${Math.max(20, (c.value / max) * 100)}%` } : undefined}
                />
            ))}
        </InfoPopover>
    );
}
