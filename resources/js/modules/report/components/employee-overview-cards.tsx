// "ภาพรวมพนักงาน" report cards: the รายการ segment, headcount line, departments with their sections, leavers still holding access, and the list's cells (data: useEmployeeOverviewBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useEmployeeOverviewBreakdown } from '../hooks/use-reports';
import type { AccessType, EmployeeOverviewBreakdown, EmployeeOverviewCounts, TabularFilters } from '../types';
import { ACCESS_TYPES, DaysOut, Group, GroupRow, NUM, Segments, TD, TH, TypeDot, TypeLabel } from './access-overview-cards';
import { count, deptName } from './access-parts';
import { CardEmpty, CardTitle } from './chart-parts';
import { InfoPopover } from './info-popover';
import { BASIS_PCT, pct } from './percent-classes';
import { CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Patch = (next: TabularFilters) => void;
type Point = EmployeeOverviewBreakdown['points'][number];
type Named = { name: string | null; name_th: string | null } | null;

const nameOf = (v: Named | undefined, lang: string) => (v ? (lang === 'th' && v.name_th) || v.name : null);

/* ─────────────────────────── รายการ segment ─────────────────────────── */

/** ทั้งหมด / เข้าใหม่ / ลาออก on the list's heading — narrows only the list. */
export function KindSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useEmployeeOverviewBreakdown(filters);
    const joined = data ? data.joiners.started + data.joiners.upcoming : null;
    const left = data ? data.leavers.count : null;
    return (
        <Segments
            label={t('rep_fl_kind')}
            options={[
                { value: null as string | null, label: t('rep_eo_kind_all'), count: joined !== null && left !== null ? joined + left : null },
                { value: 'joined', label: t('rep_kind_joined'), count: joined },
                { value: 'left', label: t('rep_kind_left'), count: left },
            ]}
            value={(filters.kind as string | null | undefined) ?? null}
            onChange={(kind) => patch({ kind })}
        />
    );
}

/* ─────────────────────────── headcount line ─────────────────────────── */

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
const niceStep = (span: number) => STEPS.find((s) => span / s <= 4) ?? 1000;

/** A bucket's short label under the axis and its long name in notes. */
function useBucketLabels(bucket: EmployeeOverviewBreakdown['bucket']) {
    const t = useT();
    const fmt = useDateFormat();
    return (p: Point) => {
        const month = p.start.slice(0, 7);
        const year = fmt.year(Number(p.start.slice(0, 4)));
        const quarter = Math.floor((Number(p.start.slice(5, 7)) - 1) / 3) + 1;
        if (bucket === 'quarter')
            return {
                short: t('rep_eo_quarter_short').replace('{q}', String(quarter)),
                year: year.slice(-2),
                long: t('rep_eo_quarter').replace('{q}', String(quarter)).replace('{y}', year),
            };
        if (bucket === 'year') return { short: year, year: '', long: t('rep_eo_year').replace('{y}', year) };
        return { short: fmt.month(month), year: year.slice(-2), long: fmt.monthYearLong(month) };
    };
}

