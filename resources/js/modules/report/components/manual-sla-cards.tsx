/**
 * The "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" page's own parts (pages/tickets-manual-sla.tsx), from the
 * design mockup:
 *
 * - the grouped table: the request-SLA table's columns (request-sla-cards.tsx CountCells/SlaCells),
 *   one line per group of the dimension picked on its "แยกตาม" switch — category, priority, kind
 *   of work or assignee. A press on a line filters the page by that group (press again to clear);
 * - "ปิดไม่ทัน SLA ช้าไปเท่าไร": the late closes counted by how far past the deadline they closed,
 *   with the median and the near misses, then the cases still open past SLA;
 * - "เกณฑ์ SLA ที่ใช้วัด": the response target, each priority's resolve target, the repair rules and
 *   the working window.
 *
 * All of it reads useManualSlaBreakdown (TicketManualSlaReport::breakdown).
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
import { useManualSlaBreakdown } from '../hooks/use-reports';
import type { ManualSlaBreakdown, RequestSlaTally, TabularFilters } from '../types';
import { Heading, Swatch } from './backlog-board';
import { CountCells, GROUP, hoursText, shortMoment, SlaCells, spanText, targetText, TD, TH, type T } from './request-sla-cards';

type By = ManualSlaBreakdown['by'];
type Group = ManualSlaBreakdown['groups'][number];

const DIMENSIONS: By[] = ['category', 'priority', 'work_class', 'assignee'];

/** The backlog page, narrowed to tickets users opened that are past SLA — where the open list continues. */
const BACKLOG_HREF = '/reports/tickets-backlog?source=manual&sla=over_sla';
const SLA_SETTINGS_HREF = '/settings?tab=tickets';

/** A group's name on the page: the dimension's own wording, a person's name, or "not set". */
function groupName(t: T, by: By, group: Pick<Group, 'key' | 'label'>): string {
    if (by === 'assignee') return group.key === 'none' ? t('rep_opt_unassigned') : (group.label ?? group.key);
    if (by === 'priority') return group.key === 'none' ? t('rep_ms_prio_none') : t(`ticket_prio_${group.key}`);
    if (by === 'work_class') return t(`rep_ms_work_${group.key}`);
    return t(`ticket_cat_${group.key}`);
}

function GroupsCard({ data, filters, patch }: { data: ManualSlaBreakdown; filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const goal = data.rules.goal;
    const by = data.by;
    const active = filters[by] === null || filters[by] === undefined || filters[by] === '' ? null : String(filters[by]);
    const pick = (key: string) => patch({ [by]: active === key ? null : key });

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
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-muted-foreground text-xs font-normal">{t('rep_ms_by_label')}</span>
                        <span
                            role="group"
                            aria-label={t('rep_ms_by_label')}
                            className="border-border bg-card inline-flex gap-0.5 rounded-md border p-0.5"
                        >
                            {DIMENSIONS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={by === d}
                                    onClick={() => by !== d && patch({ by: d })}
                                    className={cn(
                                        'focus-visible:ring-brand/30 inline-flex h-7 items-center rounded px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                                        by === d ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                                    )}
                                >
                                    {t(`rep_ms_by_${d}`)}
                                </button>
                            ))}
                        </span>
                    </span>
                }
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone="bg-emerald-400">{t('rep_rs_at_goal').replace('{n}', String(goal))}</Swatch>
                        <Swatch tone="bg-red-400">{t('rep_rs_below_goal')}</Swatch>
                    </span>
                }
            />
            {data.groups.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_ms_empty')}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted/40">
                                <th rowSpan={2} scope="col" className={cn(TH, 'border-border border-b text-left align-bottom')}>
                                    {t(`rep_ms_by_${by}`)}
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
                            {data.groups.map((group) => {
                                const selected = active === group.key;
                                return (
                                    // The row filters the page; keyboard and screen readers reach it through the
                                    // button in its name cell, whose click bubbles up to the row (one handler).
                                    <tr
                                        key={group.key}
                                        onClick={() => pick(group.key)}
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
                                                className={cn(
                                                    'focus-visible:ring-brand rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                                                    group.key === 'none' && 'text-muted-foreground',
                                                )}
                                            >
                                                {groupName(t, by, group)}
                                            </button>
                                        </th>
                                        {line(group)}
                                    </tr>
                                );
                            })}
                            <tr className="bg-muted/40 font-semibold">
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_ms_total_row').replace('{n}', String(data.groups.length))}
                                </th>
                                {line(data.overall)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
            <div className="text-muted-foreground border-border border-t px-5 py-2.5 text-xs">{t('rep_ms_groups_hint')}</div>
        </Card>
    );
}

/** The near bands read amber (a little faster and they would have made it), the rest red; empty ones fade. */
const NEAR_BANDS = ['under_1h', '1_8h'];

/** How many open cases the card lists before folding the rest into a count. */
const OPEN_SHOWN = 4;

