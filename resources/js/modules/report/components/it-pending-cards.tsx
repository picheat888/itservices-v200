// "คำขอที่รอ IT ส่งมอบ" cards (pages/requests-it-pending.tsx): data time, how long requests wait with bucket
// popovers, who holds them by owner or type (the "แยกตาม" switch), and new joiners against their start day.
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useItPendingBreakdown } from '../hooks/use-reports';
import type { ChartSeries, ItPendingBreakdown, ItPendingGroup, ItPendingJoiner, RequestAgeBand, TabularFilters } from '../types';
import { Segments, TH } from './access-overview-cards';
import { CardEmpty, CardTitle, CODE_LINK, fold, FoldToggle, StackBar, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { BarRowsSkeleton, CardHeadingSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Patch = (next: TabularFilters) => void;

/** The shared age groups, worst first, in the approvals page's tones. */
const BANDS: { key: RequestAgeBand; label: string; tone: ChartSeries['tone']; top: string; tint: string; hover: string; ink: string }[] = [
    {
        key: 'over_7',
        label: 'rep_age_over_7',
        tone: 'soft-red',
        top: 'border-t-red-400',
        tint: 'bg-red-500/[0.07] dark:bg-red-500/10',
        hover: 'hover:ring-red-400/70',
        ink: 'text-red-700 dark:text-red-300',
    },
    {
        key: 'days_4_7',
        label: 'rep_age_days_4_7',
        tone: 'soft-amber',
        top: 'border-t-amber-400',
        tint: 'bg-amber-500/[0.07] dark:bg-amber-500/10',
        hover: 'hover:ring-amber-400/70',
        ink: 'text-amber-700 dark:text-amber-300',
    },
    {
        key: 'upto_3',
        label: 'rep_age_upto_3',
        tone: 'gray',
        top: 'border-t-slate-400 dark:border-t-slate-500',
        tint: 'bg-slate-500/[0.07] dark:bg-slate-500/10',
        hover: 'hover:ring-slate-400/70',
        ink: 'text-slate-700 dark:text-slate-300',
    },
];
const SERIES: ChartSeries[] = BANDS.map((b) => ({ key: b.key, label_key: b.label, tone: b.tone }));

const NONE = 'none';
const NO_TICKET = 'no_ticket';
const OWNER_ROWS = 5;
const TYPE_ROWS = 5;
const JOINER_ROWS = 5;
const UNOWNED = 'font-semibold text-amber-600 dark:text-amber-400';

function useFormat() {
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    return {
        lang,
        number: (n: number) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US'),
        decimal: (n: number) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        date: (iso: string) => fmt.date(iso),
        moment: (at: number) => fmt.dateTime(new Date(at)),
    };
}

/** "ข้อมูล ณ 10 ต.ค. 26 16:40" at the end of the filter bar — the report has no date range, it is a state of now. */
export function ItPendingAsOf({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const f = useFormat();
    const { dataUpdatedAt } = useItPendingBreakdown(filters);
    // A refetch shows the previous answer with no time of its own: keep the last known time meanwhile.
    const [shown, setShown] = useState(dataUpdatedAt);
    if (dataUpdatedAt && dataUpdatedAt !== shown) setShown(dataUpdatedAt);
    if (!shown) return null;
    return <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">{t('rep_rqi_as_of').replace('{at}', f.moment(shown))}</span>;
}

export function ItPendingCards({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data, isLoading, isError, error } = useItPendingBreakdown(filters);
    const [open, setOpen] = useState<Record<By, boolean>>({ owner: false, type: false });
    const [held, setHeld] = useState<Record<By, number | null>>({ owner: null, type: null });
    const ageRef = useRef<HTMLDivElement>(null);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    const by: By = filters.by === 'type' ? 'type' : 'owner';
    // Unfolding keeps the age card at the height it had beside the folded list
    const toggle = () => {
        setHeld((h) => ({ ...h, [by]: open[by] ? null : (ageRef.current?.offsetHeight ?? null) }));
        setOpen((o) => ({ ...o, [by]: !o[by] }));
    };

    return (
        <div className="space-y-4">
            <div className={cn(PAIR, open[by] && 'xl:items-start')}>
                <AgeCard data={data} cardRef={ageRef} heldHeight={open[by] ? held[by] : null} />
                <HoldersCard data={data} filters={filters} patch={patch} by={by} open={open} onToggle={toggle} />
            </div>
            <JoinersCard joiners={data.joiners} />
        </div>
    );
}

// Age card beside the workload card on wide screens; same height while the list is folded, then held at that height and in view
const PAIR = 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]';

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <div className={PAIR}>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={2} />
                </Card>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={4} />
                </Card>
            </div>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={5} />
            </Card>
        </div>
    );
}

