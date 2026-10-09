// Access overview report cards: type / state segments, grants and revocations by month, leavers, departments, resources to look after (data: useAccessOverviewBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAccessOverviewBreakdown } from '../hooks/use-reports';
import type { AccessDepartment, AccessOverviewBreakdown, AccessResource, AccessType, ChartTone, TabularFilters } from '../types';
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
    SCROLL_AFTER_MONTHS,
    SCROLL_MONTH_PX,
} from './chart-parts';
import { FILL } from './chart-tones';
import { InfoPopover } from './info-popover';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { shortDate } from './transfer-cards';
import { niceMax } from './weekly-ticket-chart';

type Lang = 'th' | 'en';
type Patch = (next: TabularFilters) => void;
type Month = AccessOverviewBreakdown['months'][number];

/** The registries in the Access page's order. */
export const ACCESS_TYPES: AccessType[] = ['email_group', 'file_share', 'social_platform', 'software'];

/** Each registry's colour (access-overview.tsx CHANNEL). */
export const TYPE_TONE: Record<AccessType, ChartTone> = {
    email_group: 'access-email',
    file_share: 'access-file',
    social_platform: 'access-social',
    software: 'access-software',
};

/** The Access page tab a registry opens on. */
export const TYPE_TAB: Record<AccessType, string> = {
    email_group: 'email-groups',
    file_share: 'file-shares',
    social_platform: 'social-platforms',
    software: 'software',
};

/** Groups show this many rows; any more fold under "แสดงทั้งหมด". */
const GROUP_SHOWN = 3;

/** Department rows listed before the rest fold. */
const ROWS_SHOWN = 10;

export const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
export const TD = 'px-3 py-2.5 align-middle';
export const NUM = 'text-right font-mono tabular-nums';
export const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';
const SEGMENT =
    'focus-visible:ring-brand focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none';

const count = (n: number, lang: Lang) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');
const deptName = (d: AccessDepartment, lang: Lang) => (d ? (lang === 'th' && d.name_th) || d.name : null);

/** A registry's dot in its colour. */
export function TypeDot({ type }: { type: AccessType }) {
    return <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', FILL[TYPE_TONE[type]])} />;
}

/** A registry's name with its dot. */
export function TypeLabel({ type }: { type: AccessType }) {
    const t = useT();
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <TypeDot type={type} />
            {t(`rep_ac_type_${type}`)}
        </span>
    );
}

/* ─────────────────────────── segments ─────────────────────────── */

/** Segments: one pressed, each with its count once known. `size` sm sits on a list heading, md in the filter bar. */
export function Segments<T extends string | null>({
    label,
    options,
    value,
    onChange,
    size = 'sm',
}: {
    label: string;
    options: { value: T; label: string; count: number | null }[];
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
}) {
    const lang = useUiStore((s) => s.lang);
    return (
        <div role="group" aria-label={label} className="border-border bg-card dark:bg-background inline-flex flex-wrap gap-0.5 rounded-md border p-0.5">
            {options.map((o) => (
                <button
                    key={o.value ?? 'all'}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        SEGMENT,
                        size === 'md' ? 'h-8 px-3' : 'h-6 px-2.5',
                        value === o.value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    {o.label}
                    {o.count !== null && <span className="font-mono opacity-80">{count(o.count, lang)}</span>}
                </button>
            ))}
        </div>
    );
}

/** The registries as filter-bar segments: "ทั้งหมด" then each with its count. */
export function registryOptions(t: (key: string) => string, types: AccessType[], counts: Record<string, number> | undefined) {
    return [
        { value: null as AccessType | null, label: t('rep_ac_type_all'), count: counts ? types.reduce((s, k) => s + (counts[k] ?? 0), 0) : null },
        ...types.map((k) => ({ value: k as AccessType | null, label: t(`rep_ac_type_${k}`), count: counts ? (counts[k] ?? 0) : null })),
    ];
}

/** The type filter as segments in the filter bar, each with its active grants. */
export function AccessTypeSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useAccessOverviewBreakdown(filters);
    return (
        <Segments
            size="md"
            label={t('rep_fl_ac_type')}
            options={registryOptions(t, ACCESS_TYPES, data?.types)}
            value={(filters.type as AccessType | null | undefined) ?? null}
            onChange={(type) => patch({ type })}
        />
    );
}

