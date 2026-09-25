/**
 * Paired weekly bars — opened (brand) vs closed (green) — on one shared scale with a faint
 * grid. Hand-rolled SVG like shared/components/month-bar-chart.tsx: a dozen bars need no
 * chart library, and colours come from theme classes so both themes work.
 */
import { useT } from '@/lang';
import type { TicketOverviewSummary } from '../types';

const W = 640;
const H = 240;
const PAD = { l: 34, r: 12, t: 12, b: 28 };

/** Round the axis top up to a tidy step so every tick label is a value the chart reaches. */
function niceMax(value: number): number {
    const step = value <= 10 ? 2 : value <= 50 ? 10 : value <= 200 ? 25 : 100;
    return Math.max(step, Math.ceil(value / step) * step);
}

export function WeeklyTicketChart({ weeks }: { weeks: TicketOverviewSummary['weekly'] }) {
    const t = useT();
    const peak = Math.max(0, ...weeks.flatMap((w) => [w.opened, w.closed]));
    if (weeks.length === 0 || peak === 0) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('rep_weekly_empty')}</div>;
    }

    const max = niceMax(peak);
    const ticks = [0, max / 2, max];
    const cw = W - PAD.l - PAD.r;
    const ch = H - PAD.t - PAD.b;
    const gw = cw / weeks.length;
    const bw = Math.min(14, gw * 0.32);
    const y = (v: number) => PAD.t + ch - (v / max) * ch;
    const labelEvery = Math.ceil(weeks.length / 7);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('rep_weekly_title')}>
            {ticks.map((v) => (
                <g key={v}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                    <text x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[10.5px]">
                        {v}
                    </text>
                </g>
            ))}
            {weeks.map((w, i) => {
                const x = PAD.l + gw * i + gw / 2;
                const [, m, d] = w.week_start.split('-');
                return (
                    <g key={w.week_start}>
                        <rect x={x - bw - 1} y={y(w.opened)} width={bw} height={ch - (y(w.opened) - PAD.t)} rx={2.5} className="fill-brand" />
                        <rect x={x + 1} y={y(w.closed)} width={bw} height={ch - (y(w.closed) - PAD.t)} rx={2.5} className="fill-emerald-500" />
                        {i % labelEvery === 0 && (
                            <text x={x} y={H - 9} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">
                                {`${Number(d)}/${Number(m)}`}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
