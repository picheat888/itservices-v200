/**
 * The "สรุปผล SLA ของ Ticket จากคำขอ" page's own parts (pages/tickets-request-sla.tsx), from the design mockup:
 *
 * - "ผลตามประเภทคำขอ": one line per request type — its ticket count split into ทั้งหมด / เสร็จสิ้น /
 *   ยกเลิก / ยังเปิด, then "taken in time" and "closed in time" each as a 0–100% bar with its
 *   met/n and %, then the two average times. A bar is exactly its met/n (open and canceled cases
 *   are not in it) and is green at or above the SLA goal, red below — however few the cases.
 *   A press on a line filters the page to that type (press again to clear).
 * - "ยังเปิดอยู่": the tickets still open and already past their SLA, most overdue first.
 * - "เกณฑ์ SLA ที่ใช้วัด": the first-response and resolution targets the verdicts used.
 *
 * All of it reads useRequestSlaBreakdown (TicketRequestSlaReport::breakdown) — every type, so a
 * picked one is highlighted among the rest rather than left alone.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useRequestSlaBreakdown } from '../hooks/use-reports';
import type { RequestSlaBreakdown, RequestSlaTally, TabularFilters } from '../types';
import { Heading, Swatch } from './backlog-board';

export type T = (key: string) => string;

/** The backlog page, narrowed to tickets from requests that are past SLA — where "ยังเปิดอยู่" continues. */
const BACKLOG_HREF = '/reports/tickets-backlog?source=auto_request&sla=over_sla';
const SLA_SETTINGS_HREF = '/settings?tab=tickets';

const percent = (met: number, n: number) => (n === 0 ? null : Math.round((met / n) * 100));

/** One decimal in the reader's locale ("10.1"), the way every time on this page reads. */
export function oneDecimal(value: number, lang: 'th' | 'en'): string {
    return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** "9.7 ชม." / "20 นาที" — an average time under an hour reads in minutes. */
export function hoursText(t: T, lang: 'th' | 'en', hours: number | null): string {
    if (hours === null) return '—';
    return hours < 1 ? t('rep_rs_minutes').replace('{n}', String(Math.round(hours * 60))) : `${oneDecimal(hours, lang)} ${t('rep_hours')}`;
}

/** "25 วัน" / "5 ชม." — the same rule as the time-left pills. */
export function spanText(t: T, hours: number): string {
    return hours < 24
        ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(hours))))
        : t('rep_days_n').replace('{n}', String(Math.round(hours / 24)));
}

/** "Y-m-d H:i" → "9 ก.ย. 14:20". */
export function shortMoment(value: string | null, lang: 'th' | 'en'): string {
    if (!value) return '—';
    const [date, time = ''] = value.split(' ');
    const [y, m, d] = date.split('-').map(Number);
    const day = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short' }).format(
        new Date(y, m - 1, d),
    );
    return `${day} ${time}`.trim();
}

export const TH = 'text-muted-foreground px-3 py-2.5 text-[11.5px] font-semibold tracking-wide whitespace-nowrap';
export const TD = 'px-3 py-2.5 whitespace-nowrap';
/** A rule before each column group: จำนวน Ticket | รับเคสทัน SLA | ปิดทัน SLA | average times. */
export const GROUP = 'border-border border-l';

/** The ticket count, split — one cell each; a zero reads faint. */
export function CountCells({ tally }: { tally: RequestSlaTally }) {
    return (
        <>
            {[tally.total, tally.completed, tally.canceled, tally.open].map((value, i) => (
                <td key={i} className={cn(TD, 'text-right font-mono', i === 0 && GROUP, value === 0 && 'text-muted-foreground/60')}>
                    {value.toLocaleString()}
                </td>
            ))}
        </>
    );
}