/** Active / revoked / all on the register's heading — narrows only the list. */
export function AccessStateSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useAccessOverviewBreakdown(filters);
    return (
        <Segments
            label={t('rep_fl_ac_state')}
            options={(['active', 'revoked', 'all'] as const).map((s) => ({ value: s as string, label: t(`rep_ac_state_${s}`), count: data ? data.states[s] : null }))}
            value={(filters.state as string | null | undefined) ?? 'active'}
            onChange={(state) => patch({ state })}
        />
    );
}

/* ─────────────────────────── grants and revocations by month ─────────────────────────── */

/** Grants rise above the line in one tone; revocations hang below, while working or on leaving — each with its shape. */
const FLOW = {
    granted: { tone: 'soft-blue' as ChartTone, shape: '[clip-path:polygon(50%_0,100%_100%,0_100%)]', label: 'rep_ac_month_granted' },
    revoked_work: { tone: 'soft-green' as ChartTone, shape: '[clip-path:polygon(0_0,100%_0,50%_100%)]', label: 'rep_ac_month_revoked_work' },
    revoked_leave: { tone: 'soft-amber' as ChartTone, shape: '[clip-path:polygon(0_0,100%_0,50%_100%)]', label: 'rep_ac_month_revoked_leave' },
};
type FlowKey = keyof typeof FLOW;

function FlowMark({ k }: { k: FlowKey }) {
    return <i aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0', FILL[FLOW[k].tone], FLOW[k].shape)} />;
}

/** A tidy axis top at or above the value whose half is a whole number: 11 → 12, 3 → 4, 41 → 50. */
function axisTop(value: number): number {
    const steps = [4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];
    return steps.find((s) => s >= value) ?? niceMax(value);
}

