// "ภาพรวมคำขอ" report cards: submitted and completed by month, types by status, days to delivery, items asked for, departments (data: useRequestOverviewBreakdown).
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { localName, localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRequestOverviewBreakdown } from '../hooks/use-reports';
import type {
    ChartTone,
    RequestCategoryKey,
    RequestDelivery,
    RequestOverviewBreakdown,
    RequestStatusKey,
    RequestTypeKey,
    TabularFilters,
} from '../types';
import { Cols, NUM, Segments, TD, TH } from './access-overview-cards';
import { count, PieceBar, type Lang } from './access-parts';
import { CardsUpdating } from './cards-updating';
import {
    barTop,
    CardEmpty,
    CardTitle,
    currentMonth,
    fold,
    FoldToggle,
    monthDensity,
    monthLabel,
    monthLabelPlace,
    reportDates,
    SCROLL_AFTER_MONTHS,
    SCROLL_MONTH_PX,
    shortYear,
    Swatch,
} from './chart-parts';
import { FILL } from './chart-tones';
import { BASIS_PCT, H_PCT, pct, W_PCT } from './percent-classes';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { niceMax } from './weekly-ticket-chart';

type Breakdown = RequestOverviewBreakdown;
type Month = Breakdown['months'][number];
type Origin = 'all' | 'direct' | 'onboarding';

/** Statuses in the Request module's order, each in its StatusBadge colour. */
const STATUS_ORDER: RequestStatusKey[] = ['pending', 'approved', 'completed', 'rejected', 'cancelled'];
const STATUS_TONE: Record<RequestStatusKey, ChartTone> = {
    pending: 'soft-amber',
    approved: 'soft-blue',
    completed: 'soft-green',
    rejected: 'soft-red',
    cancelled: 'gray',
};

/** Ticket categories a request type opens, in the Ticket module's order. */
const CATEGORY_ORDER: RequestCategoryKey[] = ['hardware', 'software', 'network', 'cctv', 'telephone', 'other'];
const CATEGORY_TONE: Record<RequestCategoryKey, ChartTone> = {
    hardware: 'blue',
    software: 'violet',
    network: 'access-file',
    cctv: 'pink',
    telephone: 'orange',
    other: 'gray',
};

/** Each request type's ticket category (App\Enums\Request\RequestType::ticketCategory). */
const TYPE_CATEGORY: Record<RequestTypeKey, RequestCategoryKey> = {
    computer: 'hardware',
    hardware: 'hardware',
    mobile: 'hardware',
    telephone: 'telephone',
    software: 'software',
    email: 'software',
    mailgroup: 'software',
    recovery: 'software',
    network: 'network',
    fileshare: 'network',
    cctv: 'cctv',
    social: 'other',
    other: 'other',
};

/** Approval part and IT part of the days to delivery, in the colours of the statuses a request waits in. */
const PART_TONE = { approval: 'soft-amber', it: 'soft-blue' } as const satisfies Record<string, ChartTone>;

/** Rows a list shows before the rest fold. */
const ITEMS_SHOWN = 8;
const ROWS_SHOWN = 10;

/** A median in whole days: "3", "1.5". */
const days = (n: number, lang: Lang) => formatNumber(n, lang, { maxDecimals: 1 });

/** A tidy axis top at or above the value whose half is a whole number: 11 → 12, 3 → 4, 41 → 50. */
function axisTop(value: number): number {
    const steps = [4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];
    return steps.find((s) => s >= value) ?? niceMax(value);
}

/* ─────────────────────────── submitted and completed by month ─────────────────────────── */

/** Submitted rise above the line, completed hang below it — each with its shape. */
const FLOW = {
    submitted: { tone: 'soft-blue' as ChartTone, shape: '[clip-path:polygon(50%_0,100%_100%,0_100%)]', label: 'rep_rqo_month_submitted' },
    completed: { tone: 'soft-green' as ChartTone, shape: '[clip-path:polygon(0_0,100%_0,50%_100%)]', label: 'rep_rqo_month_completed' },
};
type FlowKey = keyof typeof FLOW;

function FlowMark({ k }: { k: FlowKey }) {
    return <i aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0', FILL[FLOW[k].tone], FLOW[k].shape)} />;
}