function LateAndOpenCard({ data }: { data: ManualSlaBreakdown }) {
    const t = useT();
    const canOpen = useCanOpen();
    const lang = useUiStore((s) => s.lang);
    const late = data.late;
    const shown = data.open.slice(0, OPEN_SHOWN);

    return (
        <Card className="flex flex-col overflow-hidden">
            <Heading title={t('rep_ms_late_title')} sub={late.total > 0 ? t('rep_ms_late_sub').replace('{n}', String(late.total)) : undefined} />
            {late.total === 0 ? (
                <div className="text-muted-foreground px-5 py-6 text-center text-sm">{t('rep_ms_late_none')}</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-5">
                        {late.bands.map((band) => (
                            <div
                                key={band.key}
                                className={cn(
                                    'flex flex-col gap-0.5 rounded-lg px-3 py-2.5',
                                    band.n === 0
                                        ? 'bg-muted text-muted-foreground'
                                        : NEAR_BANDS.includes(band.key)
                                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                          : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
                                )}
                            >
                                <b className="font-mono text-xl">{band.n}</b>
                                <span className="text-xs">{t(`rep_ms_late_${band.key}`)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-muted-foreground px-5 pt-2.5 pb-4 text-[13px]">
                        {t('rep_ms_late_note')
                            .replace('{median}', late.median_hours === null ? '—' : spanText(t, late.median_hours))
                            .replace('{near}', String(late.near))
                            .replace('{pct}', String(Math.round((late.near / late.total) * 100)))}
                    </p>
                </>
            )}

            <div className="border-border border-t">
                <Heading
                    title={t('rep_ms_open_title')}
                    sub={data.open.length > 0 ? t('rep_ms_open_sub').replace('{n}', String(data.open.length)) : undefined}
                />
            </div>
            {data.open.length === 0 ? (
                <div className="text-muted-foreground py-6 text-center text-sm">{t('rep_rs_open_none')}</div>
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
                                    {o.category && <span className="text-muted-foreground"> · {t(`ticket_cat_${o.category}`)}</span>}
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
                                    {o.assignee ? ` · ${o.assignee}` : ''}
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

/** "จันทร์–ศุกร์" for a run of days, else each day named — ISO weekdays (1 = Monday). */
function daysText(days: number[], lang: 'th' | 'en'): string {
    const name = (d: number) => new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'long' }).format(new Date(2024, 0, d)); // 1 Jan 2024 was a Monday
    const sorted = [...days].sort((a, b) => a - b);
    const run = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    return run ? `${name(sorted[0])}–${name(sorted[sorted.length - 1])}` : sorted.map(name).join(', ');
}

function RulesCard({ rules }: { rules: ManualSlaBreakdown['rules'] }) {
    const t = useT();
    const canOpen = useCanOpen();
    const lang = useUiStore((s) => s.lang);
    const minutes = rules.response_minutes;
    const response =
        minutes % 60 === 0
            ? t('rep_rs_hours_business').replace('{n}', String(minutes / 60))
            : t('rep_rs_minutes_business').replace('{n}', String(minutes));
    const hours = rules.hours;
    const window = t(hours.break_start && hours.break_end ? 'rep_ms_rule_hours_break' : 'rep_ms_rule_hours_plain')
        .replace('{days}', daysText(hours.days, lang))
        .replace('{start}', hours.start)
        .replace('{end}', hours.end)
        .replace('{break_start}', hours.break_start ?? '')
        .replace('{break_end}', hours.break_end ?? '');

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
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">{t('rep_ms_rule_take_desc').replace('{t}', response)}</dd>
                </div>
                <div>
                    <dt className="font-semibold">{t('rep_rs_rule_close')}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">
                        {t('rep_ms_rule_close_desc')}
                        <ul className="mt-1.5 space-y-1">
                            {rules.resolve.map((r) => (
                                <li key={r.priority}>
                                    <b className="text-foreground font-semibold">{t(`ticket_prio_${r.priority}`)}</b>:{' '}
                                    {targetText(t, r.hours, r.clock)}
                                </li>
                            ))}
                        </ul>
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold">{t('rep_ms_rule_repair')}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">
                        {rules.repair_rules === 0
                            ? t('rep_ms_rule_repair_none')
                            : t('rep_ms_rule_repair_some').replace('{n}', String(rules.repair_rules))}
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold">{t('rep_ms_rule_hours')}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">{window}</dd>
                </div>
                <div className="bg-brand/10 flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px]">
                    <Info className="text-brand mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t('rep_ms_rule_hint')}</span>
                </div>
            </dl>
        </Card>
    );
}

/** The cards between the summary tiles and the table; a press on a group line filters the page. */
export function ManualSlaCards({ filters, patch }: { filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const { data, isLoading } = useManualSlaBreakdown(filters);

    if (isLoading || !data) {
        return (
            <div className="space-y-4" aria-hidden>
                <Card className="space-y-3 p-5">
                    <Skeleton className="h-4 w-64" />
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-7" />
                    ))}
                </Card>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <GroupsCard data={data} filters={filters} patch={patch} />
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <LateAndOpenCard data={data} />
                <RulesCard rules={data.rules} />
            </div>
        </div>
    );
}