/** Who joined or left in a bucket: up to six names with their day, then "และอีก N คน". */
function Names({ events }: { events: Point['events'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const shown = events.slice(0, 6);
    return (
        <span>
            {shown.map((e, i) => (
                <span key={`${e.kind}-${e.id}`}>
                    {i > 0 && ', '}
                    <span translate="no">{nameOf(e, lang)}</span>{' '}
                    <small className="text-muted-foreground">
                        {t(e.kind === 'joined' ? 'rep_eo_pop_started' : 'rep_eo_pop_last_day').replace('{date}', fmt.date(e.date))}
                    </small>
                </span>
            ))}
            {events.length > 6 && <> {t('rep_eo_pop_more').replace('{n}', count(events.length - 6, lang))}</>}
        </span>
    );
}

/** One point's note: headcount at its end, the change since the bucket started, who joined and who left. */
function PointNote({ point, title, unit }: { point: Point; title: string; unit: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const change = point.headcount - point.base;
    const ins = point.events.filter((e) => e.kind === 'joined');
    const outs = point.events.filter((e) => e.kind === 'left');
    const row = (label: string, value: React.ReactNode) => (
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono tabular-nums">{value}</span>
        </div>
    );
    return (
        <div className="max-w-72 min-w-56 space-y-1">
            <div className="font-semibold">{point.current ? t('rep_eo_pop_to_today').replace('{when}', title) : title}</div>
            {row(
                point.current ? t('rep_eo_pop_working_today') : t('rep_eo_pop_working_end').replace('{unit}', unit),
                <>
                    {t('rep_eo_people_n').replace('{n}', count(point.headcount, lang))}{' '}
                    <small className="text-muted-foreground">
                        {change === 0
                            ? t('rep_eo_pop_same').replace('{unit}', unit)
                            : t('rep_eo_pop_change')
                                  .replace('{sign}', change > 0 ? '+' : '−')
                                  .replace('{n}', count(Math.abs(change), lang))
                                  .replace('{unit}', unit)}
                    </small>
                </>,
            )}
            {row(
                t('rep_kind_joined'),
                ins.length ? (
                    <span className="text-emerald-700 dark:text-emerald-400">{t('rep_eo_people_n').replace('{n}', count(ins.length, lang))}</span>
                ) : (
                    <span className="text-muted-foreground">0</span>
                ),
            )}
            {row(
                t('rep_kind_left'),
                outs.length ? (
                    <span className="text-red-700 dark:text-red-400">{t('rep_eo_people_n').replace('{n}', count(outs.length, lang))}</span>
                ) : (
                    <span className="text-muted-foreground">0</span>
                ),
            )}
            {ins.length > 0 && (
                <div className="border-border border-t pt-1">
                    <StatusBadge tone="green">{t('rep_eo_pop_in')}</StatusBadge> <Names events={ins} />
                </div>
            )}
            {outs.length > 0 && (
                <div className="border-border border-t pt-1">
                    <StatusBadge tone="amber">{t('rep_eo_pop_out')}</StatusBadge> <Names events={outs} />
                </div>
            )}
            {outs.some((e) => e.before_start) && (
                <div className="border-border border-t pt-1 text-amber-700 dark:text-amber-400">{t('rep_eo_pop_before_start')}</div>
            )}
        </div>
    );
}

/** Measured width of an element, kept current as the card resizes. */
function useWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return { ref, width };
}

function HeadcountCard({ data }: { data: EmployeeOverviewBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const labelOf = useBucketLabels(data.bucket);
    const { ref, width } = useWidth<HTMLDivElement>();
    const dots = useRef<(SVGCircleElement | null)[]>([]);
    const points = data.points;
    const unit = t(`rep_eo_unit_${data.bucket}`);
    const clipped = points.some((p) => p.current);
    const joinedTotal = points.reduce((s, p) => s + p.joined, 0);
    const leftTotal = points.reduce((s, p) => s + p.left, 0);
    const empty = points.length === 0 || (points.every((p) => p.headcount === 0) && joinedTotal + leftTotal === 0);

    const info = [
        t('rep_eo_flow_info_count').replace('{unit}', unit) + (clipped ? ` ${t('rep_eo_flow_info_today')}` : ''),
        t('rep_eo_flow_info_leaver'),
        t('rep_eo_flow_info_tap'),
    ];
    // Leavers whose last day is the chart's last day or later are not off the line yet.
    const pending = data.leavers.count - leftTotal;
    if (pending > 0) info.push(t('rep_eo_flow_info_pending').replace('{n}', count(pending, lang)));
    const legend = (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="inline-block h-0.5 w-4 rounded bg-blue-600 dark:bg-blue-400" />
                {t('rep_eo_flow_working')}
            </span>
            <span>
                <b className="text-emerald-700 dark:text-emerald-400">+</b>
                {t('rep_eo_flow_in')} <b className="text-foreground font-mono">{count(joinedTotal, lang)}</b>
            </span>
            <span>
                <b className="text-red-700 dark:text-red-400">−</b>
                {t('rep_eo_flow_out')} <b className="text-foreground font-mono">{count(leftTotal, lang)}</b>
            </span>
        </span>
    );

    if (points.length === 0 || empty) {
        return (
            <Card className="overflow-clip">
                <CardTitle title={t('rep_eo_flow_title')} info={info} />
                <CardEmpty>
                    <span className="flex flex-col gap-1">
                        <span className="text-foreground font-medium">{t(points.length === 0 ? 'rep_eo_flow_not_yet' : 'rep_eo_flow_empty')}</span>
                        <span className="text-xs">{t(points.length === 0 ? 'rep_eo_flow_not_yet_sub' : 'rep_eo_flow_empty_sub')}</span>
                    </span>
                </CardEmpty>
            </Card>
        );
    }

    const when = (p: Point) => (p.current ? t('rep_eo_today') : labelOf(p).long);
    const values = points.map((p) => p.headcount);
    const lo = values.indexOf(Math.min(...values));
    const hi = values.indexOf(Math.max(...values));
    const note =
        values[lo] === values[hi]
            ? t('rep_eo_flow_flat').replace('{n}', count(values[lo], lang))
            : t('rep_eo_flow_range')
                  .replace('{lo}', count(values[lo], lang))
                  .replace('{lo_when}', when(points[lo]))
                  .replace('{hi}', count(values[hi], lang))
                  .replace('{hi_when}', when(points[hi]));
    const summary = `${points.map((p) => `${when(p)} ${t('rep_eo_people_n').replace('{n}', count(p.headcount, lang))}`).join(', ')}. ${note}`;

    // Layout as the mockup: margins, a slot per bucket, the axis starting near the lowest value.
    const W = Math.max(260, width);
    const narrow = W < 520;
    const ml = narrow ? 34 : 42;
    const mr = 16;
    const slot = (W - ml - mr) / points.length;
    const top = 40;
    const bot = narrow ? 180 : 220;
    const H = bot + 40;
    const vmin = values[lo];
    const vmax = values[hi];
    const pad = Math.max(1, Math.round((vmax - vmin) * 0.2));
    const step = niceStep(vmax + pad - Math.max(0, vmin - pad));
    const ylo = Math.floor(Math.max(0, vmin - pad) / step) * step;
    let yhi = Math.ceil((vmax + pad) / step) * step;
    if (yhi === ylo) yhi = ylo + step;
    const xs = (i: number) => ml + (i + 0.5) * slot;
    const ys = (v: number) => bot - ((v - ylo) / (yhi - ylo)) * (bot - top);
    const ticks: number[] = [];
    for (let v = ylo; v <= yhi; v += step) ticks.push(v);
    const labelEvery = Math.max(1, Math.ceil(30 / slot));

    // Point labels: the headcount with in/out beside it; one that would run into its neighbour flips side or is left to the note.
    const edge = { above: -1e9, below: -1e9 };
    const labels = points.map((p, j) => {
        const v = p.headcount;
        const prev = j > 0 ? values[j - 1] : null;
        const next = j < points.length - 1 ? values[j + 1] : null;
        const moved = p.joined > 0 || p.left > 0;
        if (slot < 44 && !(j === 0 || j === points.length - 1 || p.current || moved || v !== prev)) return null;
        let below = prev !== null && (v < prev || (v === prev && next !== null && next > v));
        const cx = xs(j);
        const anchor: 'start' | 'middle' | 'end' = cx > W - mr - 40 ? 'end' : cx < ml + 30 ? 'start' : 'middle';
        const lw = Math.max(
            (p.current ? 42 : 0) + String(v).length * 7,
            moved ? (String(p.joined || '').length + String(p.left || '').length + 3) * 7 : 0,
        );
        const x0 = anchor === 'end' ? cx - lw : anchor === 'start' ? cx : cx - lw / 2;
        if (x0 < edge[below ? 'below' : 'above'] + 4) {
            below = !below;
            if (x0 < edge[below ? 'below' : 'above'] + 4) return null;
        }
        edge[below ? 'below' : 'above'] = x0 + lw;
        const vy = below ? ys(v) + 20 : ys(v) - (moved ? 25 : 11);
        const my = below ? vy + 14 : ys(v) - 11;
        return { j, cx, anchor, vy, my, moved };
    });

    return (
        <Card className="overflow-clip">
            <CardTitle title={t('rep_eo_flow_title')} info={info} sub={legend} />
            <div className="px-5 pt-3 pb-4">
                <p className="sr-only">{summary}</p>
                <div ref={ref} className="relative">
                    {width > 0 && (
                        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block">
                            {ticks.map((v) => (
                                <g key={v}>
                                    <path d={`M${ml} ${ys(v).toFixed(1)}H${W - mr}`} className="stroke-border" strokeDasharray="2 3" />
                                    <text x={ml - 8} y={ys(v) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
                                        {count(v, lang)}
                                    </text>
                                </g>
                            ))}
                            <text x={ml - 8} y={12} textAnchor="end" className="fill-muted-foreground text-[11px]">
                                {t('rep_eo_axis_people')}
                            </text>
                            {points.map((p, j) =>
                                j % labelEvery === 0 || p.current ? (
                                    <text
                                        key={p.start}
                                        x={xs(j)}
                                        y={bot + 18}
                                        textAnchor="middle"
                                        className={cn(
                                            'text-[11px]',
                                            p.current ? 'fill-blue-700 font-semibold dark:fill-blue-300' : 'fill-muted-foreground',
                                        )}
                                    >
                                        <tspan>{labelOf(p).short}</tspan>
                                        {labelOf(p).year && (
                                            <tspan x={xs(j)} dy={12} className="text-[10px]">
                                                {labelOf(p).year}
                                            </tspan>
                                        )}
                                    </text>
                                ) : null,
                            )}
                            {points.length > 1 && (
                                <path
                                    d={points.map((p, j) => `${j ? 'L' : 'M'}${xs(j).toFixed(1)} ${ys(p.headcount).toFixed(1)}`).join('')}
                                    className="fill-none stroke-blue-600 dark:stroke-blue-400"
                                    strokeWidth={2}
                                    strokeLinejoin="round"
                                />
                            )}
                            {points.map((p, j) => (
                                <circle
                                    key={p.start}
                                    ref={(el) => {
                                        dots.current[j] = el;
                                    }}
                                    cx={xs(j)}
                                    cy={ys(p.headcount)}
                                    r={p.current ? 5 : 3.5}
                                    className={cn(
                                        'stroke-card stroke-2',
                                        p.current ? 'fill-blue-700 dark:fill-blue-300' : 'fill-blue-600 dark:fill-blue-400',
                                    )}
                                />
                            ))}
                            {labels.map((l) => {
                                if (!l) return null;
                                const p = points[l.j];
                                return (
                                    <g key={p.start}>
                                        <text
                                            x={l.cx}
                                            y={l.vy}
                                            textAnchor={l.anchor}
                                            className={cn(
                                                'font-mono text-[12px] font-semibold',
                                                p.current ? 'fill-blue-700 dark:fill-blue-300' : 'fill-foreground',
                                            )}
                                        >
                                            {p.current ? `${t('rep_eo_today')} ` : ''}
                                            {count(p.headcount, lang)}
                                        </text>
                                        {l.moved && (
                                            <text x={l.cx} y={l.my} textAnchor={l.anchor} className="font-mono text-[11px] font-semibold">
                                                {p.joined > 0 && (
                                                    <tspan className="fill-emerald-700 dark:fill-emerald-400">+{count(p.joined, lang)}</tspan>
                                                )}
                                                {p.joined > 0 && p.left > 0 && ' '}
                                                {p.left > 0 && <tspan className="fill-red-700 dark:fill-red-400">−{count(p.left, lang)}</tspan>}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                    )}
                    {/* One column per point opens its note: hover, tap or Enter. */}
                    {width > 0 && (
                        <div className={cn('absolute top-0 right-4 bottom-10 flex', narrow ? 'left-[34px]' : 'left-[42px]')}>
                            {points.map((p, j) => (
                                <InfoPopover
                                    key={p.start}
                                    label={`${when(p)} ${t('rep_eo_people_n').replace('{n}', count(p.headcount, lang))}`}
                                    className="focus-visible:ring-brand h-full min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                                    anchor={() => dots.current[j]?.getBoundingClientRect() ?? null}
                                    content={<PointNote point={p} title={labelOf(p).long} unit={unit} />}
                                >
                                    <span className="sr-only">{when(p)}</span>
                                </InfoPopover>
                            ))}
                        </div>
                    )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{note}</p>
                {data.as_of !== data.to && clipped && (
                    <p className="text-muted-foreground text-xs">{t('rep_eo_flow_as_of').replace('{date}', fmt.date(data.as_of))}</p>
                )}
            </div>
        </Card>
    );
}

/* ─────────────────────────── departments ─────────────────────────── */

/** แผนก · ต้นช่วง · เข้า · ออก · ปลายช่วง · เปลี่ยน · สัดส่วนปลายช่วง */
const COLS = ['w-[30%]', 'w-[10%]', 'w-[9%]', 'w-[9%]', 'w-[11%]', 'w-[10%]', 'w-[21%]'];

function Cnt({ v }: { v: number }) {
    const lang = useUiStore((s) => s.lang);
    return v ? <>{count(v, lang)}</> : <span className="text-muted-foreground">0</span>;
}

function Change({ v }: { v: number }) {
    const lang = useUiStore((s) => s.lang);
    if (!v) return <span className="text-muted-foreground">0</span>;
    return (
        <span className={v > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
            {v > 0 ? '▲ +' : '▼ −'}
            {count(Math.abs(v), lang)}
        </span>
    );
}

function ShareCell({ v, total }: { v: number; total: number }) {
    const share = total ? (v / total) * 100 : 0;
    return (
        <td className={TD}>
            <span className="flex items-center gap-2">
                <span aria-hidden className="bg-muted flex h-1.5 min-w-12 flex-1 overflow-hidden rounded-full">
                    <span className={cn('bg-blue-600 dark:bg-blue-400', BASIS_PCT[pct(v, total)])} />
                </span>
                <small className="text-muted-foreground w-9 text-right font-mono tabular-nums">{total ? `${Math.round(share)}%` : '—'}</small>
            </span>
        </td>
    );
}

function Cells({ s, total }: { s: EmployeeOverviewCounts; total: number }) {
    return (
        <>
            <td className={cn(TD, NUM)}>
                <Cnt v={s.start} />
            </td>
            <td className={cn(TD, NUM)}>
                <Cnt v={s.joined} />
            </td>
            <td className={cn(TD, NUM)}>
                <Cnt v={s.left} />
            </td>
            <td className={cn(TD, NUM, 'font-semibold')}>
                <Cnt v={s.end} />
            </td>
            <td className={cn(TD, NUM)}>
                <Change v={s.end - s.start} />
            </td>
            <ShareCell v={s.end} total={total} />
        </>
    );
}

function DepartmentCard({ data, singleDepartment }: { data: EmployeeOverviewBreakdown; singleDepartment: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const total = data.total.end;
    const info = [t('rep_eo_dept_info').replace('{from}', fmt.date(data.from)).replace('{end}', fmt.date(data.as_of))];
    if (data.leavers.still_working > 0) info.push(t('rep_eo_dept_info_notice').replace('{n}', count(data.leavers.still_working, lang)));

    return (
        <Card className="flex flex-col overflow-clip lg:col-span-2 xl:col-span-3">
            <CardTitle title={t('rep_eo_dept_title')} info={info} />
            {data.departments.length === 0 && data.empty_departments.length === 0 ? (
                <CardEmpty>{t('rep_eo_dept_empty')}</CardEmpty>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] table-fixed text-sm">
                        <caption className="sr-only">{t('rep_eo_dept_caption')}</caption>
                        <colgroup>
                            {COLS.map((w, i) => (
                                <col key={i} className={w} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_eo_dept_col_name')}
                                </th>
                                {(['start', 'joined', 'left', 'end', 'change'] as const).map((k) => (
                                    <th key={k} scope="col" className={cn(TH, 'text-right')}>
                                        {t(`rep_eo_dept_col_${k}`)}
                                    </th>
                                ))}
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_eo_dept_col_share')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.departments.map((d) => {
                                const key = String(d.id ?? 'none');
                                const isOpen = open[key] ?? singleDepartment;
                                const name = nameOf(d, lang) ?? t('rep_ac_no_department');
                                return (
                                    <DeptRows
                                        key={key}
                                        name={name}
                                        unnamed={d.name === null}
                                        open={isOpen}
                                        onToggle={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                                        row={d}
                                        total={total}
                                    />
                                );
                            })}
                            {(data.departments.length > 1 || !singleDepartment) && (
                                <tr className="bg-muted/40 border-border border-t font-semibold">
                                    <th scope="row" className={cn(TD, 'text-left')}>
                                        {t('rep_eo_dept_total').replace('{n}', count(data.departments.length, lang))}
                                    </th>
                                    <Cells s={data.total} total={total} />
                                </tr>
                            )}
                            {data.empty_departments.length > 0 && (
                                <tr className="border-border text-muted-foreground border-t">
                                    <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                        {t('rep_eo_dept_apart').replace('{n}', count(data.empty_departments.length, lang))}
                                    </th>
                                    <td colSpan={6} className={cn(TD, 'text-xs')}>
                                        {data.empty_departments.map((d) => nameOf(d, lang)).join(', ')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function DeptRows({
    name,
    unnamed,
    open,
    onToggle,
    row,
    total,
}: {
    name: string;
    unnamed: boolean;
    open: boolean;
    onToggle: () => void;
    row: EmployeeOverviewBreakdown['departments'][number];
    total: number;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <>
            <tr className="border-border/60 border-b">
                <th scope="row" className={cn(TD, 'text-left font-medium', unnamed && 'text-muted-foreground font-normal')}>
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={open}
                        className="hover:text-brand focus-visible:ring-brand inline-flex max-w-full items-center gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
                        title={name}
                    >
                        <ChevronRight
                            aria-hidden
                            className={cn('h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-90')}
                        />
                        <span className="truncate">{name}</span>
                    </button>
                </th>
                <Cells s={row} total={total} />
            </tr>
            {open &&
                row.sections.map((s) => (
                    <tr key={s.id ?? 'none'} className="border-border/60 border-b text-[13px]">
                        <th scope="row" className={cn(TD, 'truncate pl-10 text-left font-normal', s.name === null && 'text-muted-foreground')}>
                            {nameOf(s, lang) ?? t('rep_eo_no_section')}
                        </th>
                        <Cells s={s} total={total} />
                    </tr>
                ))}
            {open && row.hidden_sections > 0 && (
                <tr className="border-border/60 text-muted-foreground border-b text-xs">
                    <td colSpan={7} className={cn(TD, 'pl-10')}>
                        {t('rep_eo_sections_none').replace('{n}', count(row.hidden_sections, lang))}
                    </td>
                </tr>
            )}
        </>
    );
}

/* ─────────────────────────── leavers still holding access ─────────────────────────── */

function HoldingCard({ data }: { data: EmployeeOverviewBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const { holding } = data;
    const used = ACCESS_TYPES.filter((k) => holding.by_type[k] > 0);
    const link = data.can_open_access && canOpen('/reports/access-overview') && (
        <Link
            to="/reports/access-overview"
            className="text-brand focus-visible:ring-brand rounded-sm text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
            {t('rep_eo_open_access')} <span aria-hidden>↗</span>
        </Link>
    );

    return (
        <Card className="flex flex-col overflow-clip xl:col-span-2">
            <CardTitle
                title={t('rep_eo_holding_title')}
                info={t('rep_eo_holding_info')}
                sub={
                    used.length > 0 && (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {used.map((k) => (
                                <TypeLabel key={k} type={k} />
                            ))}
                        </span>
                    )
                }
            />
            {holding.rows.length === 0 ? (
                <CardEmpty>
                    <span className="flex flex-col gap-1">
                        <span className="text-foreground font-medium">{t('rep_eo_holding_empty')}</span>
                        <span className="text-xs">
                            {holding.left_total > 0
                                ? t('rep_eo_holding_empty_done').replace('{n}', count(holding.left_total, lang))
                                : t('rep_eo_holding_empty_none')}
                        </span>
                    </span>
                </CardEmpty>
            ) : (
                <div className="flex flex-1 flex-col">
                    <Group
                        first
                        title={t('rep_eo_holding_group')}
                        total={t('rep_eo_people_n').replace('{n}', count(holding.rows.length, lang))}
                        rows={holding.rows}
                        render={(r) => (
                            <GroupRow
                                key={r.employee.id}
                                head={<PersonLink id={r.employee.id} name={nameOf(r.employee, lang) ?? r.employee.code} code={r.employee.code} />}
                                side={
                                    <span className="text-muted-foreground text-xs">
                                        <b className="text-foreground font-mono">{count(r.grants.length, lang)}</b> {t('rep_eo_grants_word')}
                                    </span>
                                }
                                sub={[deptName(r.department, lang) ?? t('rep_ac_no_department'), <DaysOut key="days" days={r.days_out} />]}
                                chips={r.grants.map((g) => (
                                    <GrantChip key={`${g.type}-${g.name}`} type={g.type} name={g.name} />
                                ))}
                            />
                        )}
                    />
                </div>
            )}
            {link && <div className="border-border mt-auto border-t px-5 py-2 text-right">{link}</div>}
        </Card>
    );
}

function GrantChip({ type, name }: { type: AccessType; name: string }) {
    const t = useT();
    return (
        <span title={t(`rep_ac_type_${type}`)} className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]">
            <TypeDot type={type} />
            <span className="sr-only">{t(`rep_ac_type_${type}`)} </span>
            <span translate="no">{name}</span>
        </span>
    );
}

/** A person's name (opening them on the Employees page) and their code. */
function PersonLink({ id, name, code }: { id: number; name: string; code: string }) {
    const canOpen = useCanOpen();
    const href = `/employees?view=${id}`;
    return (
        <>
            {canOpen(href) ? (
                <Link
                    to={href}
                    translate="no"
                    className="text-brand focus-visible:ring-brand rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {name}
                </Link>
            ) : (
                <span className="font-medium" translate="no">
                    {name}
                </span>
            )}
            <span className="text-muted-foreground ml-2 font-mono text-xs">{code}</span>
        </>
    );
}

/* ─────────────────────────── the list's cells ─────────────────────────── */

type Row = Record<string, unknown> & { _links?: Record<string, string> };
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const named = (v: unknown, lang: string) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'name' in v ? nameOf(v as Named, lang) : null);

function Dash() {
    return <span className="text-muted-foreground">—</span>;
}

/** เข้าใหม่ / ลาออก in words, with "ยังไม่เริ่มงาน" under a joiner who starts later. */
export function KindCell({ row }: { row: Row }) {
    const t = useT();
    if (row.movement_kind === 'left') return <StatusBadge tone="amber">{t('rep_kind_left')}</StatusBadge>;
    const ahead = (num(row.upcoming_days) ?? 0) > 0;
    return (
        <div className="flex flex-col items-start gap-0.5">
            <StatusBadge tone="green">{t('rep_kind_joined')}</StatusBadge>
            {ahead && <span className="text-muted-foreground text-xs">{t('rep_eo_not_started')}</span>}
        </div>
    );
}

/** The last day, flagged when it falls before the start day. */
export function LastDayCell({ row }: { row: Row }) {
    const t = useT();
    const fmt = useDateFormat();
    const last = str(row.last_day);
    if (row.movement_kind !== 'left') return <Dash />;
    if (!last) return <span className="text-muted-foreground">{t('rep_eo_no_last_day')}</span>;
    const joined = str(row.joined_at);
    return (
        <div className="flex flex-col">
            <span className="whitespace-nowrap">{fmt.date(last)}</span>
            {joined && last < joined && <span className="text-xs text-amber-700 dark:text-amber-400">{t('rep_eo_before_start')}</span>}
        </div>
    );
}

/** The person (opening them on the Employees page) with their code under the name. */
export function EmployeeCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const name = named(row.employee, lang);
    const href = row._links?.employee;
    if (!name) return <Dash />;
    return (
        <div className="min-w-0">
            {href && canOpen(href) ? (
                <Link
                    to={href}
                    translate="no"
                    title={name}
                    className="text-brand focus-visible:ring-brand block max-w-[14rem] truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {name}
                </Link>
            ) : (
                <div className="max-w-[14rem] truncate font-medium" title={name} translate="no">
                    {name}
                </div>
            )}
            <div className="text-muted-foreground font-mono text-xs">{str(row.employee_code)}</div>
        </div>
    );
}

/** The department with the section under it. */
export function DepartmentCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const department = named(row.department, lang);
    const section = named(row.section, lang);
    return (
        <div className="min-w-0">
            <div className="max-w-[14rem] truncate">{department ?? <Dash />}</div>
            <div className="text-muted-foreground max-w-[14rem] truncate text-xs">{section ?? t('rep_eo_no_section')}</div>
        </div>
    );
}

/** Preparation of a joiner: the status in words, requests done, and how soon they start (or how long ago, still unprepared). */
export function PrepCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (row.movement_kind === 'left') return <Dash />;
    const status = str(row.prep_status);
    const days = num(row.upcoming_days);
    const progress = str(row.onboarding);
    if (!status) return <Dash />;
    const tone = status === 'preparing' ? ((days ?? 1) <= 0 ? 'red' : 'amber') : status === 'ready' ? 'green' : 'gray';
    const when =
        days === null
            ? null
            : days > 0
              ? t('rep_eo_starts_in').replace('{n}', count(days, lang))
              : days === 0
                ? t('rep_eo_starts_today')
                : status === 'preparing'
                  ? t('rep_eo_started_ago').replace('{n}', count(-days, lang))
                  : null;
    return (
        <div className="flex flex-col items-start gap-0.5">
            <StatusBadge tone={tone}>{t(`rep_prep_${status}`)}</StatusBadge>
            {progress && <span className="text-muted-foreground text-xs">{t('rep_eo_prep_done').replace('{p}', progress)}</span>}
            {when && <span className="text-muted-foreground text-xs">{when}</span>}
        </div>
    );
}

/** A leaver's assets or open grants: red while they have left and still hold some. */
export function HeldCell({ row, column }: { row: Row; column: 'assets_held' | 'open_grants' }) {
    const lang = useUiStore((s) => s.lang);
    const v = num(row[column]);
    if (row.movement_kind !== 'left' || v === null) return <Dash />;
    return v > 0 ? (
        <StatusBadge tone="red" className="font-mono tabular-nums">
            {count(v, lang)}
        </StatusBadge>
    ) : (
        <span className="text-muted-foreground font-mono">0</span>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <Card className="overflow-clip">
                <CardHeadingSkeleton />
                <ChartSkeleton />
            </Card>
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="overflow-clip lg:col-span-2 xl:col-span-3">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={6} />
                </Card>
                <Card className="overflow-clip xl:col-span-2">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={4} />
                </Card>
            </div>
        </div>
    );
}

export function EmployeeOverviewCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useEmployeeOverviewBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <HeadcountCard data={data} />
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid items-start gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <DepartmentCard data={data} singleDepartment={Boolean(filters.department_id)} />
                <HoldingCard data={data} />
            </div>
        </div>
    );
}
