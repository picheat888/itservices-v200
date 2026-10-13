/**
 * Weekly opened (brand) vs closed (green) bars with the "ค้างสะสม" line on its own right-hand scale.
 * Each pair is one week, labelled with the days it counts and the month when it changes; weeks not started yet are shaded.
 * Hand-rolled SVG, 640 units wide, growing taller to fill the height its parent gives it.
 */
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useLayoutEffect, useRef, useState } from 'react';
import type { TicketOverviewSummary } from '../types';
import { fitAxisFont, labelStep, weekDays } from './axis-labels';

const W = 640;
/** The shortest the drawing gets — its own shape when there is no extra height to fill. */
const MIN_H = 240;
const PAD = { l: 34, r: 40, t: 14, b: 36 };

/** Axis top rounded up to a multiple of 2×step, so the middle tick is a whole number too. */
export function niceMax(value: number): number {
    const step = value <= 10 ? 2 : value <= 50 ? 10 : value <= 200 ? 25 : 100;
    const unit = step * 2;
    return Math.max(unit, Math.ceil(value / unit) * unit);
}

/** Rough width of one character of the 10.5px axis text, in chart units. */
const CHAR_WIDTH = 6.4;

type ChartProps = { weeks: TicketOverviewSummary['weekly']; range: TicketOverviewSummary['range'] };

export function WeeklyTicketChart({ weeks, range }: ChartProps) {
    const t = useT();
    const empty = weeks.length === 0 || weeks.every((w) => w.opened === 0 && w.closed === 0 && !w.backlog);
    if (empty) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('rep_weekly_empty')}</div>;
    }

    return <WeeklyBars weeks={weeks} range={range} />;
}

/** The drawing itself — only mounted with something to draw, so its box is always there to measure. */
function WeeklyBars({ weeks, range }: ChartProps) {
    const t = useT();
    const { dayMonth, month } = useDateFormat();
    const box = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // Weeks not started yet carry no backlog; they come last.
    const startedCount = weeks.filter((w) => w.backlog !== null).length;
    const started = weeks.slice(0, startedCount);
    const peak = Math.max(0, ...weeks.flatMap((w) => [w.opened, w.closed]));
    const backlogPeak = Math.max(0, ...started.map((w) => w.backlog ?? 0));

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
    const edgeX = (edge: number) => PAD.l + gw * edge;

    // Axis labels: the days each week counts, shrunk to fit the slots, skipping weeks only below the smallest font.
    const spans = weeks.map((w) => weekDays(w.week_start, range.from, range.to));
    const dayLabels = spans.map((s) => s.days);
    const axisFont = fitAxisFont(dayLabels, gw);
    const labelEvery = labelStep(dayLabels, gw, axisFont);
    const labelled = spans.map((_, i) => i).filter((i) => i % labelEvery === 0);
    const axisY = PAD.t + ch + 6 + axisFont;

    const line = started.map((w, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yBacklog(w.backlog ?? 0).toFixed(1)}`).join(' ');
    const lastIndex = startedCount - 1;
    const lastBacklog = started[lastIndex]?.backlog ?? 0;
    const futureWidth = edgeX(weeks.length) - edgeX(startedCount);
    const futureLabel = t('rep_weekly_future');

    return (
        // The box takes the height on offer (flex-1); the SVG is laid over it so it never feeds back into that height.
        <div ref={box} className="relative w-full flex-1" style={{ minHeight: size ? (size.width * MIN_H) / W : undefined }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={t('rep_weekly_title')}>
                {/* Weeks not started yet */}
                {futureWidth > 0 && (
                    <g>
                        <rect x={edgeX(startedCount)} y={PAD.t} width={futureWidth} height={ch} className="fill-muted" />
                        {futureWidth >= futureLabel.length * CHAR_WIDTH + 8 && (
                            <text
                                x={edgeX(startedCount) + futureWidth / 2}
                                y={PAD.t + 14}
                                textAnchor="middle"
                                className="fill-muted-foreground text-[10.5px]"
                            >
                                {futureLabel}
                            </text>
                        )}
                    </g>
                )}
                {minorTicks.map((v) => (
                    <line
                        key={`minor-${v}`}
                        x1={PAD.l}
                        x2={W - PAD.r}
                        y1={y(v)}
                        y2={y(v)}
                        className="stroke-border"
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
                {started.map((w, i) => {
                    const x = xOf(i);
                    const { start, end } = spans[i];
                    const span = start === end ? dayMonth(start) : `${dayMonth(start)}–${dayMonth(end)}`;
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
                            <rect
                                x={x - bw - 1}
                                y={y(w.opened)}
                                width={bw}
                                height={ch - (y(w.opened) - PAD.t)}
                                rx={2.5}
                                className="fill-chart-soft-blue"
                            />
                            <rect x={x + 1} y={y(w.closed)} width={bw} height={ch - (y(w.closed) - PAD.t)} rx={2.5} className="fill-emerald-400" />
                        </g>
                    );
                })}
                {/* Week days, month under the first week and wherever it changes */}
                {labelled.map((i, n) => {
                    const startMonth = spans[i].start.slice(0, 7);
                    const showMonth = n === 0 || startMonth !== spans[labelled[n - 1]].start.slice(0, 7);
                    return (
                        <g key={`axis-${i}`} className="fill-muted-foreground font-mono" fontSize={axisFont}>
                            <text x={xOf(i)} y={axisY} textAnchor="middle">
                                {spans[i].days}
                            </text>
                            {showMonth && (
                                <text x={xOf(i)} y={axisY + axisFont * 1.35} textAnchor="middle">
                                    {month(spans[i].start)}
                                </text>
                            )}
                        </g>
                    );
                })}
                {startedCount > 0 && (
                    <>
                        <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" className="pointer-events-none stroke-red-400" />
                        <circle
                            cx={xOf(lastIndex)}
                            cy={yBacklog(lastBacklog)}
                            r={4}
                            strokeWidth={2}
                            className="stroke-card pointer-events-none fill-red-400"
                        />
                        <text
                            x={xOf(lastIndex) - 8}
                            // Under the point when it sits at the top, so the label is never clipped.
                            y={yBacklog(lastBacklog) < PAD.t + 16 ? yBacklog(lastBacklog) + 18 : yBacklog(lastBacklog) - 9}
                            textAnchor="end"
                            className="fill-foreground pointer-events-none font-mono text-[11px] font-bold"
                        >
                            {t('rep_weekly_backlog_end').replace('{n}', String(lastBacklog))}
                        </text>
                    </>
                )}
            </svg>
        </div>
    );
}
