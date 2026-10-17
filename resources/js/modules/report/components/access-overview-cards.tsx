// Access overview report cards: type / state segments, grants and revocations by month, leavers, departments, resources to look after (data: useAccessOverviewBreakdown).
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { StatusBadge } from '@/shared/components/status-badge';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAccessOverviewBreakdown } from '../hooks/use-reports';
import type { AccessOverviewBreakdown, AccessResource, AccessType, ChartTone, TabularFilters } from '../types';
import { count, deptName, PieceBar } from './access-parts';
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
    shortYear,
} from './chart-parts';
import { FILL } from './chart-tones';
import { BASIS_PCT, H_PCT, pct } from './percent-classes';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { shortDate } from './transfer-cards';
import { niceMax } from './weekly-ticket-chart';

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
export const NUM = 'text-right tabular-nums';
export const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';
const SEGMENT =
    'focus-visible:ring-brand focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none';

/** Scroll to the list under the cards, without motion when the reader asks for none. */
export function scrollToRows() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('report-rows')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

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
        <div
            role="group"
            aria-label={label}
            className="border-border bg-card dark:bg-background inline-flex flex-wrap gap-0.5 rounded-md border p-0.5"
        >
            {options.map((o) => (
                <button
                    key={o.value ?? 'all'}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        SEGMENT,
                        size === 'md' ? 'h-8 px-3' : 'h-6 px-2.5 [@media(pointer:coarse)]:h-9',
                        value === o.value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    {o.label}
                    {o.count !== null && <span>{count(o.count, lang)}</span>}
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
            options={(['active', 'revoked', 'all'] as const).map((s) => ({
                value: s as string,
                label: t(`rep_ac_state_${s}`),
                count: data ? data.states[s] : null,
            }))}
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

function MonthFlowCard({ months, cardRef, heldHeight }: { months: Month[]; cardRef: React.Ref<HTMLDivElement>; heldHeight: number | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const back = (m: Month) => m.revoked_work + m.revoked_leave;
    const up = axisTop(Math.max(0, ...months.map((m) => m.granted)));
    // The lower half never shrinks below a quarter of the upper, so a single revocation still reads.
    const down = axisTop(Math.max(Math.ceil(up / 4), ...months.map(back)));
    const sum = (k: FlowKey) => months.reduce((s, m) => s + m[k], 0);
    const peak = months.reduce<Month | null>((best, m) => (m.granted > (best?.granted ?? 0) ? m : best), null);
    // The upper and lower halves share the plot by their axis tops; lines and labels sit at quarters of each.
    const split = pct(up, up + down);
    const thisMonth = currentMonth();
    const hasCurrent = months.some((m) => m.month === thisMonth);
    const partialNote = t('rep_wo_month_partial_tip').replace('{date}', reportDates(lang).date(new Date()));
    const density = monthDensity(months);
    const bars = useRef(new Map<string, HTMLElement>());
    const monthText = (m: Month) =>
        [
            monthLabel(m.month, lang, false, true),
            ...(Object.keys(FLOW) as FlowKey[]).filter((k) => m[k] > 0).map((k) => `${t(FLOW[k].label)} ${count(m[k], lang)}`),
            m.month === thisMonth ? partialNote : null,
        ]
            .filter(Boolean)
            .join(', ');

    return (
        <Card ref={cardRef} className="flex flex-col overflow-hidden lg:sticky lg:top-4 lg:col-span-2 xl:col-span-3" style={heldStyle(heldHeight)}>
            <CardTitle
                title={t('rep_ac_month_title')}
                info={
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
                                        <FlowMark k="granted" />
                                        {t('rep_ac_axis_in')}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark k="revoked_work" />
                                        {t('rep_ac_axis_out')}
                                    </span>
                                </span>
                                {[
                                    [down / 2, 'top-1/2'],
                                    [down, 'top-full'],
                                ].map(([v, at]) => (
                                    <span
                                        key={at}
                                        className={cn(
                                            'text-muted-foreground absolute right-0 -translate-y-1/2 text-[10.5px] leading-none tabular-nums',
                                            at,
                                        )}
                                    >
                                        {count(v as number, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="h-9 shrink-0" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex min-w-full flex-1 flex-col">
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
                                                        className={cn('relative w-full', density.bar, H_PCT[pct(m.granted, up)])}
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
                                                                    'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                    m.month === thisMonth && 'text-brand',
                                                                )}
                                                            >
                                                                {count(m.granted, lang)}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={cn('block h-full', !density.thin && 'rounded-t-md', FILL[FLOW.granted.tone])}
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
                                                    <div className={cn('relative w-full', density.bar, H_PCT[pct(back(m), down)])}>
                                                        {m.month === thisMonth && !density.thin && back(m) > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] top-0 -bottom-[3px] rounded-b-md border-2 border-t-0 border-dashed" />
                                                        )}
                                                        <div className={cn('flex h-full flex-col overflow-hidden', !density.thin && 'rounded-b-md')}>
                                                            {(['revoked_work', 'revoked_leave'] as const).map((k) =>
                                                                m[k] > 0 ? (
                                                                    <span
                                                                        key={k}
                                                                        className={cn(
                                                                            'block min-h-px w-full shrink-0',
                                                                            H_PCT[pct(m[k], back(m))],
                                                                            FILL[FLOW[k].tone],
                                                                        )}
                                                                    />
                                                                ) : null,
                                                            )}
                                                        </div>
                                                        {density.top && back(m) > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -bottom-[18px] left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
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
            <b className={cn('tabular-nums', value === 0 && 'text-muted-foreground font-normal')}>{count(value, lang)}</b>
        </div>
    );

    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {line('granted', <FlowMark k="granted" />, t(FLOW.granted.label), month.granted)}
            {ACCESS_TYPES.filter((k) => month.by_type[k] > 0).map((k) =>
                line(k, <TypeDot type={k} />, t(`rep_ac_type_${k}`), month.by_type[k], true),
            )}
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
        <StatusBadge tone={days > 7 ? 'red' : 'gray'} className="tabular-nums">
            {t('rep_ac_left_days').replace('{n}', count(days, lang))}
        </StatusBadge>
    );
}

/** WaitingGroup: a heading with its count, three rows, the rest folded under "แสดงทั้งหมด". */
export function Group<T>({
    title,
    total,
    rows,
    first,
    render,
    open: openProp,
    onToggle,
}: {
    title: string;
    total: string;
    rows: T[];
    first?: boolean;
    render: (row: T) => React.ReactNode;
    /** Set both to let the page know when the group opens. */
    open?: boolean;
    onToggle?: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [ownOpen, setOwnOpen] = useState(false);
    const open = openProp ?? ownOpen;
    const toggle = onToggle ?? (() => setOwnOpen((v) => !v));
    const { folds, shown } = fold(rows, GROUP_SHOWN, open, 0);
    if (rows.length === 0) return null;
    const Icon = open ? ChevronUp : ChevronDown;

    return (
        <section>
            <h3
                className={cn(
                    TABLE_HEAD,
                    'border-border text-muted-foreground flex items-baseline justify-between border-b px-5 py-2 text-xs font-semibold',
                    !first && 'border-t',
                )}
            >
                {title}
                <b className="text-foreground tabular-nums">{total}</b>
            </h3>
            <ul className={cn(open && 'max-h-80 overflow-y-auto overscroll-contain')}>{shown.map(render)}</ul>
            {folds && (
                <div className="border-border/60 border-t px-5 py-2 text-xs font-medium">
                    <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={open}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <Icon aria-hidden className="h-3.5 w-3.5" />
                        {open ? t('rep_chart_show_less') : t('rep_chart_show_all').replace('{n}', count(rows.length, lang))}
                    </button>
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
    className,
    inert,
}: {
    head: React.ReactNode;
    side?: React.ReactNode;
    className?: string;
    /** Shown only as a glimpse: not reachable by keyboard or screen reader. */
    inert?: boolean;
    /** Plain details, or an element for one that needs its own colour. */
    sub: (string | React.ReactElement | null | false)[];
    chips?: React.ReactNode;
}) {
    const parts = sub.filter((s): s is string | React.ReactElement => Boolean(s));
    return (
        <li
            inert={inert}
            className={cn(
                'border-border/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b px-5 py-2.5 last:border-b-0',
                className,
            )}
        >
            <span className="min-w-0 truncate text-sm">{head}</span>
            <span className="row-span-2">{side}</span>
            <span
                className="text-muted-foreground flex min-w-0 flex-wrap gap-x-3 text-xs"
                title={parts.filter((p) => typeof p === 'string').join('\n')}
            >
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
                <span className="text-xs font-semibold" translate="no">
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
                <Link
                    to={href}
                    className="text-brand focus-visible:ring-brand rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {name}
                </Link>
            ) : (
                <span className="font-medium">{name}</span>
            )}
            <span className="text-muted-foreground ml-2 text-xs">{code}</span>
        </>
    );
}

/** A right-hand card of grouped lists: grows with its rows (three a group, an opened group scrolls inside itself). */
const GROUP_CARD = 'flex flex-col overflow-hidden lg:sticky lg:top-4 xl:col-span-2';

function LeaversCard({
    leavers,
    cardRef,
    heldHeight,
    open,
    onToggle,
}: {
    leavers: AccessOverviewBreakdown['leavers'];
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
    open: Record<LeaverGroup, boolean>;
    onToggle: (group: LeaverGroup) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <Card ref={cardRef} className={GROUP_CARD} style={heldStyle(heldHeight)}>
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
                        open={open.people}
                        onToggle={() => onToggle('people')}
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
                        open={open.owned}
                        onToggle={() => onToggle('owned')}
                        render={(r) => (
                            <GroupRow
                                key={`${r.type}-${r.id}`}
                                head={<ResourceHead r={r} />}
                                side={<DaysOut days={r.owner.days} />}
                                sub={[t('rep_ac_owner_named').replace('{name}', `${r.owner.name} (${r.owner.code})`), t('rep_ac_find_owner')]}
                            />
                        )}
                    />
                </div>
            )}
        </Card>
    );
}

function CareCard({
    care,
    cardRef,
    heldHeight,
    open,
    onToggle,
}: {
    care: AccessOverviewBreakdown['care'];
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
    open: Record<CareGroup, boolean>;
    onToggle: (group: CareGroup) => void;
}) {
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
        <Card ref={cardRef} className={GROUP_CARD} style={heldStyle(heldHeight)}>
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
                        open={open.gone}
                        onToggle={() => onToggle('gone')}
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
                        open={open.no_owner}
                        onToggle={() => onToggle('no_owner')}
                        render={(r) => row(r, null)}
                    />
                    <Group
                        first={care.owner_gone.length + care.no_owner.length === 0}
                        title={t('rep_ac_care_empty')}
                        total={count(care.empty.length, lang)}
                        rows={care.empty}
                        open={open.empty}
                        onToggle={() => onToggle('empty')}
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
    if (ACCESS_TYPES.every((k) => byType[k] === 0)) return <span className="text-muted-foreground">—</span>;
    return (
        <PieceBar
            className="min-w-[9rem]"
            scale={scale}
            pieces={ACCESS_TYPES.map((k) => ({ key: k, value: byType[k], fill: FILL[TYPE_TONE[k]], label: t(`rep_ac_type_${k}`) }))}
        />
    );
}

/** One column width set for a table and its separate total table, so their columns line up. */
export function Cols({ widths }: { widths: string[] }) {
    return (
        <colgroup>
            {widths.map((w, i) => (
                <col key={i} className={w} />
            ))}
        </colgroup>
    );
}

/** แผนก · พนักงาน · สิทธิ์ · ตามประเภท · ผู้ลาออก */
const DEPT_COLS = ['w-[24%]', 'w-[13%]', 'w-[9%]', 'w-[42%]', 'w-[12%]'];

function DepartmentCard({
    departments,
    cardRef,
    heldHeight,
    open,
    onToggle,
}: {
    departments: AccessOverviewBreakdown['departments'];
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
    open: boolean;
    onToggle: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { folds, shown } = fold(departments, ROWS_SHOWN, open);
    const scale = Math.max(1, ...departments.map((d) => d.grants));
    const sumOf = (k: 'staff' | 'holders' | 'grants' | 'leavers') => departments.reduce((s, d) => s + d[k], 0);
    const totalByType = Object.fromEntries(ACCESS_TYPES.map((k) => [k, departments.reduce((s, d) => s + d.by_type[k], 0)])) as Record<
        AccessType,
        number
    >;
    const used = ACCESS_TYPES.filter((k) => totalByType[k] > 0);
    const flag = (v: number) =>
        v > 0 ? (
            <StatusBadge tone="red" className="tabular-nums">
                {count(v, lang)}
            </StatusBadge>
        ) : (
            <span className="text-muted-foreground">0</span>
        );

    return (
        <Card ref={cardRef} className="flex flex-col overflow-hidden lg:sticky lg:top-4 lg:col-span-2 xl:col-span-3" style={heldStyle(heldHeight)}>
            <CardTitle
                title={t('rep_ac_dept_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {used.map((k) => (
                            <TypeLabel key={k} type={k} />
                        ))}
                    </span>
                }
            />
            {departments.length === 0 ? (
                <CardEmpty>{t('rep_ac_empty')}</CardEmpty>
            ) : (
                <div className="relative flex flex-1 flex-col overflow-x-auto">
                    <table className="w-full min-w-[36rem] table-fixed text-sm">
                        <caption className="sr-only">{t('rep_ac_dept_title')}</caption>
                        <Cols widths={DEPT_COLS} />
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_ac_dept_col_name')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_ac_dept_col_people')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_ac_dept_col_grants')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
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
                                        className={cn(
                                            TD,
                                            'max-w-[12rem] truncate text-left font-medium',
                                            d.name === null && 'text-muted-foreground font-normal',
                                        )}
                                        title={
                                            deptName(d.name === null ? null : { name: d.name, name_th: d.name_th }, lang) ?? t('rep_ac_no_department')
                                        }
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
                        </tbody>
                    </table>
                    {folds && (
                        <div>
                            <FoldToggle open={open} total={departments.length} onToggle={onToggle} />
                        </div>
                    )}
                    {/* The total stays at the card's foot however tall the card beside it makes this one. */}
                    <table className="bg-muted/40 border-border mt-auto w-full min-w-[36rem] table-fixed border-t text-sm font-semibold">
                        <caption className="sr-only">{t('rep_ac_dept_total').replace('{n}', count(departments.length, lang))}</caption>
                        <Cols widths={DEPT_COLS} />
                        <tbody>
                            <tr>
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_ac_dept_total').replace('{n}', count(departments.length, lang))}
                                </th>
                                <td className={cn(TD, NUM)}>
                                    {count(sumOf('holders'), lang)}{' '}
                                    <span className="text-muted-foreground font-normal">/ {count(sumOf('staff'), lang)}</span>
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

const ROW = 'grid gap-3 lg:grid-cols-3 xl:grid-cols-5';
const LEAVER_GROUPS = ['people', 'owned'] as const;
const CARE_GROUPS = ['gone', 'no_owner', 'empty'] as const;
const BOTTOM_FOLDS = ['dept', ...CARE_GROUPS] as const;
type LeaverGroup = (typeof LEAVER_GROUPS)[number];
type CareGroup = (typeof CARE_GROUPS)[number];

/** Two cards in a row: the same height while every list is folded; once one opens, both keep that height and the shorter stays in view. */
export function useFoldRow<K extends string>(keys: readonly K[]) {
    const [open, setOpen] = useState(() => Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>);
    const [held, setHeld] = useState<[number, number] | null>(null);
    const left = useRef<HTMLDivElement>(null);
    const right = useRef<HTMLDivElement>(null);
    const anyOpen = keys.some((k) => open[k]);
    const toggle = (key: K) => {
        const next = { ...open, [key]: !open[key] };
        const willOpen = keys.some((k) => next[k]);
        if (willOpen && !anyOpen) setHeld([left.current?.offsetHeight ?? 0, right.current?.offsetHeight ?? 0]);
        if (!willOpen) setHeld(null);
        setOpen(next);
    };
    return { open, toggle, anyOpen, left, right, heldLeft: anyOpen ? (held?.[0] ?? null) : null, heldRight: anyOpen ? (held?.[1] ?? null) : null };
}

/** A held min-height for a card beside an opened list. */
export const heldStyle = (height: number | null) => (height ? { minHeight: height } : undefined);

export function AccessOverviewCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAccessOverviewBreakdown(filters);
    const top = useFoldRow(LEAVER_GROUPS);
    const bottom = useFoldRow(BOTTOM_FOLDS);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className={cn(ROW, top.anyOpen && 'lg:items-start')}>
                <MonthFlowCard months={data.months} cardRef={top.left} heldHeight={top.heldLeft} />
                <LeaversCard leavers={data.leavers} cardRef={top.right} heldHeight={top.heldRight} open={top.open} onToggle={top.toggle} />
            </div>
            <div className={cn(ROW, bottom.anyOpen && 'lg:items-start')}>
                <DepartmentCard
                    departments={data.departments}
                    cardRef={bottom.left}
                    heldHeight={bottom.heldLeft}
                    open={bottom.open.dept}
                    onToggle={() => bottom.toggle('dept')}
                />
                <CareCard care={data.care} cardRef={bottom.right} heldHeight={bottom.heldRight} open={bottom.open} onToggle={bottom.toggle} />
            </div>
        </div>
    );
}