// Age card — waiting now and what finished in the last 30 days, in the same groups

function BandLegend() {
    const t = useT();
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {BANDS.map((b) => (
                <Swatch key={b.key} fill={FILL[b.tone]}>
                    {t(b.label)}
                </Swatch>
            ))}
        </span>
    );
}

function AgeCard({ data, cardRef, heldHeight }: { data: ItPendingBreakdown; cardRef: React.Ref<HTMLDivElement>; heldHeight: number | null }) {
    const t = useT();
    const f = useFormat();
    const { waiting, delivered } = data;

    return (
        <Card ref={cardRef} className="flex flex-col overflow-clip xl:sticky xl:top-4" style={heldHeight ? { minHeight: heldHeight } : undefined}>
            <CardTitle title={t('rep_rqi_age_title')} info={t('rep_rqi_age_note')} sub={<BandLegend />} />
            <div className="divide-border grid flex-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0 xl:auto-rows-fr xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
                <section aria-labelledby="rqi-age-now" className={SECTION}>
                    <h3 id="rqi-age-now" className="flex flex-wrap items-baseline gap-x-2.5 text-sm font-semibold">
                        {t('rep_rqi_age_now')}
                        <b>{t('rep_rqi_n').replace('{n}', f.number(waiting.total))}</b>
                        {waiting.avg_days !== null && (
                            <span className="text-muted-foreground text-xs font-normal">
                                {t('rep_rqi_avg').replace('{n}', f.decimal(waiting.avg_days))}
                            </span>
                        )}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {BANDS.map((b) => (
                            <WaitingBucket key={b.key} band={b} figures={waiting.bands[b.key]} />
                        ))}
                    </div>
                </section>
                <section aria-labelledby="rqi-age-done" className={SECTION}>
                    <div>
                        <h3 id="rqi-age-done" className="flex flex-wrap items-baseline gap-x-2.5 text-sm font-semibold">
                            {t('rep_rqi_age_done')}
                            <b>{t('rep_rqi_n').replace('{n}', f.number(delivered.total))}</b>
                        </h3>
                        <p className="text-muted-foreground text-xs">
                            {(delivered.avg_days !== null ? t('rep_rqi_done_avg').replace('{n}', f.decimal(delivered.avg_days)) + ' ' : '') +
                                t('rep_rqi_range').replace('{from}', f.date(delivered.from)).replace('{to}', f.date(delivered.to))}
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {BANDS.map((b) => (
                            <Bucket key={b.key} band={b} count={delivered.bands[b.key]} />
                        ))}
                    </div>
                </section>
            </div>
        </Card>
    );
}

const SECTION = 'flex flex-col justify-center gap-2 px-5 py-3.5';

const BUCKET = 'relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-lg border-t-[3px] px-2 pt-2 pb-2.5 text-center';

function BucketFace({ band, count }: { band: (typeof BANDS)[number]; count: number }) {
    const t = useT();
    const f = useFormat();
    return (
        <>
            <b className={cn('text-xl leading-tight font-bold', count === 0 ? 'text-muted-foreground font-medium' : band.ink)}>{f.number(count)}</b>
            <span className="text-muted-foreground max-w-full truncate text-xs">{t(band.label)}</span>
        </>
    );
}

function Bucket({ band, count }: { band: (typeof BANDS)[number]; count: number }) {
    return (
        <div className={cn(BUCKET, band.top, band.tint)}>
            <BucketFace band={band} count={count} />
        </div>
    );
}