function MonthFlowCard({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const back = (m: Month) => m.revoked_work + m.revoked_leave;
    const up = axisTop(Math.max(0, ...months.map((m) => m.granted)));
    // The lower half never shrinks below a quarter of the upper, so a single revocation still reads.
    const down = axisTop(Math.max(Math.ceil(up / 4), ...months.map(back)));
    const sum = (k: FlowKey) => months.reduce((s, m) => s + m[k], 0);
    const peak = months.reduce<Month | null>((best, m) => (m.granted > (best?.granted ?? 0) ? m : best), null);
    const upAt = (v: number) => ({ bottom: `${(v / up) * 100}%` });
    const downAt = (v: number) => ({ top: `${(v / down) * 100}%` });
    const thisMonth = currentMonth();
    const hasCurrent = months.some((m) => m.month === thisMonth);
    const partialNote = t('rep_wo_month_partial_tip').replace(
        '{date}',
        new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
            new Date(),
        ),
    );
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
            ...(Object.keys(FLOW) as FlowKey[]).filter((k) => m[k] > 0).map((k) => `${t(FLOW[k].label)} ${count(m[k], lang)}`),
            m.month === thisMonth ? partialNote : null,
        ]
            .filter(Boolean)
            .join(', ');

    return (
        <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
            <CardTitle
                title={t('rep_ac_month_title')}
                note={
                    peak
                        ? t('rep_ac_month_peak')
                              .replace('{month}', monthLabel(peak.month, lang, false, true))
                              .replace('{n}', count(peak.granted, lang))
                        : undefined
                }
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {(Object.keys(FLOW) as FlowKey[]).map((k) => (
                            <span key={k} className="inline-flex items-center gap-1.5">
                                <FlowMark k={k} />
                                {t(FLOW[k].label)}
                                <b className="text-foreground font-mono font-semibold tabular-nums">{count(sum(k), lang)}</b>
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
            {sum('granted') + sum('revoked_work') + sum('revoked_leave') === 0 ? (
                <CardEmpty>{t('rep_ac_month_empty')}</CardEmpty>
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_ac_month_aria')
                            .replace('{from}', monthLabel(months[0].month, lang, false, true))
                            .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                            .replace('{in}', count(sum('granted'), lang))
                            .replace('{out}', count(sum('revoked_work') + sum('revoked_leave'), lang))}
                    </p>
                    <div className="flex min-h-56 flex-1 gap-2">
                        <div aria-hidden className="flex w-11 shrink-0 flex-col">
                            <div className="relative mt-[18px]" style={{ flex: up }}>
                                {[up / 2, up].map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 translate-y-1/2 font-mono text-[10.5px] leading-none tabular-nums"
                                        style={upAt(v)}
                                    >
                                        {count(v, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="h-0.5 shrink-0" />
                            <div className="relative mb-[18px]" style={{ flex: down }}>
                                <span className="text-muted-foreground absolute top-0 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-2 text-[10.5px] leading-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark k="granted" />
                                        {t('rep_ac_axis_in')}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark k="revoked_work" />
                                        {t('rep_ac_axis_out')}
                                    </span>
                                </span>
                                {[down / 2, down].map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 -translate-y-1/2 font-mono text-[10.5px] leading-none tabular-nums"
                                        style={downAt(v)}
                                    >
                                        {count(v, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="shrink-0" style={{ height: `calc(2.25rem + ${scrollbar}px)` }} />
                        </div>
                        <div ref={scroller} className={cn('flex min-w-0 flex-1 flex-col', scroll && 'overflow-x-auto overflow-y-hidden')}>
                            <div className="flex min-w-full flex-1 flex-col" style={scroll ? { width: months.length * SCROLL_MONTH_PX } : undefined}>
                                <div className="relative flex flex-1 flex-col">
                                    <div className="relative mt-[18px]" style={{ flex: up }}>
                                        <div aria-hidden>
                                            {[up / 2, up].map((v) => (
                                                <div key={v} className="border-border absolute inset-x-0 border-t" style={upAt(v)} />
                                            ))}
                                            {[up / 4, (up * 3) / 4].map((v) => (
                                                <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={upAt(v)} />
                                            ))}
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-end', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                                                    <div
                                                        ref={(el) => {
                                                            if (el) bars.current.set(m.month, el);
                                                            else bars.current.delete(m.month);
                                                        }}
                                                        className={cn('relative w-full', density.bar)}
                                                        style={{ height: `${(m.granted / up) * 100}%` }}
                                                    >
                                                        {m.month === thisMonth &&
                                                            (density.thin ? (
                                                                <span className="bg-brand absolute -top-2.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full" />
                                                            ) : (
                                                                m.granted > 0 && (
                                                                    <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                                )
                                                            ))}
                                                        {density.top && m.granted > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center font-mono text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                    m.month === thisMonth && 'text-brand',
                                                                )}
                                                            >
                                                                {count(m.granted, lang)}
                                                            </span>
                                                        )}
                                                        <span className={cn('block h-full', !density.thin && 'rounded-t-md', FILL[FLOW.granted.tone])} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div aria-hidden className="border-muted-foreground/60 border-t-2" />
                                    <div className="relative mb-[18px]" style={{ flex: down }}>
                                        <div aria-hidden>
                                            <div className="border-border absolute inset-x-0 border-t border-dashed" style={downAt(down / 2)} />
                                            <div className="border-border absolute inset-x-0 border-t" style={downAt(down)} />
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-start', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center">
                                                    <div className={cn('relative w-full', density.bar)} style={{ height: `${(back(m) / down) * 100}%` }}>
                                                        {m.month === thisMonth && !density.thin && back(m) > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] top-0 -bottom-[3px] rounded-b-md border-2 border-t-0 border-dashed" />
                                                        )}
                                                        <div className={cn('flex h-full flex-col overflow-hidden', !density.thin && 'rounded-b-md')}>
                                                            {(['revoked_work', 'revoked_leave'] as const).map((k) =>
                                                                m[k] > 0 ? (
                                                                    <span
                                                                        key={k}
                                                                        className={cn('block min-h-px w-full basis-0', FILL[FLOW[k].tone])}
                                                                        style={{ flexGrow: m[k] }}
                                                                    />
                                                                ) : null,
                                                            )}
                                                        </div>
                                                        {density.top && back(m) > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -bottom-[18px] left-1/2 -translate-x-1/2 text-center font-mono text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                    m.month === thisMonth && 'text-brand',
                                                                )}
                                                            >
                                                                {count(back(m), lang)}
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
                                                anchor={() => barTop(bars.current.get(m.month), density.top && m.granted > 0 ? 18 : 0)}
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
                                                <div className={cn('absolute top-0 text-[10.5px] whitespace-nowrap', monthLabelPlace(density, i, months.length))}>
                                                    <b className={cn('block font-semibold', m.month === thisMonth ? 'text-brand' : 'text-foreground')}>
                                                        {monthLabel(m.month, lang, false)}
                                                    </b>
                                                    <span className="text-muted-foreground tabular-nums">{m.month.slice(2, 4)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

/** A month's popover: grants by registry, then the two kinds of revocation. */
function FlowDetail({ month, partialNote }: { month: Month; partialNote: string | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const line = (key: string, mark: React.ReactNode, text: string, value: number, indent = false) => (
        <div key={key} className={cn('flex items-center justify-between gap-4', indent && 'pl-4')}>
            <span className="inline-flex items-center gap-1.5">
                {mark}
                {text}
            </span>
            <b className={cn('font-mono tabular-nums', value === 0 && 'text-muted-foreground font-normal')}>{count(value, lang)}</b>
        </div>
    );

    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {line('granted', <FlowMark k="granted" />, t(FLOW.granted.label), month.granted)}
            {ACCESS_TYPES.filter((k) => month.by_type[k] > 0).map((k) => line(k, <TypeDot type={k} />, t(`rep_ac_type_${k}`), month.by_type[k], true))}
            {line('revoked_work', <FlowMark k="revoked_work" />, t(FLOW.revoked_work.label), month.revoked_work)}
            {line('revoked_leave', <FlowMark k="revoked_leave" />, t(FLOW.revoked_leave.label), month.revoked_leave)}
            {partialNote && <div className="text-muted-foreground border-border border-t pt-1">{partialNote}</div>}
        </div>
    );
}

/* ─────────────────────────── grouped lists (leavers, resources to look after) ─────────────────────────── */

/** A days-gone pill: red past a week. */
export function DaysOut({ days }: { days: number | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (days === null) return <StatusBadge tone="red">{t('rep_ac_left_no_date')}</StatusBadge>;
    return (
        <StatusBadge tone={days > 7 ? 'red' : 'gray'} className="font-mono tabular-nums">
            {t('rep_ac_left_days').replace('{n}', count(days, lang))}
        </StatusBadge>
    );
}

/** WaitingGroup: a heading with its count, three rows, the rest folded under "แสดงทั้งหมด" with a link to the module. */
export function Group<T>({
    title,
    total,
    rows,
    first,
    render,
    link,
}: {
    title: string;
    total: string;
    rows: T[];
    first?: boolean;
    render: (row: T) => React.ReactNode;
    link?: { href: string; label: string };
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(rows, GROUP_SHOWN, open, 0);
    if (rows.length === 0) return null;
    const Icon = open ? ChevronUp : ChevronDown;

    return (
        <section>
            <h3
                className={cn(
                    'bg-muted/50 border-border text-muted-foreground flex items-baseline justify-between border-b px-5 py-2 text-xs font-semibold',
                    !first && 'border-t',
                )}
            >
                {title}
                <b className="text-foreground font-mono tabular-nums">{total}</b>
            </h3>
            <ul className={cn(open && 'max-h-80 overflow-y-auto overscroll-contain')}>{shown.map(render)}</ul>
            {folds && (
                <div className="border-border/60 flex items-center justify-between gap-3 border-t px-5 py-2 text-xs font-medium">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <Icon aria-hidden className="h-3.5 w-3.5" />
                        {open ? t('rep_chart_show_less') : t('rep_chart_show_all').replace('{n}', count(rows.length, lang))}
                    </button>
                    {link && canOpen(link.href) && (
                        <Link
                            to={link.href}
                            className="text-brand focus-visible:ring-brand inline-flex items-center gap-1 rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {link.label}
                            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                        </Link>
                    )}
                </div>
            )}
        </section>
    );
}

/** One row of a grouped list: what it is (linked), a pill on the right, the details under it, chips at the foot. */
export function GroupRow({
    head,
    side,
    sub,
    chips,
}: {
    head: React.ReactNode;
    side?: React.ReactNode;
    /** Plain details, or an element for one that needs its own colour. */
    sub: (string | React.ReactElement | null | false)[];
    chips?: React.ReactNode;
}) {
    const parts = sub.filter((s): s is string | React.ReactElement => Boolean(s));
    return (
        <li className="border-border/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b px-5 py-2.5 last:border-b-0">
            <span className="min-w-0 truncate text-sm">{head}</span>
            <span className="row-span-2">{side}</span>
            <span className="text-muted-foreground flex min-w-0 gap-x-3 text-xs" title={parts.filter((p) => typeof p === 'string').join('\n')}>
                {parts.map((part, i) => (
                    <span key={typeof part === 'string' ? part : i} className="truncate">
                        {part}
                    </span>
                ))}
            </span>
            {chips && <span className="col-span-2 mt-1 flex flex-wrap gap-1">{chips}</span>}
        </li>
    );
}

/** A resource's code (opening it on the Access page) and its name. */
export function ResourceHead({ r }: { r: Pick<AccessResource, 'type' | 'id' | 'code' | 'name'> }) {
    const canOpen = useCanOpen();
    const href = `/access?tab=${TYPE_TAB[r.type]}&view=${r.id}`;
    return (
        <>
            {canOpen(href) ? (
                <Link to={href} className={CODE_LINK} translate="no">
                    {r.code}
                </Link>
            ) : (
                <span className="font-mono text-xs font-semibold" translate="no">
                    {r.code}
                </span>
            )}
            <span className="ml-2">{r.name}</span>
        </>
    );
}

/** A person's name (opening them on the Employees page) and their code. */
function PersonHead({ id, name, code }: { id: number; name: string; code: string }) {
    const canOpen = useCanOpen();
    const href = `/employees?view=${id}`;
    return (
        <>
            {canOpen(href) ? (
                <Link to={href} className="text-brand focus-visible:ring-brand rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none">
                    {name}
                </Link>
            ) : (
                <span className="font-medium">{name}</span>
            )}
            <span className="text-muted-foreground ml-2 font-mono text-xs">{code}</span>
        </>
    );
}

/** A right-hand card that keeps the height of the card beside it and scrolls inside (side by side from lg). */
export const SIDE_CARD = 'flex flex-col overflow-hidden xl:col-span-2 lg:[contain:size] lg:min-h-96';
export const SIDE_BODY = 'flex min-h-0 flex-1 flex-col lg:overflow-y-auto lg:overscroll-contain';

/** A right-hand card of grouped lists: grows with its rows (three a group, an opened group scrolls inside itself). */
const GROUP_CARD = 'flex flex-col overflow-hidden xl:col-span-2';

function LeaversCard({ leavers }: { leavers: AccessOverviewBreakdown['leavers'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <Card className={GROUP_CARD}>
            <CardTitle title={t('rep_ac_leavers_title')} sub={t('rep_ac_leavers_sub')} />
            {leavers.people.length === 0 && leavers.owned.length === 0 ? (
                <CardEmpty>
                    <span className="flex flex-col gap-1">
                        <span className="text-foreground font-medium">{t('rep_ac_leavers_empty')}</span>
                        <span className="text-xs">{t('rep_ac_leavers_empty_sub').replace('{n}', count(leavers.resigned, lang))}</span>
                    </span>
                </CardEmpty>
            ) : (
                <div className="flex flex-col">
                    <Group
                        first
                        title={t('rep_ac_leavers_holding')}
                        total={t('rep_ac_people_n').replace('{n}', count(leavers.people.length, lang))}
                        rows={leavers.people}
                        render={(p) => (
                            <GroupRow
                                key={p.employee_id}
                                head={<PersonHead id={p.employee_id} name={p.name} code={p.code} />}
                                side={<DaysOut days={p.days} />}
                                sub={[
                                    deptName(p.department, lang),
                                    p.last_day ? t('rep_ac_last_day').replace('{date}', shortDate(p.last_day, lang)) : null,
                                    t('rep_ac_grants_n').replace('{n}', count(p.grants.length, lang)),
                                ]}
                                chips={p.grants.map((g) => (
                                    <span
                                        key={`${g.type}-${g.id}`}
                                        title={t(`rep_ac_type_${g.type}`)}
                                        className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]"
                                    >
                                        <TypeDot type={g.type} />
                                        {g.name}
                                    </span>
                                ))}
                            />
                        )}
                    />
                    <Group
                        first={leavers.people.length === 0}
                        title={t('rep_ac_leavers_owned')}
                        total={count(leavers.owned.length, lang)}
                        rows={leavers.owned}
                        render={(r) => (
                            <GroupRow
                                key={`${r.type}-${r.id}`}
                                head={<ResourceHead r={r} />}
                                side={<DaysOut days={r.owner.days} />}
                                sub={[t('rep_ac_owner_named').replace('{name}', `${r.owner.name} · ${r.owner.code}`), t('rep_ac_find_owner')]}
                            />
                        )}
                    />
                </div>
            )}
        </Card>
    );
}

function CareCard({ care }: { care: AccessOverviewBreakdown['care'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const row = (r: AccessResource, note: string | null) => (
        <GroupRow
            key={`${r.type}-${r.id}`}
            head={<ResourceHead r={r} />}
            side={<TypeLabel type={r.type} />}
            sub={[r.detail, deptName(r.department, lang), note]}
        />
    );

    return (
        <Card className={GROUP_CARD}>
            <CardTitle title={t('rep_ac_care_title')} sub={t('rep_ac_care_sub')} />
            {care.owner_gone.length + care.no_owner.length + care.empty.length === 0 ? (
                <CardEmpty>{t('rep_ac_care_none')}</CardEmpty>
            ) : (
                <div className="flex flex-col">
                    <Group
                        first
                        title={t('rep_ac_care_owner_gone')}
                        total={count(care.owner_gone.length, lang)}
                        rows={care.owner_gone}
                        render={(r) =>
                            row(
                                r,
                                r.owner
                                    ? t('rep_ac_care_owner_left')
                                          .replace('{name}', r.owner.name)
                                          .replace('{date}', r.owner.last_day ? shortDate(r.owner.last_day, lang) : '—')
                                    : null,
                            )
                        }
                    />
                    <Group
                        first={care.owner_gone.length === 0}
                        title={t('rep_ac_care_no_owner')}
                        total={count(care.no_owner.length, lang)}
                        rows={care.no_owner}
                        render={(r) => row(r, null)}
                    />
                    <Group
                        first={care.owner_gone.length + care.no_owner.length === 0}
                        title={t('rep_ac_care_empty')}
                        total={count(care.empty.length, lang)}
                        rows={care.empty}
                        render={(r) => row(r, null)}
                    />
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── departments ─────────────────────────── */

/** The registries in a department's grants, one bar on the card's scale with the counts in the pieces. */
function TypeBar({ byType, scale }: { byType: Record<AccessType, number>; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const parts = ACCESS_TYPES.filter((k) => byType[k] > 0);
    const total = parts.reduce((s, k) => s + byType[k], 0);
    if (total === 0) return <span className="text-muted-foreground">—</span>;

    return (
        <div className="bg-muted h-5 min-w-[9rem] overflow-hidden rounded-full">
            <div
                role="img"
                aria-label={parts.map((k) => `${t(`rep_ac_type_${k}`)} ${count(byType[k], lang)}`).join(', ')}
                className="flex h-full gap-px"
                style={{ width: `max(${(total / scale) * 100}%, ${parts.length * 1.75}rem)` }}
            >
                {parts.map((k) => (
                    <span
                        key={k}
                        title={`${t(`rep_ac_type_${k}`)}: ${count(byType[k], lang)}`}
                        className={cn(
                            'flex min-w-[1.5rem] basis-0 items-center justify-center font-mono text-[10.5px] font-semibold text-white tabular-nums [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]',
                            FILL[TYPE_TONE[k]],
                        )}
                        style={{ flexGrow: byType[k] }}
                    >
                        {count(byType[k], lang)}
                    </span>
                ))}
            </div>
        </div>
    );
}

function DepartmentCard({ departments }: { departments: AccessOverviewBreakdown['departments'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(departments, ROWS_SHOWN, open);
    const scale = Math.max(1, ...departments.map((d) => d.grants));
    const sumOf = (k: 'staff' | 'holders' | 'grants' | 'leavers') => departments.reduce((s, d) => s + d[k], 0);
    const totalByType = Object.fromEntries(ACCESS_TYPES.map((k) => [k, departments.reduce((s, d) => s + d.by_type[k], 0)])) as Record<AccessType, number>;
    const used = ACCESS_TYPES.filter((k) => totalByType[k] > 0);
    const flag = (v: number) =>
        v > 0 ? (
            <StatusBadge tone="red" className="font-mono tabular-nums">
                {count(v, lang)}
            </StatusBadge>
        ) : (
            <span className="text-muted-foreground font-mono">0</span>
        );

    return (
        <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
            <CardTitle
                title={t('rep_ac_dept_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{t('rep_ac_dept_sub')}</span>
                        {used.map((k) => (
                            <TypeLabel key={k} type={k} />
                        ))}
                    </span>
                }
            />
            {departments.length === 0 ? (
                <CardEmpty>{t('rep_ac_empty')}</CardEmpty>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_ac_dept_title')}</caption>
                            <thead>
                                <tr className="bg-muted/40 border-border border-b">
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_ac_dept_col_name')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_ac_dept_col_people')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_ac_dept_col_grants')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'w-1/2 text-left')}>
                                        {t('rep_ac_dept_col_types')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_ac_dept_col_leavers')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((d) => (
                                    <tr key={d.department_id ?? 'none'} className="border-border/60 border-b last:border-b-0">
                                        <th
                                            scope="row"
                                            className={cn(TD, 'max-w-[12rem] truncate text-left font-medium', d.name === null && 'text-muted-foreground font-normal')}
                                        >
                                            {deptName(d.name === null ? null : { name: d.name, name_th: d.name_th }, lang) ?? t('rep_ac_no_department')}
                                        </th>
                                        <td className={cn(TD, NUM)}>
                                            {count(d.holders, lang)} <span className="text-muted-foreground">/ {count(d.staff, lang)}</span>
                                        </td>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{count(d.grants, lang)}</td>
                                        <td className={TD}>
                                            <TypeBar byType={d.by_type} scale={scale} />
                                        </td>
                                        <td className={cn(TD, 'text-right')}>{flag(d.leavers)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-muted/40 border-border border-t font-semibold">
                                    <th scope="row" className={cn(TD, 'text-left')}>
                                        {t('rep_ac_dept_total').replace('{n}', count(departments.length, lang))}
                                    </th>
                                    <td className={cn(TD, NUM)}>
                                        {count(sumOf('holders'), lang)} <span className="text-muted-foreground font-normal">/ {count(sumOf('staff'), lang)}</span>
                                    </td>
                                    <td className={cn(TD, NUM)}>{count(sumOf('grants'), lang)}</td>
                                    <td className={TD}>
                                        <TypeBar byType={totalByType} scale={sumOf('grants')} />
                                    </td>
                                    <td className={cn(TD, 'text-right')}>{flag(sumOf('leavers'))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={departments.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="overflow-hidden lg:col-span-2 xl:col-span-3">
                    <CardHeadingSkeleton />
                    <ChartSkeleton />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={4} />
                </Card>
            </div>
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="overflow-hidden lg:col-span-2 xl:col-span-3">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={6} />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={4} />
                </Card>
            </div>
        </div>
    );
}

export function AccessOverviewCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAccessOverviewBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <MonthFlowCard months={data.months} />
                <LeaversCard leavers={data.leavers} />
            </div>
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <DepartmentCard departments={data.departments} />
                <CareCard care={data.care} />
            </div>
        </div>
    );
}