/** One SLA: the 0–100% bar, met/n, and the % — green at or above the goal, red below it. */
export function SlaCells({ met, n, goal, label }: { met: number; n: number; goal: number; label: string }) {
    const pct = percent(met, n);
    const ok = pct !== null && pct >= goal;
    return (
        <>
            <td className={cn(TD, GROUP, 'w-48 min-w-32 pr-1.5')}>
                <span
                    className="bg-muted block h-3 overflow-hidden rounded-[3px]"
                    role="img"
                    aria-label={pct === null ? `${label}: —` : `${label}: ${met}/${n} (${pct}%)`}
                >
                    {pct !== null && (
                        <span className={cn('block h-full rounded-l-[3px]', ok ? 'bg-emerald-400' : 'bg-red-400')} style={{ width: `${pct}%` }} />
                    )}
                </span>
            </td>
            <td className={cn(TD, 'text-muted-foreground px-1.5 text-right font-mono text-xs')}>{pct === null ? '—' : `${met}/${n}`}</td>
            <td
                className={cn(
                    TD,
                    'min-w-14 pl-1 text-right font-mono font-bold',
                    pct === null ? 'text-muted-foreground' : ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                )}
            >
                {pct === null ? '—' : `${pct}%`}
            </td>
        </>
    );
}