/** A waiting group with requests opens who has them: nobody yet, no ticket, someone. */
function WaitingBucket({ band, figures }: { band: (typeof BANDS)[number]; figures: ItPendingBreakdown['waiting']['bands'][RequestAgeBand] }) {
    const t = useT();
    const f = useFormat();
    if (figures.total === 0) return <Bucket band={band} count={0} />;
    const heading = t('rep_rqi_bucket_head').replace('{band}', t(band.label)).replace('{n}', f.number(figures.total));
    const rows: [string, number][] = [
        ['rep_rqi_unassigned', figures.unassigned],
        ['rep_rqi_opt_no_ticket', figures.no_ticket],
        ['rep_rqi_assigned', figures.assigned],
    ];

    return (
        <InfoPopover
            label={t('rep_rqi_bucket_label').replace('{band}', t(band.label)).replace('{n}', f.number(figures.total))}
            className={cn(BUCKET, band.top, band.tint, band.hover, 'cursor-pointer ring-1 ring-transparent transition-shadow')}
            content={
                <div className="min-w-44">
                    <div className="mb-1 font-semibold">{heading}</div>
                    {rows.map(([key, n]) => (
                        <div key={key} className={cn('flex items-center justify-between gap-4', n === 0 && 'text-muted-foreground')}>
                            <span>{t(key)}</span>
                            <b className={cn(n === 0 ? 'font-normal' : 'font-semibold')}>{f.number(n)}</b>
                        </div>
                    ))}
                </div>
            }
        >
            <BucketFace band={band} count={figures.total} />
            <span aria-hidden className="text-muted-foreground absolute top-1 right-2 text-xs leading-none">
                ⓘ
            </span>
        </InfoPopover>
    );
}

// Workload card — by owner or by request type; a press on a row filters the page

const BY = ['owner', 'type'] as const;
type By = (typeof BY)[number];

function GroupRow({
    label,
    sub,
    values,
    total,
    scale,
    selected,
    apart,
    onSelect,
}: {
    label: string;
    sub: string[];
    values: Record<RequestAgeBand, number>;
    total: number;
    scale: number;
    selected: boolean;
    apart?: boolean;
    onSelect: () => void;
}) {
    const t = useT();
    const f = useFormat();
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            title={`${label}\n${sub.join('\n')}\n${t(selected ? 'rep_bl_filter_clear' : 'rep_bl_filter_hint')}`}
            className={cn(
                'focus-visible:ring-brand grid w-full grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2.5rem]',
                selected ? 'bg-brand/10 ring-brand/40 ring-1' : 'hover:bg-accent',
            )}
        >
            <span className="min-w-0">
                <span className={cn('block truncate', apart && UNOWNED)}>{label}</span>
                <span className={cn('flex gap-x-3 truncate text-xs', selected ? 'text-foreground' : 'text-muted-foreground')}>
                    {sub.map((part) => (
                        <span key={part} className="truncate">
                            {part}
                        </span>
                    ))}
                </span>
            </span>
            {total > 0 ? <StackBar values={values} series={SERIES} scale={scale} /> : <span className="text-muted-foreground">—</span>}
            <b className="text-right font-semibold">{f.number(total)}</b>
        </button>
    );
}

