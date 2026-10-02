/**
 * Paired weekly bars — opened (brand) vs closed (green) — on one shared scale with a faint
 * grid (labelled lines at 0, half and top, dashed unlabelled guides between them), plus the "ค้างสะสม" line (red, its own scale on the right axis): tickets still open at
 * each week's end, labelled at its last point. Every bar is labelled by the first day it really
 * covers — the range start for a week that began before it, else the Monday — and thinned only
 * past 16 weeks; its <title> gives the days it spans and its three numbers. Hand-rolled SVG like shared/components/month-bar-chart.tsx: a dozen bars need no
 * chart library, and colours come from theme classes so both themes work.
 *
 * The chart fills the height its parent gives it (flex-1): the drawing stays 640 units wide, so
 * text keeps its size, and the viewBox grows taller to match the box — the card beside it on the
 * Ticket & SLA page sets that height. With nothing to fill it keeps its own 640×240 shape.
 */
import { useT } from '@/lang';
import { useLayoutEffect, useRef, useState } from 'react';
import type { TicketOverviewSummary } from '../types';

const W = 640;
/** The shortest the drawing gets — its own shape when there is no extra height to fill. */
const MIN_H = 240;
const PAD = { l: 34, r: 40, t: 14, b: 28 };

/**
 * Round the axis top up to a tidy step so every tick label is a value the chart reaches.
 * Rounds to a multiple of 2*step (not just step) so the middle tick, `max / 2`, always lands
 * on a whole step too — ticket counts are integers, so a tick like 62.5 would be wrong.
 */
function niceMax(value: number): number {
    const step = value <= 10 ? 2 : value <= 50 ? 10 : value <= 200 ? 25 : 100;
    const unit = step * 2;
    return Math.max(unit, Math.ceil(value / unit) * unit);
}

/** "YYYY-MM-DD" → "d/m". */
const dayMonth = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${Number(d)}/${Number(m)}`;
};

/** The Sunday ending the week that starts on `iso` (a Monday), as "YYYY-MM-DD". */
const weekEnd = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const end = new Date(y, m - 1, d + 6);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
};

/** Every bar keeps its label up to this many weeks; past it they thin out evenly. */
const MAX_LABELS = 16;

type ChartProps = { weeks: TicketOverviewSummary['weekly']; range: TicketOverviewSummary['range'] };

export function WeeklyTicketChart({ weeks, range }: ChartProps) {
    const t = useT();
    const empty = weeks.length === 0 || weeks.every((w) => w.opened === 0 && w.closed === 0 && w.backlog === 0);
    if (empty) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('rep_weekly_empty')}</div>;
    }

    return <WeeklyBars weeks={weeks} range={range} />;
}

/** The drawing itself — only mounted with something to draw, so its box is always there to measure. */
function WeeklyBars({ weeks, range }: ChartProps) {
    const t = useT();
    const box = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const peak = Math.max(0, ...weeks.flatMap((w) => [w.opened, w.closed]));
    const backlogPeak = Math.max(0, ...weeks.map((w) => w.backlog));

    // As tall as the box allows at 640 units wide, never shorter than the chart's own shape.
    const H = size && size.width > 0 ? Math.max(MIN_H, Math.round((W * size.height) / size.width)) : MIN_H;
    const max = niceMax(peak);
    const backlogMax = niceMax(backlogPeak);
    const ticks = [0, max / 2, max];
    /** Faint unlabelled guides halfway between the labelled ones, so a bar's height reads closer. */
    const minorTicks = [max / 4, (max * 3) / 4];
    const cw = W - PAD.l - PAD.r;
    const ch = H - PAD.t - PAD.b;
    const gw = cw / weeks.length;
    const bw = Math.min(14, gw * 0.32);
    const y = (v: number) => PAD.t + ch - (v / max) * ch;
    const yBacklog = (v: number) => PAD.t + ch - (v / backlogMax) * ch;
    const xOf = (i: number) => PAD.l + gw * i + gw / 2;
    const labelEvery = Math.ceil(weeks.length / MAX_LABELS);

    const line = weeks.map((w, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yBacklog(w.backlog).toFixed(1)}`).join(' ');
    const last = weeks[weeks.length - 1];

    return (
        // The box takes the height on offer (flex-1) and at least the chart's own shape; the SVG is
        // laid over it, so its drawing never feeds back into the height it is measured from.
        <div ref={box} className="relative w-full flex-1" style={{ minHeight: size ? (size.width * MIN_H) / W : undefined }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={t('rep_weekly_title')}>
                {minorTicks.map((v) => (
                    <line
                        key={`minor-${v}`}
                        x1={PAD.l}
                        x2={W - PAD.r}
                        y1={y(v)}
                        y2={y(v)}
                        className="stroke-border"
                        strokeOpacity={0.5}
                        strokeDasharray="3 4"
                        strokeWidth={1}
                    />
                ))}
                {ticks.map((v, i) => (
                    <g key={v}>
                        <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                        <text x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[10.5px]">
                            {v}
                        </text>
                        {/* Right axis: the backlog line's own scale, same three gridlines. */}
                        <text x={W - PAD.r + 8} y={y(v) + 3.5} className="fill-red-500 font-mono text-[10.5px]">
                            {(backlogMax / 2) * i}
                        </text>
                    </g>
                ))}
                {weeks.map((w, i) => {
                    const x = xOf(i);
                    // The days this bar really counts: the first and last weeks are cut by the range.
                    const start = w.week_start < range.from ? range.from : w.week_start;
                    const end = weekEnd(w.week_start) > range.to ? range.to : weekEnd(w.week_start);
                    const label = dayMonth(start);
                    const span = start === end ? label : `${label}–${dayMonth(end)}`;
                    return (
                        <g key={w.week_start}>
                            <title>
                                {t('rep_weekly_tip')
                                    .replace('{week}', span)
                                    .replace('{opened}', String(w.opened))
                                    .replace('{closed}', String(w.closed))
                                    .replace('{backlog}', String(w.backlog))}
                            </title>
                            {/* The whole week column answers the hover, not just its bars. */}
                            <rect x={x - gw / 2} y={PAD.t} width={gw} height={ch} className="fill-transparent" />
                            <rect x={x - bw - 1} y={y(w.opened)} width={bw} height={ch - (y(w.opened) - PAD.t)} rx={2.5} className="fill-brand" />
                            <rect x={x + 1} y={y(w.closed)} width={bw} height={ch - (y(w.closed) - PAD.t)} rx={2.5} className="fill-emerald-500" />
                            {i % labelEvery === 0 && (
                                <text x={x} y={H - 9} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">
                                    {label}
                                </text>
                            )}
                        </g>
                    );
                })}
                <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" className="pointer-events-none stroke-red-500" />
                <circle
                    cx={xOf(weeks.length - 1)}
                    cy={yBacklog(last.backlog)}
                    r={4}
                    strokeWidth={2}
                    className="stroke-card pointer-events-none fill-red-500"
                />
                <text
                    x={xOf(weeks.length - 1) - 8}
                    // Under the point when it sits at the top, so the label is never clipped.
                    y={yBacklog(last.backlog) < PAD.t + 16 ? yBacklog(last.backlog) + 18 : yBacklog(last.backlog) - 9}
                    textAnchor="end"
                    className="fill-foreground pointer-events-none font-mono text-[11px] font-bold"
                >
                    {t('rep_weekly_backlog_end').replace('{n}', String(last.backlog))}
                </text>
            </svg>
        </div>
    );
}