function TypesCard({ data, filters, patch }: { data: RequestSlaBreakdown; filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const goal = data.rules.goal;
    const active = (filters.request_type as string | null | undefined) ?? null;
    const pick = (type: string) => patch({ request_type: active === type ? null : type });

    const line = (tally: RequestSlaTally) => (
        <>
            <CountCells tally={tally} />
            <SlaCells met={tally.take_met} n={tally.take_total} goal={goal} label={t('rep_rs_col_take')} />
            <SlaCells met={tally.close_met} n={tally.close_total} goal={goal} label={t('rep_rs_col_close')} />
            <td className={cn(TD, GROUP, 'text-right')}>{hoursText(t, lang, tally.take_avg_hours)}</td>
            <td className={cn(TD, 'text-right')}>{hoursText(t, lang, tally.fix_avg_hours)}</td>
        </>
    );

    return (
        <Card className="overflow-hidden">
            <Heading
                title={
                    <span className="flex flex-wrap items-baseline gap-x-2">
                        {t('rep_rs_types_title')}
                        <span className="text-muted-foreground text-xs font-normal">{t('rep_rs_types_sub')}</span>
                    </span>
                }
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone="bg-emerald-400">{t('rep_rs_at_goal').replace('{n}', String(goal))}</Swatch>
                        <Swatch tone="bg-red-400">{t('rep_rs_below_goal')}</Swatch>
                    </span>
                }
            />
            {data.types.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_rs_empty')}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted/40">
                                <th rowSpan={2} scope="col" className={cn(TH, 'border-border border-b text-left align-bottom')}>
                                    {t('rep_c_request_type')}
                                </th>
                                <th colSpan={4} scope="colgroup" className={cn(TH, GROUP, 'border-border border-b text-left')}>
                                    {t('rep_rs_col_count')}
                                </th>
                                <th
                                    rowSpan={2}
                                    colSpan={3}
                                    scope="colgroup"
                                    title={t('rep_rs_col_take_hint')}
                                    className={cn(TH, GROUP, 'border-border border-b text-left align-bottom')}
                                >
                                    {t('rep_rs_col_take')}
                                </th>
                                <th
                                    rowSpan={2}
                                    colSpan={3}
                                    scope="colgroup"
                                    title={t('rep_rs_col_close_hint')}
                                    className={cn(TH, GROUP, 'border-border border-b text-left align-bottom')}
                                >
                                    {t('rep_rs_col_close')}
                                </th>
                                <th rowSpan={2} scope="col" className={cn(TH, GROUP, 'border-border border-b text-right align-bottom')}>
                                    {t('rep_rs_col_take_avg')}
                                </th>
                                <th rowSpan={2} scope="col" className={cn(TH, 'border-border border-b text-right align-bottom')}>
                                    {t('rep_rs_col_fix_avg')}
                                </th>
                            </tr>
                            <tr className="bg-muted/40 border-border border-b">
                                <th scope="col" className={cn(TH, GROUP, 'pt-1 text-right')}>
                                    {t('rep_rs_col_all')}
                                </th>
                                <th scope="col" className={cn(TH, 'pt-1 text-right')}>
                                    {t('rep_rs_completed')}
                                </th>
                                <th scope="col" className={cn(TH, 'pt-1 text-right')}>
                                    {t('rep_rs_canceled')}
                                </th>
                                <th scope="col" className={cn(TH, 'pt-1 text-right')}>
                                    {t('rep_rs_open')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.types.map((row) => {
                                const selected = active === row.type;
                                return (
                                    // The row filters the page; keyboard and screen readers reach it through the
                                    // button in its name cell, whose click bubbles up to the row (one handler).
                                    <tr
                                        key={row.type}
                                        onClick={() => pick(row.type)}
                                        className={cn(
                                            'border-border/60 cursor-pointer border-b',
                                            selected
                                                ? 'bg-brand/10 [&>th:first-child]:shadow-[inset_3px_0_0_var(--color-brand)]'
                                                : 'hover:bg-accent/50',
                                        )}
                                    >
                                        <th scope="row" className={cn(TD, 'text-left font-semibold')}>
                                            <button
                                                type="button"
                                                aria-pressed={selected}
                                                title={t(selected ? 'rep_bl_filter_clear' : 'rep_bl_filter_hint')}
                                                className="focus-visible:ring-brand rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                                            >
                                                {t(`req_${row.type}`)}
                                            </button>
                                        </th>
                                        {line(row)}
                                    </tr>
                                );
                            })}
                            <tr className="bg-muted/40 font-semibold">
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_rs_total_row').replace('{n}', String(data.types.length))}
                                </th>
                                {line(data.overall)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
            {data.empty_types.length > 0 && data.types.length > 0 && (
                <div className="text-muted-foreground border-border border-t px-5 py-2.5 text-xs">
                    {t('rep_rs_none_types').replace('{list}', data.empty_types.map((type) => t(`req_${type}`)).join(', '))}
                </div>
            )}
        </Card>
    );
}

/** How many tickets "ยังเปิดอยู่" lists before folding the rest into a count. */
const OPEN_SHOWN = 3;

function OpenCard({ data }: { data: RequestSlaBreakdown }) {
    const t = useT();
    const canOpen = useCanOpen();
    const lang = useUiStore((s) => s.lang);
    const shown = data.open.slice(0, OPEN_SHOWN);

    return (
        <Card className="flex flex-col overflow-hidden">
            <Heading
                title={t('rep_rs_open_title')}
                sub={data.open.length > 0 ? t('rep_rs_open_sub').replace('{n}', String(data.open.length)) : undefined}
            />
            {data.open.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('rep_rs_open_none')}</div>
            ) : (
                <div>
                    {shown.map((o) => {
                        const href = `/tickets?view=${o.id}`;
                        return (
                            <div
                                key={o.id}
                                className="border-border/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b px-5 py-2.5 text-sm last:border-b-0"
                            >
                                <span className="truncate">
                                    {canOpen(href) ? (
                                        <Link to={href} className="font-mono text-xs font-bold hover:underline">
                                            {o.ticket_no}
                                        </Link>
                                    ) : (
                                        <span className="font-mono text-xs font-bold">{o.ticket_no}</span>
                                    )}
                                    {o.request_type && <span className="text-muted-foreground ml-2">{t(`req_${o.request_type}`)}</span>}
                                </span>
                                <span className="row-span-2">
                                    {o.over_hours !== null && (
                                        <StatusBadge tone="red">{t('rep_left_over').replace('{n}', spanText(t, o.over_hours))}</StatusBadge>
                                    )}
                                </span>
                                <span className="text-muted-foreground truncate text-xs">
                                    {t('rep_rs_open_due')
                                        .replace('{kind}', t(`rep_due_kind_${o.due_kind}`))
                                        .replace('{at}', shortMoment(o.due_at, lang))}
                                </span>
                            </div>
                        );
                    })}
                    {data.open.length > shown.length && (
                        <div className="text-muted-foreground px-5 py-2 text-xs">
                            {t('rep_rs_open_more').replace('{n}', String(data.open.length - shown.length))}
                        </div>
                    )}
                </div>
            )}
            {canOpen(BACKLOG_HREF) && (
                <Link
                    to={BACKLOG_HREF}
                    className="text-brand hover:bg-accent border-border mt-auto border-t py-2.5 text-center text-xs font-semibold"
                >
                    {t('rep_rs_open_all')}
                </Link>
            )}
        </Card>
    );
}

