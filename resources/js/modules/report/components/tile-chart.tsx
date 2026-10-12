// Small charts beside a summary tile's value: seats by month (line), one block per item, a count per group (columns).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { SummaryChart } from '../types';
import { monthLabel } from './chart-parts';
import { FILL, TEXT } from './chart-tones';
import { InfoPopover } from './info-popover';

type Line = Extract<SummaryChart, { kind: 'line' }>;
type Blocks = Extract<SummaryChart, { kind: 'blocks' }>;
type Columns = Extract<SummaryChart, { kind: 'columns' }>;

export function TileChart({ chart, title }: { chart: SummaryChart; title: string }) {
    if (chart.kind === 'line') return <LineChart chart={chart} title={title} />;
    if (chart.kind === 'blocks') return <BlockChart chart={chart} title={title} />;
    return <ColumnChart chart={chart} title={title} />;
}

/** One row of a chart's note: a mark, the words, the number on the right. */
function NoteRow({ mark, text, value, muted }: { mark?: React.ReactNode; text: React.ReactNode; value: string; muted?: boolean }) {
    return (
        <div className={cn('flex items-center justify-between gap-4', muted && 'text-muted-foreground')}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
                {mark}
                <span className="truncate">{text}</span>
            </span>
            <b className={cn('font-mono tabular-nums', muted && 'font-normal')}>{value}</b>
        </div>
    );
}

const Dot = ({ className }: { className: string }) => <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} />;

// Line — the last point is this month so far
const W = 132;
const H = 40;

function LineChart({ chart, title }: { chart: Line; title: string }) {
    const lang = useUiStore((s) => s.lang);
    const { points, months } = chart;
    if (points.length < 2) return null;
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const x = (i: number) => 4 + (i * (W - 8)) / (points.length - 1);
    const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 14);
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
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cn('block', TEXT['soft-blue'])} aria-hidden="true">
                <path d={`${line} L${x(last).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`} fill="currentColor" fillOpacity={0.14} />
                <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.map((v, i) => (
                    <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 3.2 : 1.8} fill="currentColor" />
                ))}
            </svg>
        </InfoPopover>
    );
}

// Blocks — one per item, coloured by its state
function BlockChart({ chart, title }: { chart: Blocks; title: string }) {
    const t = useT();
    const { items } = chart;
    if (items.length === 0) return null;
    const small = items.length > 16;

    return (
        <InfoPopover
            label={`${title}: ${items.map((b) => `${b.name} ${b.used}/${b.seats} ${t(b.label_key)}`).join(', ')}`}
            className="flex max-w-36 shrink-0 cursor-pointer flex-wrap content-end justify-end gap-1 self-stretch"
            content={
                <div className="min-w-52 space-y-1">
                    <div className="font-semibold">{title}</div>
                    {items.map((b) => (
                        <NoteRow
                            key={b.key}
                            mark={<Dot className={FILL[b.tone]} />}
                            text={
                                <>
                                    {b.name} <span className="text-muted-foreground">{t(b.label_key)}</span>
                                </>
                            }
                            value={`${b.used}/${b.seats}`}
                        />
                    ))}
                </div>
            }
        >
            {items.map((b) => (
                <span key={b.key} className={cn('block rounded-[3px]', small ? 'h-2.5 w-2.5' : 'h-4 w-4', FILL[b.tone])} />
            ))}
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
            className="flex shrink-0 cursor-pointer items-end gap-1.5"
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
                <span key={c.key} className="flex w-8 flex-col items-center gap-0.5">
                    <span className="flex h-7 w-4 items-end">
                        <span
                            className={cn('block w-full rounded-t-[3px]', c.value > 0 ? FILL[c.tone] : 'bg-muted h-0.5')}
                            style={c.value > 0 ? { height: `${Math.max(12, (c.value / max) * 100)}%` } : undefined}
                        />
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] leading-none whitespace-nowrap tabular-nums">{c.short}</span>
                </span>
            ))}
        </InfoPopover>
    );
}