function MonthFlowCard({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const up = axisTop(Math.max(0, ...months.map((m) => m.submitted)));
    // The lower half never shrinks below a quarter of the upper, so a single completion still reads.
    const down = axisTop(Math.max(Math.ceil(up / 4), ...months.map((m) => m.completed)));
    const sum = (k: FlowKey) => months.reduce((s, m) => s + m[k], 0);
    const peak = months.reduce<Month | null>((best, m) => (m.submitted > (best?.submitted ?? 0) ? m : best), null);
    const split = pct(up, up + down);
    const thisMonth = currentMonth();
    const hasCurrent = months.some((m) => m.month === thisMonth);
    const partialNote = t('rep_wo_month_partial_tip').replace('{date}', reportDates(lang).date(new Date()));
    const density = monthDensity(months);
    const scroll = months.length > SCROLL_AFTER_MONTHS;
    const scroller = useRef<HTMLDivElement>(null);
    const bars = useRef(new Map<string, HTMLElement>());
    const [scrollbar, setScrollbar] = useState(0);
    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element) return;
        element.scrollLeft = element.scrollWidth;
        const observer = new ResizeObserver(() => setScrollbar(element.offsetHeight - element.clientHeight));
        observer.observe(element);
        return () => observer.disconnect();
    }, [months]);
    const monthText = (m: Month) =>
        [
            monthLabel(m.month, lang, false, true),
            ...(Object.keys(FLOW) as FlowKey[]).map((k) => `${t(FLOW[k].label)} ${count(m[k], lang)}`),
            m.month === thisMonth ? partialNote : null,
        ]
            .filter(Boolean)
            .join(', ');

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqo_month_title')}
                info={t('rep_rqo_month_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {(Object.keys(FLOW) as FlowKey[]).map((k) => (
                            <span key={k} className="inline-flex items-center gap-1.5">
                                <FlowMark k={k} />
                                {t(FLOW[k].label)}
                                <b className="text-foreground font-semibold tabular-nums">{count(sum(k), lang)}</b>
                            </span>
                        ))}
                        {hasCurrent && (
                            <span className="inline-flex items-center gap-1.5">
                                {density.thin ? (
                                    <i aria-hidden className="bg-brand inline-block h-2 w-2 rounded-full" />
                                ) : (
                                    <i aria-hidden className="border-brand inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed" />
                                )}
                                {t('rep_wo_month_partial')}
                            </span>
                        )}
                    </span>
                }
            />
            {sum('submitted') + sum('completed') === 0 ? (
                <CardEmpty kind="empty" title={t('rep_empty_req_overview_month')} hint={t('rep_empty_req_overview_month_hint')} />
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_rqo_month_aria')
                            .replace('{from}', monthLabel(months[0].month, lang, false, true))
                            .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                            .replace('{in}', count(sum('submitted'), lang))
                            .replace('{out}', count(sum('completed'), lang))}
                    </p>
                    {/* Full width, so taller than the half-width month cards on wide screens. */}
                    <div className="flex min-h-56 flex-1 gap-2 lg:min-h-72">
                        <div aria-hidden className="flex w-11 shrink-0 flex-col">
                            <div className={cn('relative mt-[18px] min-h-0', BASIS_PCT[split])}>
                                {[
                                    [up / 2, 'bottom-1/2'],
                                    [up, 'bottom-full'],
                                ].map(([v, at]) => (
                                    <span
                                        key={at}
                                        className={cn(
                                            'text-muted-foreground absolute right-0 translate-y-1/2 text-[10.5px] leading-none tabular-nums',
                                            at,
                                        )}
                                    >
                                        {count(v as number, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="h-0.5 shrink-0" />
                            <div className={cn('relative mb-[18px] min-h-0', BASIS_PCT[100 - split])}>
                                <span className="text-muted-foreground absolute top-0 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-2 text-[10.5px] leading-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark k="submitted" />
                                        {t('rep_rqo_axis_up')}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark k="completed" />
                                        {t('rep_rqo_axis_down')}
                                    </span>
                                </span>
                                {/* Only the lower axis's top: its middle label would sit under the key. */}
                                <span className="text-muted-foreground absolute top-full right-0 -translate-y-1/2 text-[10.5px] leading-none tabular-nums">
                                    {count(down, lang)}
                                </span>
                            </div>
                            <div className="shrink-0" style={{ height: `calc(2.25rem + ${scrollbar}px)` }} />
                        </div>
                        <div ref={scroller} className={cn('flex min-w-0 flex-1 flex-col', scroll && 'overflow-x-auto overflow-y-hidden')}>
                            <div className="flex min-w-full flex-1 flex-col" style={scroll ? { width: months.length * SCROLL_MONTH_PX } : undefined}>
                                <div className="relative flex flex-1 flex-col">
                                    <div className={cn('relative mt-[18px] min-h-0', BASIS_PCT[split])}>
                                        <div aria-hidden>
                                            <div className="border-border absolute inset-x-0 bottom-1/2 border-t" />
                                            <div className="border-border absolute inset-x-0 bottom-full border-t" />
                                            <div className="border-border absolute inset-x-0 bottom-1/4 border-t border-dashed" />
                                            <div className="border-border absolute inset-x-0 bottom-3/4 border-t border-dashed" />
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-end', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                                                    <div
                                                        ref={(el) => {
                                                            if (el) bars.current.set(m.month, el);
                                                            else bars.current.delete(m.month);
                                                        }}
                                                        className={cn('relative w-full', density.bar, H_PCT[pct(m.submitted, up)])}
                                                    >
                                                        {m.month === thisMonth &&
                                                            (density.thin ? (
                                                                <span className="bg-brand absolute -top-2.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full" />
                                                            ) : (
                                                                m.submitted > 0 && (
                                                                    <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                                )
                                                            ))}
                                                        {density.top && m.submitted > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                    m.month === thisMonth && 'text-brand',
                                                                )}
                                                            >
                                                                {count(m.submitted, lang)}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={cn('block h-full', !density.thin && 'rounded-t-md', FILL[FLOW.submitted.tone])}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div aria-hidden className="border-muted-foreground/60 border-t-2" />
                                    <div className={cn('relative mb-[18px] min-h-0', BASIS_PCT[100 - split])}>
                                        <div aria-hidden>
                                            <div className="border-border absolute inset-x-0 top-1/2 border-t border-dashed" />
                                            <div className="border-border absolute inset-x-0 top-full border-t" />
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-start', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center">
                                                    <div className={cn('relative w-full', density.bar, H_PCT[pct(m.completed, down)])}>
                                                        {m.month === thisMonth && !density.thin && m.completed > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] top-0 -bottom-[3px] rounded-b-md border-2 border-t-0 border-dashed" />
                                                        )}
                                                        <span
                                                            className={cn('block h-full', !density.thin && 'rounded-b-md', FILL[FLOW.completed.tone])}
                                                        />
                                                        {density.top && m.completed > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -bottom-[18px] left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                    m.month === thisMonth && 'text-brand',
                                                                )}
                                                            >
                                                                {count(m.completed, lang)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className={cn('absolute inset-0 flex', density.gap)}>
                                        {months.map((m) => (
                                            <InfoPopover
                                                key={m.month}
                                                label={monthText(m)}
                                                anchor={() => barTop(bars.current.get(m.month), density.top && m.submitted > 0 ? 18 : 0)}
                                                className="h-full min-w-0 flex-1 cursor-pointer"
                                                content={<FlowDetail month={m} partialNote={m.month === thisMonth ? partialNote : null} />}
                                            >
                                                <span className="sr-only">{monthLabel(m.month, lang, false, true)}</span>
                                            </InfoPopover>
                                        ))}
                                    </div>
                                </div>
                                <div aria-hidden className={cn('flex h-9 shrink-0 pt-1.5', density.gap)}>
                                    {months.map((m, i) => (
                                        <div key={m.month} className="relative min-w-0 flex-1">
                                            {density.label(i, m.month) && (
                                                <div
                                                    className={cn(
                                                        'absolute top-0 text-[10.5px] whitespace-nowrap',
                                                        monthLabelPlace(density, i, months.length),
                                                    )}
                                                >
                                                    <b
                                                        className={cn(
                                                            'block font-semibold',
                                                            m.month === thisMonth ? 'text-brand' : 'text-foreground',
                                                        )}
                                                    >
                                                        {monthLabel(m.month, lang, false)}
                                                    </b>
                                                    <span className="text-muted-foreground tabular-nums">{shortYear(m.month, lang)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    {peak && (
                        <p className="text-muted-foreground mt-2 text-xs">
                            {t('rep_rqo_month_peak')
                                .replace('{month}', monthLabel(peak.month, lang, false, true))
                                .replace('{n}', count(peak.submitted, lang))}
                        </p>
                    )}
                </div>
            )}
        </Card>
    );
}

/** A month's popover: submitted, completed, and "counted to …" for this month. */
function FlowDetail({ month, partialNote }: { month: Month; partialNote: string | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {(Object.keys(FLOW) as FlowKey[]).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5">
                        <FlowMark k={k} />
                        {t(FLOW[k].label)}
                    </span>
                    <b className={cn('tabular-nums', month[k] === 0 && 'text-muted-foreground font-normal')}>{count(month[k], lang)}</b>
                </div>
            ))}
            {partialNote && <div className="text-muted-foreground border-border border-t pt-1">{partialNote}</div>}
        </div>
    );
}

/* ─────────────────────────── types by status ─────────────────────────── */

function StatusBar({ byStatus }: { byStatus: Record<RequestStatusKey, number> }) {
    const t = useT();
    const total = STATUS_ORDER.reduce((s, k) => s + byStatus[k], 0);
    return (
        <PieceBar
            className="min-w-[10rem]"
            scale={total}
            pieces={STATUS_ORDER.map((k) => ({ key: k, value: byStatus[k], fill: FILL[STATUS_TONE[k]], label: t(`req_status_${k}`) }))}
        />
    );
}

/** อัตราอนุมัติ: got through approval ÷ (got through + turned down); "—" when none was decided. */
function Rate({ approved, rejected }: { approved: number; rejected: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const decided = approved + rejected;
    if (decided === 0) return <span className="text-muted-foreground">—</span>;
    const tip = t('rep_rqo_rate_tip').replace('{yes}', count(approved, lang)).replace('{n}', count(decided, lang));
    return (
        <span title={tip}>
            {Math.round((approved / decided) * 100)}%<span className="sr-only"> ({tip})</span>
        </span>
    );
}

/** ประเภท · คำขอ · สถานะ · อัตราอนุมัติ */
const TYPE_COLS = ['w-[26%]', 'w-[10%]', 'w-[50%]', 'w-[14%]'];

function TypesCard({ types }: { types: Breakdown['types'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(types, ROWS_SHOWN, open);
    const total = Object.fromEntries(STATUS_ORDER.map((k) => [k, types.reduce((s, r) => s + r.by_status[k], 0)])) as Record<RequestStatusKey, number>;
    const used = STATUS_ORDER.filter((k) => total[k] > 0);
    const sumOf = (k: 'total' | 'approved' | 'rejected') => types.reduce((s, r) => s + r[k], 0);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqo_types_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {used.map((k) => (
                            <Swatch key={k} fill={FILL[STATUS_TONE[k]]}>
                                {t(`req_status_${k}`)}
                            </Swatch>
                        ))}
                    </span>
                }
            />
            {types.length === 0 ? (
                <CardEmpty kind="search" title={t('rep_empty_req_overview_types')} hint={t('rep_empty_req_overview_types_hint')} />
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[36rem] table-fixed text-sm">
                        <caption className="sr-only">{t('rep_rqo_types_title')}</caption>
                        <Cols widths={TYPE_COLS} />
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqo_col_type')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqo_col_requests')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqo_col_status')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqo_col_rate')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={r.type} className="border-border/60 border-b last:border-b-0">
                                    <th scope="row" className={cn(TD, 'truncate text-left font-medium')}>
                                        {t(`req_${r.type}`)}
                                    </th>
                                    <td className={cn(TD, NUM)}>{count(r.total, lang)}</td>
                                    <td className={TD}>
                                        <StatusBar byStatus={r.by_status} />
                                    </td>
                                    <td className={cn(TD, NUM)}>
                                        <Rate approved={r.approved} rejected={r.rejected} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {folds && <FoldToggle open={open} total={types.length} onToggle={() => setOpen((v) => !v)} />}
                    <table className="bg-muted/40 border-border w-full min-w-[36rem] table-fixed border-t text-sm font-semibold">
                        <caption className="sr-only">{t('rep_rqo_types_total').replace('{n}', count(types.length, lang))}</caption>
                        <Cols widths={TYPE_COLS} />
                        <tbody>
                            <tr>
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_rqo_types_total').replace('{n}', count(types.length, lang))}
                                </th>
                                <td className={cn(TD, NUM)}>{count(sumOf('total'), lang)}</td>
                                <td className={TD}>
                                    <StatusBar byStatus={total} />
                                </td>
                                <td className={cn(TD, NUM)}>
                                    <Rate approved={sumOf('approved')} rejected={sumOf('rejected')} />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── days to delivery ─────────────────────────── */

function DeliveryBar({ row, scale }: { row: RequestDelivery; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const approval = row.approval ?? 0;
    const it = row.it ?? 0;
    const unit = t('rep_days');
    const label = `${t('rep_rqo_days_approval')} ${days(approval, lang)} ${unit}, ${t('rep_rqo_days_it')} ${days(it, lang)} ${unit}`;
    if (approval + it === 0) return <span className="text-muted-foreground text-xs">{label}</span>;
    return (
        <PieceBar
            className="min-w-[10rem]"
            minWidth="min-w-16"
            scale={scale}
            label={label}
            pieces={[
                { key: 'approval', value: approval, fill: FILL[PART_TONE.approval], label: t('rep_rqo_days_approval'), text: days(approval, lang) },
                { key: 'it', value: it, fill: FILL[PART_TONE.it], label: t('rep_rqo_days_it'), text: days(it, lang) },
            ]}
        />
    );
}

/** ประเภท · ขั้นอนุมัติ และขั้น IT · ยื่นจนเสร็จ · คำขอ */
const DAYS_COLS = ['w-[28%]', 'w-[44%]', 'w-[16%]', 'w-[12%]'];

function DeliveryCard({ delivery }: { delivery: Breakdown['delivery'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const rows = delivery.types;
    const { folds, shown } = fold(rows, ITEMS_SHOWN, open);
    const scale = Math.max(0.1, ...rows.map((r) => (r.approval ?? 0) + (r.it ?? 0)));
    const line = (key: string, label: string, row: RequestDelivery, total = false) => (
        <tr key={key} className={cn(!total && 'border-border/60 border-b last:border-b-0')}>
            <th scope="row" className={cn(TD, 'truncate text-left', !total && 'font-medium')}>
                {label}
            </th>
            <td className={TD}>
                <DeliveryBar row={row} scale={scale} />
            </td>
            <td className={cn(TD, NUM)}>
                {row.total === null ? '—' : days(row.total, lang)} <span className="text-muted-foreground text-xs font-normal">{t('rep_days')}</span>
            </td>
            <td className={cn(TD, NUM)}>{count(row.count, lang)}</td>
        </tr>
    );

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqo_days_title')}
                info={[t('rep_rqo_days_note'), t('rep_rqo_days_foot')]}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch fill={FILL[PART_TONE.approval]}>{t('rep_rqo_days_approval')}</Swatch>
                        <Swatch fill={FILL[PART_TONE.it]}>{t('rep_rqo_days_it')}</Swatch>
                    </span>
                }
            />
            {rows.length === 0 ? (
                <CardEmpty kind="search" title={t('rep_empty_req_overview_delivery')} hint={t('rep_empty_req_overview_delivery_hint')} />
            ) : (
                <>
                    <div className="relative overflow-x-auto">
                        <table className="w-full min-w-[32rem] table-fixed text-sm">
                            <caption className="sr-only">{t('rep_rqo_days_title')}</caption>
                            <Cols widths={DAYS_COLS} />
                            <thead>
                                <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_rqo_col_type')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_rqo_col_split')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_rqo_col_total')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_rqo_col_requests')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>{shown.map((r) => line(r.type, t(`req_${r.type}`), r))}</tbody>
                        </table>
                        {folds && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
                        <table className="bg-muted/40 border-border w-full min-w-[32rem] table-fixed border-t text-sm font-semibold">
                            <caption className="sr-only">{t('rep_rqo_days_all')}</caption>
                            <Cols widths={DAYS_COLS} />
                            <tbody>{line('all', t('rep_rqo_days_all'), delivery.all, true)}</tbody>
                        </table>
                    </div>
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── items asked for ─────────────────────────── */

type Item = Breakdown['items']['list'][number];

/** One origin's items, or both summed for "ทั้งหมด", most asked for first. */
function itemsFor(list: Item[], origin: Origin, lang: Lang): Item[] {
    if (origin !== 'all') return list.filter((i) => i.origin === origin);
    const merged = new Map<string, Item>();
    for (const i of list) {
        const key = `${i.type}|${i.kind}|${i.id}`;
        const seen = merged.get(key);
        merged.set(key, seen ? { ...seen, count: seen.count + i.count } : { ...i });
    }
    const name = (i: Item) => localName(i, lang);
    return [...merged.values()].sort((a, b) => b.count - a.count || name(a).localeCompare(name(b)));
}

function ItemsCard({ items }: { items: Breakdown['items'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [params, setParams] = useSearchParams();
    const raw = params.get('items');
    const origin: Origin = raw === 'direct' || raw === 'onboarding' ? raw : 'all';
    const setOrigin = (next: Origin) => {
        setOpen(false);
        setParams(
            (p) => {
                if (next === 'all') p.delete('items');
                else p.set('items', next);
                return p;
            },
            { replace: true },
        );
    };
    const [open, setOpen] = useState(false);
    const list = itemsFor(items.list, origin, lang);
    const { folds, shown } = fold(list, ITEMS_SHOWN, open);
    const max = Math.max(1, ...list.map((i) => i.count));
    const categories = CATEGORY_ORDER.filter((c) => list.some((i) => TYPE_CATEGORY[i.type] === c));

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqo_items_title')}
                info={items.picked[origin] > 0 ? t('rep_rqo_items_note').replace('{n}', count(items.picked[origin], lang)) : undefined}
                sub={
                    <Segments
                        label={t('rep_rqo_items_seg')}
                        options={(['all', 'direct', 'onboarding'] as const).map((o) => ({
                            value: o as Origin,
                            label: o === 'all' ? t('rep_rqo_items_all') : t(`rep_rqo_origin_${o}`),
                            count: items.origins[o],
                        }))}
                        value={origin}
                        onChange={setOrigin}
                    />
                }
            />
            {list.length === 0 ? (
                <CardEmpty kind="empty" title={t('rep_empty_req_overview_items')} hint={t('rep_empty_req_overview_items_hint')} />
            ) : (
                <>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3 text-xs">
                        {categories.map((c) => (
                            <Swatch key={c} fill={FILL[CATEGORY_TONE[c]]}>
                                {t(`ticket_cat_${c}`)}
                            </Swatch>
                        ))}
                    </div>
                    <ul className="flex flex-col gap-2.5 px-5 py-3">
                        {shown.map((i) => (
                            <li
                                key={`${i.origin}|${i.type}|${i.kind}|${i.id}`}
                                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_2.5rem]"
                            >
                                <span className="min-w-0">
                                    <b translate="no" className="block truncate font-medium">
                                        {localName(i, lang)}
                                    </b>
                                    <span className="text-muted-foreground block truncate text-xs">{t(`req_${i.type}`)}</span>
                                </span>
                                <span aria-hidden className="dark:bg-muted h-2.5 overflow-hidden rounded-full bg-slate-200">
                                    <span
                                        className={cn(
                                            'block h-full rounded-full',
                                            W_PCT[pct(i.count, max)],
                                            FILL[CATEGORY_TONE[TYPE_CATEGORY[i.type]]],
                                        )}
                                    />
                                </span>
                                <b className="text-right font-semibold tabular-nums">{count(i.count, lang)}</b>
                            </li>
                        ))}
                    </ul>
                    {origin === 'onboarding' && items.people > 0 && (
                        <p className="text-muted-foreground px-5 pb-3 text-xs">
                            {t('rep_rqo_items_people').replace('{n}', count(items.people, lang))}
                        </p>
                    )}
                    {folds && <FoldToggle open={open} total={list.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── departments ─────────────────────────── */

function CategoryBar({ byCategory, scale }: { byCategory: Record<RequestCategoryKey, number>; scale: number }) {
    const t = useT();
    return (
        <PieceBar
            className="min-w-[10rem]"
            scale={scale}
            pieces={CATEGORY_ORDER.map((k) => ({ key: k, value: byCategory[k], fill: FILL[CATEGORY_TONE[k]], label: t(`ticket_cat_${k}`) }))}
        />
    );
}

/** แผนก · คำขอ · ตามหมวด · ขอมากสุด · พนักงานใหม่ */
const DEPT_COLS = ['w-[22%]', 'w-[9%]', 'w-[37%]', 'w-[20%]', 'w-[12%]'];

function DepartmentCard({ departments }: { departments: Breakdown['departments'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(departments, ROWS_SHOWN, open);
    const totalByCategory = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, departments.reduce((s, d) => s + d.by_category[k], 0)])) as Record<
        RequestCategoryKey,
        number
    >;
    const used = CATEGORY_ORDER.filter((k) => totalByCategory[k] > 0);
    const total = departments.reduce((s, d) => s + d.total, 0);
    const onboarding = departments.reduce((s, d) => s + d.onboarding, 0);
    const name = (d: Breakdown['departments'][number]) => localPair(d.name, d.name_th, lang) ?? t('rep_rqo_no_department');
    const top = (d: Breakdown['departments'][number]) => (
        <span className="block min-w-0">
            <span className="block truncate">{t(`req_${d.top_type.type}`)}</span>
            <span className="text-muted-foreground block text-xs">
                {(d.top_type.ties > 0 ? t('rep_rqo_top_ties').replace('{ties}', count(d.top_type.ties, lang)) : t('rep_rqo_top_count')).replace(
                    '{n}',
                    count(d.top_type.count, lang),
                )}
            </span>
        </span>
    );
    const onboardingCell = (n: number) => (n > 0 ? count(n, lang) : <span className="text-muted-foreground">0</span>);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqo_dept_title')}
                info={t('rep_rqo_dept_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {used.map((k) => (
                            <Swatch key={k} fill={FILL[CATEGORY_TONE[k]]}>
                                {t(`ticket_cat_${k}`)}
                            </Swatch>
                        ))}
                    </span>
                }
            />
            {departments.length === 0 ? (
                <CardEmpty kind="search" title={t('rep_empty_req_overview_departments')} hint={t('rep_empty_req_overview_departments_hint')} />
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[40rem] table-fixed text-sm">
                        <caption className="sr-only">{t('rep_rqo_dept_title')}</caption>
                        <Cols widths={DEPT_COLS} />
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqo_col_dept')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqo_col_requests')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqo_col_categories')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqo_col_top')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqo_col_onboarding')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((d) => (
                                <tr key={d.department_id ?? `name:${d.name ?? ''}`} className="border-border/60 border-b">
                                    <th
                                        scope="row"
                                        title={name(d)}
                                        className={cn(TD, 'truncate text-left font-medium', d.name === null && 'text-muted-foreground font-normal')}
                                    >
                                        {name(d)}
                                    </th>
                                    <td className={cn(TD, NUM)}>{count(d.total, lang)}</td>
                                    <td className={TD}>
                                        <CategoryBar byCategory={d.by_category} scale={d.total} />
                                    </td>
                                    <td className={TD}>{top(d)}</td>
                                    <td className={cn(TD, NUM)}>{onboardingCell(d.onboarding)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {folds && <FoldToggle open={open} total={departments.length} onToggle={() => setOpen((v) => !v)} />}
                    <table className="bg-muted/40 border-border w-full min-w-[40rem] table-fixed border-t text-sm font-semibold">
                        <caption className="sr-only">{t('rep_rqo_dept_total').replace('{n}', count(departments.length, lang))}</caption>
                        <Cols widths={DEPT_COLS} />
                        <tbody>
                            <tr>
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_rqo_dept_total').replace('{n}', count(departments.length, lang))}
                                </th>
                                <td className={cn(TD, NUM)}>{count(total, lang)}</td>
                                <td className={TD}>
                                    <CategoryBar byCategory={totalByCategory} scale={total} />
                                </td>
                                <td className={TD} />
                                <td className={cn(TD, NUM)}>{onboardingCell(onboarding)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <ChartSkeleton />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <BarRowsSkeleton rows={6} />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <BarRowsSkeleton rows={6} />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={6} />
            </Card>
        </div>
    );
}

export function RequestOverviewCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isFetching, isError, error } = useRequestOverviewBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <CardsUpdating updating={isFetching && !isLoading} className="space-y-4">
            <MonthFlowCard months={data.months} />
            <TypesCard types={data.types} />
            <DeliveryCard delivery={data.delivery} />
            <ItemsCard items={data.items} />
            <DepartmentCard departments={data.departments} />
        </CardsUpdating>
    );
}
