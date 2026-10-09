// Software licence report cards: usage segments, seats per software, leavers to take seats back from, requests waiting (data: useSoftwareLicenseBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useSoftwareLicenseBreakdown } from '../hooks/use-reports';
import type { SoftwareLicenseBreakdown, SoftwareSeats, TabularFilters } from '../types';
import { CODE_LINK, DaysOut, Group, GroupRow, scrollToRows, Segments, TD, TH } from './access-overview-cards';
import { count, PickButton, pickRow, PieceBar, TodoLines, type TodoTone } from './access-parts';
import { CardEmpty, CardTitle, fold, FoldToggle } from './chart-parts';
import { FILL } from './chart-tones';
import { BarRowsSkeleton, CardHeadingSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { shortDate } from './transfer-cards';

type Patch = (next: TabularFilters) => void;
type Request = SoftwareLicenseBreakdown['requests'][number];

/** Software rows listed before the rest fold. */
const ROWS_SHOWN = 10;

/** A request waiting longer than this many days is flagged. */
const LONG_WAIT_DAYS = 7;

/* ─────────────────────────── segments and the list's heading ─────────────────────────── */

/** The usage filter as segments in the filter bar; "ใช้เกิน" only when some software is. */
export function SoftwareUsageSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useSoftwareLicenseBreakdown(filters);
    const usages = (['full', 'available', 'unlimited', 'over'] as const).filter(
        (u) => u !== 'over' || (data?.usage.over ?? 0) > 0 || filters.usage === 'over',
    );
    return (
        <Segments
            size="md"
            label={t('rep_fl_usage')}
            options={[
                { value: null as string | null, label: t('rep_sl_usage_all'), count: data ? data.usage.all : null },
                ...usages.map((u) => ({ value: u as string | null, label: t(`rep_usage_${u}`), count: data ? data.usage[u] : null })),
            ]}
            value={(filters.usage as string | null | undefined) ?? null}
            onChange={(usage) => patch({ usage, software_id: null })}
        />
    );
}