/** "24 ชม. ทำการ" / "24 ชม." — a target in its own clock. */
export function targetText(t: T, hours: number, clock: 'business' | 'calendar' | null): string {
    return t(clock === 'calendar' ? 'rep_rs_hours_calendar' : 'rep_rs_hours_business').replace('{n}', String(hours));
}

function RulesCard({ rules }: { rules: RequestSlaBreakdown['rules'] }) {
    const t = useT();
    const canOpen = useCanOpen();
    const minutes = rules.response_minutes;
    const response =
        minutes % 60 === 0
            ? t('rep_rs_hours_business').replace('{n}', String(minutes / 60))
            : t('rep_rs_minutes_business').replace('{n}', String(minutes));
    // One sentence when every type has the same target; otherwise the types grouped by target
    // ("24 ชม. ทำการ: คอมพิวเตอร์, กู้คืนข้อมูล"), the most shared target first.
    const targets = rules.resolve.map((r) => (r.hours === null ? t('rep_rs_by_priority') : targetText(t, r.hours, r.clock)));
    const same = new Set(targets).size === 1 && rules.resolve[0]?.hours !== null;
    const groups = new Map<string, string[]>();
    rules.resolve.forEach((r, i) => groups.set(targets[i], [...(groups.get(targets[i]) ?? []), t(`req_${r.type}`)]));
    const grouped = [...groups.entries()].sort(([, a], [, b]) => b.length - a.length);

    return (
        <Card className="overflow-hidden">
            <Heading
                title={t('rep_rs_rules_title')}
                sub={
                    canOpen(SLA_SETTINGS_HREF) ? (
                        <Link to={SLA_SETTINGS_HREF} className="text-brand hover:underline">
                            {t('rep_rs_rules_settings')}
                        </Link>
                    ) : undefined
                }
            />
            <dl className="space-y-3 px-5 py-4 text-sm">
                <div>
                    <dt className="font-semibold">{t('rep_rs_rule_take')}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">{t('rep_rs_rule_take_desc').replace('{t}', response)}</dd>
                </div>
                <div>
                    <dt className="font-semibold">{t('rep_rs_rule_close')}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">
                        {same ? (
                            t('rep_rs_rule_close_same').replace('{t}', targets[0])
                        ) : (
                            <>
                                {t('rep_rs_rule_close_varied')}
                                <ul className="mt-1.5 space-y-1">
                                    {grouped.map(([target, names]) => (
                                        <li key={target}>
                                            <b className="text-foreground font-semibold">{target}</b>: {names.join(', ')}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </dd>
                </div>
                <div className="bg-brand/10 flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px]">
                    <Info className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t('rep_rs_rule_hint')}</span>
                </div>
            </dl>
        </Card>
    );
}

/** The three cards between the summary tiles and the table; a press on a type line filters the page. */
export function RequestSlaCards({ filters, patch }: { filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const { data, isLoading } = useRequestSlaBreakdown(filters);

    if (isLoading || !data) {
        return (
            <div className="space-y-4" aria-hidden>
                <Card className="space-y-3 p-5">
                    <Skeleton className="h-4 w-48" />
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-7" />
                    ))}
                </Card>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                    <Skeleton className="h-44" />
                    <Skeleton className="h-44" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <TypesCard data={data} filters={filters} patch={patch} />
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <OpenCard data={data} />
                <RulesCard rules={data.rules} />
            </div>
        </div>
    );
}