function HoldersCard({
    data,
    filters,
    patch,
    by,
    open,
    onToggle: toggle,
}: {
    data: ItPendingBreakdown;
    filters: TabularFilters;
    patch: Patch;
    by: By;
    open: Record<By, boolean>;
    onToggle: () => void;
}) {
    const t = useT();
    const f = useFormat();
    const oldest = (days: number | null) => (days === null ? t('rep_rqi_none_waiting') : t('rep_rqi_oldest').replace('{n}', f.number(days)));

    const named = data.by_assignee.filter((g) => g.key !== NONE && g.key !== NO_TICKET);
    const apart = data.by_assignee.filter((g) => g.key === NONE || g.key === NO_TICKET);
    const scale = Math.max(1, ...data.by_assignee.map((g) => g.total), ...data.by_type.map((g) => g.total));
    const ownerFold = fold(named, OWNER_ROWS, open.owner, 0);
    const typeFold = fold(data.by_type, TYPE_ROWS, open.type, 0);
    const pressOwner = (key: string) => patch({ assignee: String(filters.assignee ?? '') === key ? null : key });
    const pressType = (type: string) => patch({ type: filters.type === type ? null : type });
    const ownerSub = (g: ItPendingGroup) =>
        [
            g.in_progress > 0 ? t('rep_rqi_busy').replace('{n}', f.number(g.in_progress)) : null,
            g.open > 0 ? t('rep_rqi_open').replace('{n}', f.number(g.open)) : null,
            oldest(g.oldest_days),
        ].filter((part): part is string => part !== null);
    const apartLabel = (g: ItPendingGroup) => t(g.key === NONE ? 'rep_rqi_unassigned' : 'rep_rqi_opt_no_ticket');
    const apartEmpty = (g: ItPendingGroup) => t(g.key === NONE ? 'rep_rqi_all_assigned' : 'rep_rqi_all_ticketed');
    const empty = data.waiting.total === 0;

    return (
        <Card className="flex flex-col overflow-clip">
            <CardTitle
                title={t('rep_rqi_who_title')}
                info={by === 'owner' ? t('rep_rqi_who_note_owner') : undefined}
                sub={
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="flex items-center gap-2">
                            <span aria-hidden>{t('rep_rqi_by_label')}</span>
                            <Segments
                                label={t('rep_rqi_by_label')}
                                options={BY.map((d) => ({ value: d, label: t(`rep_rqi_by_${d}`), count: null }))}
                                value={by}
                                onChange={(d) => by !== d && patch({ by: d })}
                            />
                        </span>
                        <BandLegend />
                    </span>
                }
            />
            {empty ? (
                <CardEmpty>{t('rep_rqi_empty')}</CardEmpty>
            ) : by === 'owner' ? (
                <>
                    <div className="flex flex-1 flex-col gap-0.5 px-3 pt-2.5 pb-3.5">
                        {ownerFold.shown.map((g) => (
                            <GroupRow
                                key={g.key}
                                label={g.name ?? g.key}
                                sub={ownerSub(g)}
                                values={g.bands}
                                total={g.total}
                                scale={scale}
                                selected={String(filters.assignee ?? '') === g.key}
                                onSelect={() => pressOwner(g.key)}
                            />
                        ))}
                        {ownerFold.folds && (
                            <div>
                                <FoldToggle open={open.owner} total={named.length} onToggle={toggle} />
                            </div>
                        )}
                        <div className="border-border mt-1.5 space-y-0.5 border-t-2 border-dashed pt-1.5">
                            {apart.map((g) => (
                                <GroupRow
                                    key={g.key}
                                    label={apartLabel(g)}
                                    sub={[g.total > 0 ? oldest(g.oldest_days) : apartEmpty(g)]}
                                    values={g.bands}
                                    total={g.total}
                                    scale={scale}
                                    selected={String(filters.assignee ?? '') === g.key}
                                    apart
                                    onSelect={() => pressOwner(g.key)}
                                />
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex flex-1 flex-col gap-0.5 px-3 pt-2.5 pb-3.5">
                        {typeFold.shown.map((g) => (
                            <GroupRow
                                key={g.type}
                                label={t(`req_${g.type}`)}
                                sub={[oldest(g.oldest_days)]}
                                values={g.bands}
                                total={g.total}
                                scale={scale}
                                selected={filters.type === g.type}
                                onSelect={() => pressType(g.type)}
                            />
                        ))}
                    </div>
                    {typeFold.folds && <FoldToggle open={open.type} total={data.by_type.length} onToggle={toggle} />}
                </>
            )}
        </Card>
    );
}

// New joiners — each one's onboarding requests against the start day, most urgent first

const VERDICT_FILL = { on_time: 'bg-emerald-500', late: 'bg-amber-500', open: 'bg-slate-400 dark:bg-slate-500' } as const;

function JoinersCard({ joiners }: { joiners: ItPendingBreakdown['joiners'] }) {
    const t = useT();
    const f = useFormat();
    const [open, setOpen] = useState(false);
    const folding = fold(joiners.rows, JOINER_ROWS, open, 0);
    const legend: [keyof typeof VERDICT_FILL, string, number][] = [
        ['on_time', 'rep_rqi_jn_on_time', joiners.counts.on_time],
        ['late', 'rep_rqi_jn_late', joiners.counts.late],
        ['open', 'rep_rqi_jn_open', joiners.counts.open],
    ];
    const head = cn(TH, 'text-left');

    return (
        <Card className="flex flex-col overflow-clip">
            <CardTitle
                title={t('rep_rqi_jn_title')}
                info={t('rep_rqi_jn_note')
                    .replace('{n}', f.number(joiners.rows.length))
                    .replace('{from}', f.date(joiners.from))
                    .replace('{to}', f.date(joiners.to))}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {legend.map(([key, label, n]) => (
                            <Swatch key={key} fill={VERDICT_FILL[key]}>
                                {t(label)} <b className="text-foreground font-semibold">{f.number(n)}</b>
                            </Swatch>
                        ))}
                    </span>
                }
            />
            {joiners.rows.length === 0 && joiners.left_early.length === 0 ? (
                <CardEmpty>{t('rep_rqi_jn_empty')}</CardEmpty>
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_rqi_jn_caption')}</caption>
                        <thead className={cn(TABLE_HEAD, 'border-border border-b')}>
                            <tr>
                                <th scope="col" className={head}>
                                    {t('rep_rqi_jn_col_person')}
                                </th>
                                <th scope="col" className={head}>
                                    {t('rep_rqi_jn_col_start')}
                                </th>
                                <th scope="col" className={head}>
                                    {t('rep_rqi_jn_col_result')}
                                </th>
                                {joiners.types.map((type) => (
                                    <th key={type} scope="col" className={head}>
                                        {t(`req_${type}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {joiners.rows.length === 0 && (
                                <tr>
                                    <td colSpan={joiners.types.length + 3} className="text-muted-foreground px-3 py-6 text-center">
                                        {t('rep_rqi_jn_empty')}
                                    </td>
                                </tr>
                            )}
                            {folding.shown.map((j) => (
                                <JoinerRow key={j.employee_id} joiner={j} types={joiners.types} />
                            ))}
                            {joiners.left_early.map((j, i) => (
                                <JoinerRow key={j.employee_id} joiner={j} types={joiners.types} left apart={i === 0} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {folding.folds && <FoldToggle open={open} total={joiners.rows.length} onToggle={() => setOpen((o) => !o)} />}
        </Card>
    );
}

function JoinerRow({ joiner, types, left, apart }: { joiner: ItPendingJoiner; types: string[]; left?: boolean; apart?: boolean }) {
    const t = useT();
    const f = useFormat();
    const canOpen = useCanOpen();
    const name = (f.lang === 'th' && joiner.name_th) || joiner.name;
    const department = joiner.department ? (f.lang === 'th' && joiner.department.name_th) || joiner.department.name : null;
    const href = `/employees?view=${joiner.employee_id}`;
    const startNote =
        left && joiner.last_day
            ? t('rep_rqi_jn_last_day').replace('{date}', f.date(joiner.last_day))
            : joiner.days_to_start === 0
              ? t('rep_rqi_jn_today')
              : t(joiner.days_to_start > 0 ? 'rep_rqi_jn_in' : 'rep_rqi_jn_ago').replace('{n}', f.number(Math.abs(joiner.days_to_start)));
    const cell = 'px-3 py-2.5 align-top';

    return (
        <tr className={cn('border-border/60 border-b last:border-b-0', apart && 'border-border border-t-2 border-dashed')}>
            <th scope="row" className={cn(cell, 'text-left font-normal')}>
                {canOpen(href) ? (
                    <Link
                        to={href}
                        className="text-brand focus-visible:ring-brand block max-w-[14rem] truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                        title={name}
                    >
                        {name}
                    </Link>
                ) : (
                    <span className="block max-w-[14rem] truncate font-medium" title={name}>
                        {name}
                    </span>
                )}
                <span className="text-muted-foreground flex gap-x-3 text-xs whitespace-nowrap">
                    <span translate="no">{joiner.code}</span>
                    {department && <span>{department}</span>}
                </span>
            </th>
            <td className={cn(cell, 'whitespace-nowrap')}>
                <span className="tabular-nums">{f.date(joiner.joined_at)}</span>
                <span className="text-muted-foreground block text-xs">{startNote}</span>
            </td>
            <td className={cn(cell, 'whitespace-nowrap')}>
                <Verdict joiner={joiner} left={left} />
            </td>
            {types.map((type) => {
                const request = joiner.requests.find((r) => r.type === type);
                return (
                    <td key={type} className={cn(cell, 'whitespace-nowrap')}>
                        {request ? <RequestState joiner={joiner} request={request} left={left} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                );
            })}
        </tr>
    );
}

function Verdict({ joiner, left }: { joiner: ItPendingJoiner; left?: boolean }) {
    const t = useT();
    const f = useFormat();
    if (left) {
        return (
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">{t('rep_rqi_jn_left').replace('{n}', f.number(joiner.open))}</span>
        );
    }
    if (joiner.verdict === 'on_time') return <StatusBadge tone="green">{t('rep_rqi_jn_on_time')}</StatusBadge>;
    if (joiner.verdict === 'late') return <StatusBadge tone="amber">{t('rep_rqi_jn_late_n').replace('{n}', f.number(joiner.late_days))}</StatusBadge>;
    const toIt = joiner.open - joiner.pending;
    const why =
        joiner.pending === 0
            ? t('rep_rqi_jn_why_it').replace('{n}', f.number(toIt))
            : toIt === 0
              ? t('rep_rqi_jn_why_approval').replace('{n}', f.number(joiner.pending))
              : t('rep_rqi_jn_why_both').replace('{it}', f.number(toIt)).replace('{ap}', f.number(joiner.pending));
    return (
        <>
            <StatusBadge tone={joiner.started ? 'red' : 'amber'}>{t('rep_rqi_jn_open')}</StatusBadge>
            <span className="text-muted-foreground mt-1 block text-xs">{why}</span>
        </>
    );
}

function RequestState({ joiner, request, left }: { joiner: ItPendingJoiner; request: ItPendingJoiner['requests'][number]; left?: boolean }) {
    const t = useT();
    const f = useFormat();
    const canOpen = useCanOpen();
    const href = `/requests?view=${request.id}`;
    const reference = canOpen(href) ? (
        <Link to={href} className={CODE_LINK} translate="no">
            {request.reference}
        </Link>
    ) : (
        <span translate="no">{request.reference}</span>
    );

    let pill: React.ReactNode;
    let detail: React.ReactNode = null;
    if (request.status === 'completed') {
        pill =
            request.late_days > 0 ? (
                <StatusBadge tone="amber">{t('rep_rqi_rq_done_late').replace('{n}', f.number(request.late_days))}</StatusBadge>
            ) : (
                <StatusBadge tone="green">{t('req_status_completed')}</StatusBadge>
            );
        detail = request.completed_on ? f.date(request.completed_on) : null;
    } else if (request.status === 'approved') {
        pill = <StatusBadge tone={joiner.started && !left ? 'red' : 'amber'}>{t('rep_rqi_rq_it')}</StatusBadge>;
        detail = !request.has_ticket ? (
            t('rep_rqi_opt_no_ticket')
        ) : request.assignee ? (
            request.assignee
        ) : (
            <span className={UNOWNED}>{t('rep_rqi_unassigned')}</span>
        );
    } else {
        pill = <StatusBadge tone="gray">{t(`req_status_${request.status}`)}</StatusBadge>;
        detail = request.status === 'pending' && request.current_approver ? t('rep_rqi_rq_at').replace('{name}', request.current_approver) : null;
    }

    return (
        <>
            {pill}
            <span className="text-muted-foreground mt-1 flex items-baseline gap-x-2.5 text-xs">
                {reference}
                {detail && <span>{detail}</span>}
            </span>
        </>
    );
}