/** Beside the list's heading: the picked software (cleared with ✕) and active / revoked. */
export function SoftwareListLead({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useSoftwareLicenseBreakdown(filters);
    return (
        <>
            {filters.software_id && (
                <button
                    type="button"
                    onClick={() => patch({ software_id: null })}
                    className="bg-brand/10 text-brand hover:bg-brand/20 focus-visible:ring-brand inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-full px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                >
                    <span className="truncate">{data?.picked ?? String(filters.software_id)}</span>
                    <span className="sr-only">{t('rep_sl_unpick')}</span>
                    <X aria-hidden className="h-3 w-3 shrink-0" />
                </button>
            )}
            <Segments
                label={t('rep_fl_sl_state')}
                options={(['active', 'revoked'] as const).map((s) => ({
                    value: s as string,
                    label: t(`rep_sl_state_${s}`),
                    count: data ? data.states[s] : null,
                }))}
                value={(filters.state as string | null | undefined) ?? 'active'}
                onChange={(state) => patch({ state })}
            />
        </>
    );
}

/* ─────────────────────────── seats per software ─────────────────────────── */

/** Seats on the software's own capacity: working holders, leavers still holding, what is free. */
function SeatBar({ s }: { s: SoftwareSeats }) {
    const t = useT();
    const lang = useUiStore((st) => st.lang);
    if (s.seats === null) return <span className="text-muted-foreground text-xs">{t('rep_sl_unlimited')}</span>;
    const pieces = [
        { key: 'work', value: s.used - s.gone, fill: FILL['soft-blue'], label: t('rep_sl_bar_work') },
        { key: 'gone', value: s.gone, fill: FILL['soft-red'], label: t('rep_sl_bar_gone') },
    ];
    const words = [
        ...pieces.filter((p) => p.value > 0).map((p) => `${p.label} ${count(p.value, lang)}`),
        `${t('rep_sl_bar_free')} ${count(Math.max(0, s.left ?? 0), lang)}`,
    ].join(', ');

    return (
        <div className="min-w-[9rem]">
            <PieceBar
                scale={Math.max(s.seats, s.used, 1)}
                label={t('rep_sl_bar_aria').replace('{parts}', words).replace('{n}', count(s.seats, lang))}
                pieces={pieces}
            />
            {s.usage === 'full' && <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">{t('rep_sl_full_label')}</div>}
            {s.usage === 'over' && (
                <div className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
                    {t('rep_sl_over_label').replace('{n}', count(s.used - s.seats, lang))}
                </div>
            )}
        </div>
    );
}

/** What to do about a software, most pressing first. */
function Todo({ s }: { s: SoftwareSeats }) {
    const t = useT();
    const lang = useUiStore((st) => st.lang);
    const lines: { tone: TodoTone; text: string }[] = [];
    if (s.usage === 'over') lines.push({ tone: 'bad', text: t('rep_sl_todo_over').replace('{n}', count(s.used - (s.seats ?? 0), lang)) });
    if (s.blocked) lines.push({ tone: 'bad', text: t('rep_sl_todo_blocked').replace('{n}', count(s.requests, lang)) });
    if (s.gone > 0)
        lines.push({
            tone: s.blocked ? 'bad' : 'warn',
            text: t(s.blocked ? 'rep_sl_todo_gone_for_requests' : 'rep_sl_todo_gone').replace('{n}', count(s.gone, lang)),
        });
    if (!s.blocked && s.left !== null && s.requests > 0 && s.requests > Math.max(0, s.left)) {
        lines.push({
            tone: 'warn',
            text: t('rep_sl_todo_short')
                .replace('{n}', count(s.requests, lang))
                .replace('{left}', count(Math.max(0, s.left), lang)),
        });
    } else if (!s.blocked && s.requests > 0) {
        lines.push({ tone: 'muted', text: t('rep_sl_todo_enough').replace('{n}', count(s.requests, lang)) });
    }
    if (s.usage === 'full' && s.requests === 0) lines.push({ tone: 'warn', text: t('rep_sl_todo_full') });
    if (s.used === 0 && s.requests === 0) lines.push({ tone: 'muted', text: t('rep_sl_todo_unused') });
    if (lines.length === 0) lines.push({ tone: 'ok', text: t('rep_ar_todo_none') });
    return <TodoLines lines={lines} />;
}

function SeatTableCard({ softwares, filters, patch }: { softwares: SoftwareSeats[]; filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const [open, setOpen] = useState(false);
    const used = softwares.filter((s) => s.used > 0);
    const ordered = [...used, ...softwares.filter((s) => s.used === 0)];
    const { folds, shown } = fold(ordered, ROWS_SHOWN, open);
    const pick = (s: SoftwareSeats) => {
        patch({ software_id: s.id, state: 'active' });
        requestAnimationFrame(scrollToRows);
    };

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_sl_seats_title')}
                note={t('rep_sl_seats_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {[
                            ['soft-blue', 'rep_sl_bar_work'],
                            ['soft-red', 'rep_sl_bar_gone'],
                        ].map(([tone, label]) => (
                            <span key={label} className="inline-flex items-center gap-1.5">
                                <i aria-hidden className={cn('inline-block h-2 w-2 rounded-full', FILL[tone as 'soft-blue' | 'soft-red'])} />
                                {t(label)}
                            </span>
                        ))}
                        <span className="inline-flex items-center gap-1.5">
                            <i aria-hidden className="bg-muted inline-block h-2 w-2 rounded-full" />
                            {t('rep_sl_bar_free')}
                        </span>
                    </span>
                }
            />
            {softwares.length === 0 ? (
                <CardEmpty>{t('rep_sl_empty')}</CardEmpty>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_sl_seats_title')}</caption>
                            <thead>
                                <tr className="bg-muted/40 border-border border-b">
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_c_software')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_c_license_type')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_sl_col_used')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'w-1/4 text-left')}>
                                        {t('rep_sl_col_seats')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_sl_col_requests')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_ar_col_todo')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_sl_col_holders')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((s, i) => {
                                    const apart = s.used === 0 && used.length > 0 && (i === 0 || shown[i - 1].used > 0);
                                    const picked = Number(filters.software_id) === s.id;
                                    const row = pickRow(picked, s.used > 0 ? () => (picked ? patch({ software_id: null }) : pick(s)) : null);
                                    const href = `/access?tab=software&view=${s.id}`;
                                    return (
                                        <tr
                                            key={s.id}
                                            onClick={row.onClick}
                                            className={cn(
                                                'border-border/60 border-b transition-colors last:border-b-0',
                                                apart && '[&>td]:border-border [&>td]:border-t-2 [&>td]:border-dashed',
                                                row.className,
                                            )}
                                        >
                                            <td className={TD}>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {canOpen(href) ? (
                                                            <Link to={href} className={CODE_LINK} translate="no">
                                                                {s.code}
                                                            </Link>
                                                        ) : (
                                                            <span className="font-mono text-xs font-semibold">{s.code}</span>
                                                        )}
                                                        <span className="truncate font-medium">{s.name}</span>
                                                    </div>
                                                    {s.brand && <div className="text-muted-foreground text-xs">{s.brand}</div>}
                                                </div>
                                            </td>
                                            <td className={TD}>{s.license_type ? t(`access_lic_${s.license_type}`) : '—'}</td>
                                            <td className={cn(TD, 'text-right font-mono whitespace-nowrap tabular-nums')}>
                                                <b>{count(s.used, lang)}</b>{' '}
                                                <span className="text-muted-foreground">/ {s.seats === null ? '∞' : count(s.seats, lang)}</span>
                                                {s.pct !== null && (
                                                    <div
                                                        className={cn(
                                                            'text-xs',
                                                            s.usage === 'over' || s.blocked
                                                                ? 'font-semibold text-red-700 dark:text-red-300'
                                                                : s.usage === 'full'
                                                                  ? 'font-semibold text-amber-700 dark:text-amber-300'
                                                                  : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {s.pct}%
                                                    </div>
                                                )}
                                            </td>
                                            <td className={TD}>
                                                <SeatBar s={s} />
                                            </td>
                                            <td className={cn(TD, 'text-right')}>
                                                {s.requests > 0 ? (
                                                    <StatusBadge tone="amber" className="font-mono tabular-nums">
                                                        {count(s.requests, lang)}
                                                    </StatusBadge>
                                                ) : (
                                                    <span className="text-muted-foreground font-mono">0</span>
                                                )}
                                            </td>
                                            <td className={TD}>
                                                <Todo s={s} />
                                            </td>
                                            <td className={cn(TD, 'text-right')}>
                                                {s.used > 0 ? (
                                                    <PickButton
                                                        picked={picked}
                                                        text={t('rep_ar_pick').replace('{n}', count(s.used, lang))}
                                                        label={t('rep_sl_pick_aria').replace('{name}', s.name).replace('{n}', count(s.used, lang))}
                                                    />
                                                ) : (
                                                    <span className="text-muted-foreground font-mono">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={ordered.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── leavers and requests ─────────────────────────── */

function LeaversCard({ leavers }: { leavers: SoftwareLicenseBreakdown['leavers'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_sl_leavers_title')} sub={t('rep_sl_leavers_sub')} />
            {leavers.length === 0 ? (
                <CardEmpty>{t('rep_sl_leavers_empty')}</CardEmpty>
            ) : (
                <Group
                    first
                    title={t('rep_sl_leavers_group')}
                    total={t('rep_ac_people_n').replace('{n}', count(leavers.length, lang))}
                    rows={leavers}
                    link={{ href: '/employees', label: t('rep_ac_open_employees') }}
                    render={(p) => (
                        <GroupRow
                            key={p.employee_id}
                            head={
                                <>
                                    {canOpen(`/employees?view=${p.employee_id}`) ? (
                                        <Link
                                            to={`/employees?view=${p.employee_id}`}
                                            className="text-brand focus-visible:ring-brand rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            {p.name}
                                        </Link>
                                    ) : (
                                        <span className="font-medium">{p.name}</span>
                                    )}
                                    <span className="text-muted-foreground ml-2 font-mono text-xs">{p.code}</span>
                                </>
                            }
                            side={<DaysOut days={p.days} />}
                            sub={[
                                p.department ? (lang === 'th' && p.department.name_th) || p.department.name : null,
                                p.last_day ? t('rep_ac_last_day').replace('{date}', shortDate(p.last_day, lang)) : null,
                                t('rep_sl_seats_n').replace('{n}', count(p.grants.length, lang)),
                            ]}
                            chips={p.grants.map((g) => (
                                <span key={g.id} className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]">
                                    <i aria-hidden className={cn('inline-block h-2 w-2 rounded-full', FILL['access-software'])} />
                                    {g.name}
                                    {g.blocked && (
                                        <b className="text-red-700 dark:text-red-300">
                                            {t('rep_sl_chip_waiting').replace('{n}', count(g.requests, lang))}
                                        </b>
                                    )}
                                </span>
                            ))}
                        />
                    )}
                />
            )}
        </Card>
    );
}

function RequestsCard({ requests }: { requests: Request[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const row = (r: Request) => {
        const href = `/requests?view=${r.id}`;
        const dept = r.requester.department ? (lang === 'th' && r.requester.department.name_th) || r.requester.department.name : null;
        return (
            <GroupRow
                key={r.id}
                head={
                    <>
                        {canOpen(href) ? (
                            <Link to={href} className={CODE_LINK} translate="no">
                                {r.reference}
                            </Link>
                        ) : (
                            <span className="font-mono text-xs font-semibold">{r.reference}</span>
                        )}
                        <span className="ml-2">{r.software.name}</span>
                    </>
                }
                side={
                    <StatusBadge tone={r.days > LONG_WAIT_DAYS ? 'red' : 'gray'} className="font-mono tabular-nums">
                        {t('rep_sl_waiting_days').replace('{n}', count(r.days, lang))}
                    </StatusBadge>
                }
                sub={[
                    r.requester.name,
                    dept,
                    r.created_at ? t('rep_sl_asked_on').replace('{date}', shortDate(r.created_at, lang)) : null,
                    r.seats_left === null ? null : r.seats_left <= 0 ? (
                        <b className="text-red-700 dark:text-red-300">
                            {t('rep_sl_req_full')}
                            {r.gone > 0 && `, ${t('rep_sl_req_take_back').replace('{n}', count(r.gone, lang))}`}
                        </b>
                    ) : (
                        t('rep_sl_req_left').replace('{n}', count(r.seats_left, lang))
                    ),
                ]}
            />
        );
    };
    const approved = requests.filter((r) => r.status === 'approved');
    const pending = requests.filter((r) => r.status === 'pending');
    const link = { href: '/requests', label: t('rep_sl_open_requests') };

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_sl_requests_title')} sub={t('rep_sl_requests_sub')} />
            {requests.length === 0 ? (
                <CardEmpty>{t('rep_sl_requests_empty')}</CardEmpty>
            ) : (
                <>
                    <Group
                        first
                        title={t('rep_sl_requests_approved')}
                        total={count(approved.length, lang)}
                        rows={approved}
                        link={link}
                        render={row}
                    />
                    <Group
                        first={approved.length === 0}
                        title={t('rep_sl_requests_pending')}
                        total={count(pending.length, lang)}
                        rows={pending}
                        link={link}
                        render={row}
                    />
                </>
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
                <TableRowsSkeleton rows={4} />
            </Card>
            <div className="grid gap-3 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={3} />
                </Card>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={3} />
                </Card>
            </div>
        </div>
    );
}

export function SoftwareLicenseCards({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data, isLoading, isError, error, isPlaceholderData } = useSoftwareLicenseBreakdown(filters);
    // A pick the other filters have since left out: drop it rather than show an empty list under its chip.
    const stalePick = Boolean(data && !isPlaceholderData && filters.software_id && !data.picked);
    useEffect(() => {
        if (stalePick) patch({ software_id: null });
    }, [stalePick, patch]);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <SeatTableCard softwares={data.softwares} filters={filters} patch={patch} />
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-2">
                <LeaversCard leavers={data.leavers} />
                <RequestsCard requests={data.requests} />
            </div>
        </div>
    );
}
