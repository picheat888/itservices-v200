// "การอนุมัติคำขอ" report cards and row cells: waiting now and why, approvers, ended requests, skipped steps (data: useRequestApprovalsBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { REQUEST_SKIP_REASON_LABEL, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { ApprovalSkipReason, ServiceRequestType } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useRequestApprovalsBreakdown } from '../hooks/use-reports';
import type {
    ChartLabel,
    ChartTone,
    RequestAgeBand,
    RequestApprovalsBreakdown,
    RequestApproverRow,
    RequestApproverStats,
    RequestEnding,
    RequestEndingOutcome,
    RequestSkipReasonRow,
    RequestStuckStep,
    TabularFilters,
} from '../types';
import { NUM, Segments, TD, TH } from './access-overview-cards';
import { count, PieceBar, TodoLines, type TodoTone } from './access-parts';
import { CardEmpty, CardTitle, CODE_LINK, fold, FoldToggle, InfoMark, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { CardHeadingSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { shortDate } from './transfer-cards';
import { useNumberFormat } from '@/shared/hooks/use-number-format';

type Lang = 'th' | 'en';

const BAND_TONE: Record<RequestAgeBand, 'red' | 'amber' | 'gray'> = { over_7: 'red', days_4_7: 'amber', upto_3: 'gray' };

/** A master-data name in the reader's language. */
const labelOf = (l: ChartLabel | null, lang: Lang) => (l ? localPair(l.name, l.name_th, lang) : null);

/* ─────────────────────────── shared pieces ─────────────────────────── */

/** A request's reference, opening it on the Requests page when the reader may. */
function RequestLink({ id, reference }: { id: number; reference: string }) {
    const canOpen = useCanOpen();
    const href = `/requests?view=${id}`;
    return canOpen(href) ? (
        <Link to={href} className={CODE_LINK} translate="no">
            {reference}
        </Link>
    ) : (
        <span className="text-xs font-semibold" translate="no">
            {reference}
        </span>
    );
}

/** A request type with its Requests-module colour. */
export function RequestTypeLabel({ type }: { type: string }) {
    const t = useT();
    const meta = REQUEST_TYPE_META[type as ServiceRequestType];
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <i
                aria-hidden
                className={cn('inline-block h-2 w-2 shrink-0 rounded-full', !meta && 'bg-slate-400 dark:bg-slate-500')}
                style={meta ? { backgroundColor: meta.color } : undefined}
            />
            {meta ? t(meta.labelKey) : type}
        </span>
    );
}

/** "รอ 24 วัน" in its age-group colour; "วันนี้" on the day it arrived. */
function WaitPill({ days, band }: { days: number; band: RequestAgeBand }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <StatusBadge tone={BAND_TONE[band]} className="tabular-nums">
            {days === 0 ? t('rep_rqa_wait_today') : t('rep_rqa_wait').replace('{n}', count(days, lang))}
        </StatusBadge>
    );
}

/** The days column: whole days, a dash when there is nothing to count. */
const days = (value: number | null, lang: Lang, decimals = 0) => (value === null ? '—' : formatNumber(value, lang, { decimals }));

/* ─────────────────────────── waiting now ─────────────────────────── */

type StuckGroup = 'left' | 'no_account' | 'over7' | 'upto7';

const STUCK_GROUPS: StuckGroup[] = ['left', 'no_account', 'over7', 'upto7'];

const STUCK_SHOWN = 3;

/** One group as a column; on a wide screen the four share their rows (subgrid), so each line sits level. */
function StuckColumn({
    group,
    rows,
    open,
    onToggle,
    span,
}: {
    group: StuckGroup;
    rows: RequestStuckStep[];
    open: boolean;
    onToggle: () => void;
    span: number;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const { folds, shown } = fold(rows, STUCK_SHOWN, open, 0);
    const leavers = [...new Map(rows.map((r) => [r.approver.name, r.approver_left_on])).entries()];
    const hint =
        group === 'left' && rows.length > 0
            ? leavers.map(([name, on]) =>
                  t('rep_rqa_stuck_left_hint')
                      .replace('{name}', name)
                      .replace('{date}', on ? shortDate(on, lang) : '—'),
              )
            : group === 'no_account' && rows.length > 0
              ? [t('rep_rqa_stuck_no_account_hint')]
              : null;

    return (
        <section
            className="border-border flex min-w-0 flex-col border-t first:border-t-0 xl:grid xl:grid-rows-subgrid xl:border-t-0 xl:border-l xl:first:border-l-0"
            style={{ gridRow: `span ${span}` }}
        >
            <h3
                className={cn(
                    TABLE_HEAD,
                    'border-border text-muted-foreground flex items-baseline justify-between gap-2 border-b px-5 py-2 text-xs font-semibold',
                )}
            >
                <span className="flex items-center gap-1.5">
                    {t(`rep_rqa_stuck_${group}`)}
                    {hint && <InfoMark info={hint} />}
                </span>
                <b className="text-foreground tabular-nums">{t('rep_rqa_n_requests').replace('{n}', count(rows.length, lang))}</b>
            </h3>
            {rows.length === 0 ? (
                <p className="text-muted-foreground px-5 py-3 text-sm">{t(`rep_rqa_stuck_empty_${group}`)}</p>
            ) : (
                <>
                    <ul className="xl:contents">
                        {shown.map((r) => (
                            <li
                                key={r.request_id}
                                className="border-border/60 grid grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-3 gap-y-0.5 border-b px-5 py-2.5 last:border-b-0"
                            >
                                <span className="flex min-w-0 items-center gap-2 text-sm">
                                    <RequestLink id={r.request_id} reference={r.reference} />
                                    <span className="truncate">
                                        <RequestTypeLabel type={r.type} />
                                    </span>
                                </span>
                                <span className="row-span-2">
                                    <WaitPill days={r.days} band={r.age_band} />
                                </span>
                                <span className="text-muted-foreground flex min-w-0 flex-col text-xs">
                                    <span className="truncate">{t('rep_rqa_waits_on').replace('{name}', r.approver.name)}</span>
                                    <span
                                        className="truncate"
                                        title={t('rep_rqa_step_n').replace('{label}', r.label).replace('{n}', fmtN(r.position))}
                                    >
                                        {t('rep_rqa_step_n').replace('{label}', r.label).replace('{n}', fmtN(r.position))}
                                    </span>
                                    <span className="truncate">{t('rep_rqa_requester').replace('{name}', r.requester)}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {folds && (
                        <div className="xl:[grid-row:-2/-1]">
                            <FoldToggle open={open} total={rows.length} onToggle={onToggle} />
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

function StuckCard({ stuck }: { stuck: RequestApprovalsBreakdown['stuck'] }) {
    const t = useT();
    const total = STUCK_GROUPS.reduce((s, g) => s + stuck[g].length, 0);
    const [open, setOpen] = useState<Record<StuckGroup, boolean>>({ left: false, no_account: false, over7: false, upto7: false });
    // Heading, the longest column's rows, the fold line
    const longest = Math.max(1, ...STUCK_GROUPS.map((g) => (open[g] ? stuck[g].length : Math.min(STUCK_SHOWN, stuck[g].length))));
    const span = longest + 2;

    return (
        <Card className="overflow-hidden">
            <CardTitle title={t('rep_rqa_stuck_title')} info={t('rep_rqa_stuck_note')} />
            {total === 0 ? (
                <CardEmpty>{t('rep_rqa_stuck_none')}</CardEmpty>
            ) : (
                // Four columns on a wide screen; one under another on a tablet, each still folding at three.
                <div className="grid grid-cols-1 items-start xl:grid-cols-4 xl:items-stretch">
                    {STUCK_GROUPS.map((g) => (
                        <StuckColumn
                            key={g}
                            group={g}
                            rows={stuck[g]}
                            open={open[g]}
                            onToggle={() => setOpen((o) => ({ ...o, [g]: !o[g] }))}
                            span={span}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── approvers ─────────────────────────── */

const APPROVER_SHOWN = 10;

/** ผู้อนุมัติ, ขั้นที่ถึงคิว, ค้างอยู่ตอนนี้, เฉลี่ย, นานสุด, ค้างนานสุด */
const APPROVER_COLS = ['w-[26%]', 'w-[34%]', 'w-[10%]', 'w-[10%]', 'w-[10%]', 'w-[10%]'];

const OUTCOME_PIECES = [
    { key: 'approved', tone: 'green', label: 'rep_rqa_out_approved' },
    { key: 'rejected', tone: 'red', label: 'rep_rqa_out_rejected' },
    { key: 'waiting', tone: 'amber', label: 'rep_rqa_out_waiting' },
] as const;

function ApproverCell({ row }: { row: RequestApproverRow }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const department = labelOf(row.department, lang);

    if (row.apart) {
        return (
            <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-amber-700 dark:text-amber-300" title={row.name}>
                    {row.name}
                </span>
                <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs font-normal">
                    <span>{t(row.kind === 'group_step' ? 'rep_rqa_appr_group_step' : 'rep_rqa_appr_unlinked')}</span>
                    {row.kind === 'group_step' && department && <span>{department}</span>}
                </span>
            </span>
        );
    }

    return (
        <span className="flex min-w-0 flex-col">
            <span className="max-w-[14rem] truncate font-medium" title={row.name}>
                {row.name}
            </span>
            <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs font-normal">
                {row.code && <span translate="no">{row.code}</span>}
                {department && <span>{department}</span>}
                {row.left && <span className="font-semibold text-red-700 dark:text-red-300">{t('rep_rqa_flag_left')}</span>}
                {!row.left && row.no_account && (
                    <span className="font-semibold text-amber-700 dark:text-amber-300">{t('rep_rqa_flag_no_account')}</span>
                )}
            </span>
        </span>
    );
}

function ApproverRowCells({ row, scale, total = false }: { row: RequestApproverStats; scale: number; total?: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const pieces = OUTCOME_PIECES.map((p) => ({ key: p.key, value: row[p.key], fill: FILL[p.tone as ChartTone], label: t(p.label) }));
    const oldestBand = row.oldest_age_band;

    return (
        <>
            <td className={TD}>
                <PieceBar pieces={pieces} scale={scale} />
            </td>
            <td className={cn(TD, 'text-right')}>
                {row.waiting > 0 && !total ? (
                    <StatusBadge tone={oldestBand ? BAND_TONE[oldestBand] : 'gray'} className="tabular-nums">
                        {count(row.waiting, lang)}
                    </StatusBadge>
                ) : (
                    <span className={cn(!total && 'text-muted-foreground')}>{count(row.waiting, lang)}</span>
                )}
            </td>
            <td className={cn(TD, NUM)}>{days(row.avg_days, lang, 1)}</td>
            <td className={cn(TD, NUM)}>{days(row.max_days, lang)}</td>
            <td
                className={cn(
                    TD,
                    NUM,
                    row.oldest_waiting_days === null && 'text-muted-foreground',
                    !total && oldestBand === 'over_7' && 'font-semibold text-red-700 dark:text-red-300',
                )}
            >
                {days(row.oldest_waiting_days, lang)}
            </td>
        </>
    );
}

function ApproverRow({ row, scale, className }: { row: RequestApproverRow; scale: number; className?: string }) {
    return (
        <tr className={cn('border-border/60 border-b last:border-b-0', className)}>
            <th scope="row" className={cn(TD, 'text-left font-normal')}>
                <ApproverCell row={row} />
            </th>
            <ApproverRowCells row={row} scale={scale} />
        </tr>
    );
}

function ApproversCard({ approvers, filtered }: { approvers: RequestApprovalsBreakdown['approvers']; filtered: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const people = approvers.rows.filter((r) => !r.apart);
    const apart = approvers.rows.filter((r) => r.apart);
    const folds = !filtered && people.length > APPROVER_SHOWN;
    const shownPeople = folds && !open ? people.slice(0, APPROVER_SHOWN) : people;
    const scale = Math.max(1, ...approvers.rows.map((r) => r.steps));
    const totalLabel = t('rep_rqa_appr_total').replace('{n}', count(approvers.total.approvers, lang));

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqa_appr_title')}
                info={t('rep_rqa_appr_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {OUTCOME_PIECES.map((p) => (
                            <Swatch key={p.key} fill={FILL[p.tone as ChartTone]}>
                                {t(p.label)} <b className="text-foreground font-semibold">{count(approvers.total[p.key], lang)}</b>
                            </Swatch>
                        ))}
                    </span>
                }
            />
            {approvers.rows.length === 0 ? (
                <CardEmpty>{t('rep_rqa_appr_empty')}</CardEmpty>
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[44rem] table-fixed text-sm">
                        <caption className="sr-only">{t('rep_rqa_appr_title')}</caption>
                        <colgroup>
                            {APPROVER_COLS.map((w, i) => (
                                <col key={i} className={w} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqa_appr_col_name')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_rqa_appr_col_steps')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqa_appr_col_waiting')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqa_appr_col_avg')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqa_appr_col_max')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_rqa_appr_col_oldest')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shownPeople.map((row) => (
                                <ApproverRow key={row.key} row={row} scale={scale} />
                            ))}
                        </tbody>
                    </table>
                    {folds && <FoldToggle open={open} total={people.length} onToggle={() => setOpen((v) => !v)} />}
                    {/* Set-apart rows under the dashed rule, then the total: they stay put however the list above folds. */}
                    <table className="w-full min-w-[44rem] table-fixed text-sm">
                        <caption className="sr-only">{totalLabel}</caption>
                        <colgroup>
                            {APPROVER_COLS.map((w, i) => (
                                <col key={i} className={w} />
                            ))}
                        </colgroup>
                        <tbody>
                            {apart.map((row, i) => (
                                <ApproverRow
                                    key={row.key}
                                    row={row}
                                    scale={scale}
                                    className={cn(i === 0 && people.length > 0 && 'border-border border-t-2 border-dashed')}
                                />
                            ))}
                            <tr className="bg-muted/40 border-border border-t font-semibold">
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {totalLabel}
                                </th>
                                <ApproverRowCells row={approvers.total} scale={approvers.total.steps} total />
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── ended requests ─────────────────────────── */

const OUTCOMES: RequestEndingOutcome[] = ['rejected', 'withdrawn', 'not_delivered'];

const OUTCOME_TONE: Record<RequestEndingOutcome, 'red' | 'gray'> = { rejected: 'red', withdrawn: 'gray', not_delivered: 'gray' };

const STOP_TONES: ChartTone[] = ['blue', 'violet', 'access-file', 'orange', 'green'];

const ENDS_SHOWN = 5;

function EndingRow({ e }: { e: RequestEnding }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const pill =
        e.outcome === 'rejected'
            ? t('rep_rqa_pill_rejected').replace('{step}', e.stop_label ?? '')
            : e.outcome === 'withdrawn'
              ? t('rep_rqa_pill_withdrawn').replace('{step}', e.stop_label ?? '')
              : t('rep_rqa_pill_not_delivered');

    return (
        <li className="border-border/60 border-b px-5 py-2.5 last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <RequestLink id={e.request_id} reference={e.reference} />
                <RequestTypeLabel type={e.type} />
                <StatusBadge tone={OUTCOME_TONE[e.outcome]}>{pill}</StatusBadge>
                <span className="text-muted-foreground text-xs whitespace-nowrap md:ml-auto">{shortDate(e.at, lang)}</span>
            </div>
            <p className="mt-1 text-sm [overflow-wrap:anywhere]">
                {e.reason ? (
                    <>
                        {e.decided_by && <span className="text-muted-foreground">{e.decided_by}: </span>}“{e.reason}”
                    </>
                ) : (
                    <span className="text-muted-foreground">{t(e.outcome === 'withdrawn' ? 'rep_rqa_end_no_reason' : 'rep_rqa_end_no_note')}</span>
                )}
            </p>
        </li>
    );
}

function EndingsCard({ endings }: { endings: RequestApprovalsBreakdown['endings'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [params, setParams] = useSearchParams();
    const raw = params.get('end');
    const outcome = OUTCOMES.includes(raw as RequestEndingOutcome) ? (raw as RequestEndingOutcome) : null;
    const [open, setOpen] = useState(false);
    const rows = outcome ? endings.rows.filter((e) => e.outcome === outcome) : endings.rows;
    const { folds, shown } = fold(rows, ENDS_SHOWN, open, 0);
    const setOutcome = (next: RequestEndingOutcome | null) => {
        setOpen(false);
        setParams(
            (p) => {
                if (next) p.set('end', next);
                else p.delete('end');
                return p;
            },
            { replace: true },
        );
    };

    // "หยุดที่": one piece per stop step, by its usual place in the chain (mean step number), IT's closing last.
    const stopOf = (e: RequestEnding) => e.stop_label ?? '';
    const place = new Map<string, number[]>();
    endings.rows.forEach((e) => place.set(stopOf(e), [...(place.get(stopOf(e)) ?? []), e.stop_position ?? 99]));
    const meanPlace = (s: string) => {
        const at = place.get(s) ?? [99];
        return at.reduce((sum, n) => sum + n, 0) / at.length;
    };
    const stops = [...place.keys()].sort((a, b) => meanPlace(a) - meanPlace(b) || a.localeCompare(b));
    const stopName = (s: string) => (s === '' ? t('rep_rqa_end_it') : s);
    const stopTone = (s: string, i: number): ChartTone => (s === '' ? 'gray' : STOP_TONES[i % STOP_TONES.length]);
    const pieces = stops
        .map((s, i) => ({ key: s || 'it', value: rows.filter((e) => stopOf(e) === s).length, fill: FILL[stopTone(s, i)], label: stopName(s) }))
        .filter((p) => p.value > 0);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_rqa_end_title')}
                info={t('rep_rqa_end_note')}
                sub={
                    <Segments
                        label={t('rep_rqa_end_seg')}
                        value={outcome}
                        onChange={setOutcome}
                        options={[
                            { value: null, label: t('rep_rqa_end_all'), count: endings.counts.all },
                            ...OUTCOMES.map((o) => ({
                                value: o as RequestEndingOutcome | null,
                                label: t(`rep_rqa_end_${o}`),
                                count: endings.counts[o],
                            })),
                        ]}
                    />
                }
            />
            {rows.length === 0 ? (
                <CardEmpty>{t(`rep_rqa_end_empty_${outcome ?? 'all'}`)}</CardEmpty>
            ) : (
                <>
                    <div className="border-border grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b px-5 py-3">
                        <span className="text-muted-foreground text-xs">{t('rep_rqa_end_stop')}</span>
                        <PieceBar pieces={pieces} scale={rows.length} label={pieces.map((p) => `${p.label} ${count(p.value, lang)}`).join(', ')} />
                        <span className="text-muted-foreground col-start-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {pieces.map((p) => (
                                <Swatch key={p.key} fill={p.fill}>
                                    {p.label} <b className="text-foreground font-semibold">{count(p.value, lang)}</b>
                                </Swatch>
                            ))}
                        </span>
                    </div>
                    <ul aria-live="polite">
                        {shown.map((e) => (
                            <EndingRow key={`${e.request_id}-${e.outcome}`} e={e} />
                        ))}
                    </ul>
                    {folds && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── skipped steps ─────────────────────────── */

const LABEL_TONES: ChartTone[] = ['blue', 'gray', 'violet', 'green', 'orange'];

/** "สิ่งที่ควรดู": a fixed sentence per reason with the names the backend found. */
function skipTodo(t: (key: string) => string, lang: Lang, s: RequestSkipReasonRow): { tone: TodoTone; text: string }[] {
    const names = (list: { name: string; code: string | null }[]) => list.map((x) => (x.code ? `${x.name} (${x.code})` : x.name)).join(', ');
    if (s.steps === 0) return [{ tone: 'muted', text: t('rep_rqa_todo_none') }];
    switch (s.reason) {
        case 'no_matching_position':
            return [
                { tone: 'ok', text: t('rep_rqa_todo_normal') },
                {
                    tone: 'muted',
                    text: t('rep_rqa_todo_top').replace('{list}', s.top_requesters.map((r) => `${r.name} ${count(r.count, lang)}`).join(', ')),
                },
            ];
        case 'no_resource_owner':
            return [
                ...(s.unapproved_requests > 0
                    ? [{ tone: 'warn' as const, text: t('rep_rqa_todo_unapproved').replace('{n}', count(s.unapproved_requests, lang)) }]
                    : []),
                s.ownerless_resources.length > 0
                    ? { tone: 'warn' as const, text: t('rep_rqa_todo_set_owner').replace('{list}', names(s.ownerless_resources)) }
                    : { tone: 'muted' as const, text: t('rep_rqa_todo_owner_done') },
            ];
        case 'no_manager':
            return [
                s.managerless_requesters.length > 0
                    ? { tone: 'warn', text: t('rep_rqa_todo_set_manager').replace('{list}', names(s.managerless_requesters)) }
                    : { tone: 'muted', text: t('rep_rqa_todo_manager_done') },
            ];
        case 'requester_is_owner':
            return [
                { tone: 'ok', text: t('rep_rqa_todo_self_owner') },
                ...(s.resources.length > 0 ? [{ tone: 'muted' as const, text: names(s.resources) }] : []),
            ];
        case 'no_department_approver':
            return s.departments.map((d) => ({
                tone: 'warn' as const,
                text: t('rep_rqa_todo_department')
                    .replace('{department}', labelOf(d.department, lang) ?? '—')
                    .replace('{positions}', d.positions.join(', ') || '—'),
            }));
    }
}

/** เหตุผลที่ข้าม, ขั้น, คำขอ, ขั้นที่ถูกข้าม, สิ่งที่ควรดู */
const SKIP_COLS = ['w-[24%]', 'w-[7%]', 'w-[7%]', 'w-[30%]', 'w-[32%]'];

function SkipsCard({ skips }: { skips: RequestSkipReasonRow[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const labels = [...new Set(skips.flatMap((s) => Object.keys(s.labels)))];
    const toneOf = (label: string) => LABEL_TONES[labels.indexOf(label) % LABEL_TONES.length];
    const scale = Math.max(1, ...skips.map((s) => s.steps));
    const totals = Object.fromEntries(labels.map((l) => [l, skips.reduce((sum, s) => sum + (s.labels[l] ?? 0), 0)]));

    return (
        <Card className="overflow-hidden">
            <CardTitle
                title={t('rep_rqa_skip_title')}
                info={t('rep_rqa_skip_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {labels.map((l) => (
                            <Swatch key={l} fill={FILL[toneOf(l)]}>
                                {l} <b className="text-foreground font-semibold">{count(totals[l], lang)}</b>
                            </Swatch>
                        ))}
                    </span>
                }
            />
            <div className="relative overflow-x-auto">
                <table className="w-full min-w-[44rem] table-fixed text-sm">
                    <caption className="sr-only">{t('rep_rqa_skip_title')}</caption>
                    <colgroup>
                        {SKIP_COLS.map((w, i) => (
                            <col key={i} className={w} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_rqa_skip_col_reason')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-right')}>
                                {t('rep_rqa_skip_col_steps')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-right')}>
                                {t('rep_rqa_skip_col_requests')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_rqa_skip_col_labels')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_rqa_skip_col_todo')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {skips.map((s) => (
                            <tr key={s.reason} className="border-border/60 border-b last:border-b-0">
                                <th
                                    scope="row"
                                    className={cn(TD, 'text-left', s.steps === 0 ? 'text-muted-foreground font-normal' : 'font-semibold')}
                                >
                                    {t(`rep_rqa_skip_${s.reason}`)}
                                </th>
                                <td className={cn(TD, NUM, s.steps === 0 && 'text-muted-foreground')}>{count(s.steps, lang)}</td>
                                <td className={cn(TD, NUM, s.steps === 0 && 'text-muted-foreground')}>{count(s.requests, lang)}</td>
                                <td className={TD}>
                                    {s.steps === 0 ? (
                                        <span className="text-muted-foreground">—</span>
                                    ) : (
                                        <PieceBar
                                            pieces={Object.entries(s.labels).map(([l, n]) => ({ key: l, value: n, fill: FILL[toneOf(l)], label: l }))}
                                            scale={scale}
                                        />
                                    )}
                                </td>
                                <td className={cn(TD, 'whitespace-normal')}>
                                    <TodoLines lines={skipTodo(t, lang, s)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

/* ─────────────────────────── row cells ─────────────────────────── */

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'gray'> = {
    approved: 'green',
    rejected: 'red',
    current: 'amber',
    skipped: 'gray',
    withdrawn: 'gray',
};

const STATUS_LABEL: Record<string, string> = {
    approved: 'req_trail_approved',
    rejected: 'req_trail_rejected',
    current: 'req_trail_waiting',
    skipped: 'req_trail_skipped',
    withdrawn: 'req_status_cancelled',
};

/** Columns drawn inside other cells — kept in the rows and the files. */
export const APPROVAL_INNER_COLUMNS = ['position', 'approver_code', 'approver_department', 'approver_kind', 'approver_flag', 'skip_reason'];

function ApproverRowCell({ row }: { row: Record<string, unknown> }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const name = str(row.approver);
    if (!name) return <span className="text-muted-foreground">—</span>;
    const kind = str(row.approver_kind);
    const flag = str(row.approver_flag);
    const department = labelOf((row.approver_department as ChartLabel | null) ?? null, lang);

    return (
        <span className="flex min-w-0 flex-col">
            <span className="max-w-[14rem] truncate font-medium" title={name}>
                {name}
            </span>
            <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                {kind === 'person' ? (
                    <>
                        {str(row.approver_code) && <span translate="no">{str(row.approver_code)}</span>}
                        {department && <span>{department}</span>}
                    </>
                ) : (
                    <span>{t(kind === 'group_step' ? 'rep_rqa_appr_group_step' : 'rep_rqa_appr_unlinked')}</span>
                )}
                {flag === 'left' && <span className="font-semibold text-red-700 dark:text-red-300">{t('rep_rqa_flag_left')}</span>}
                {flag === 'no_account' && <span className="font-semibold text-amber-700 dark:text-amber-300">{t('rep_rqa_flag_no_account')}</span>}
            </span>
        </span>
    );
}

/** The rows table's own cells: the approver, the step, the status pill, the note (or why the step was skipped). */
export function approvalCell(key: string, row: Record<string, unknown>): React.ReactNode | undefined {
    if (key === 'approver') return <ApproverRowCell row={row} />;
    if (key === 'request_type' && str(row.request_type)) return <RequestTypeLabel type={str(row.request_type) as string} />;
    if (key === 'step') return <StepCell row={row} />;
    if (key === 'status') return <StatusCell status={str(row.status)} />;
    if (key === 'note') return <NoteCell row={row} />;
    return undefined;
}

function StepCell({ row }: { row: Record<string, unknown> }) {
    const t = useT();
    return (
        <span className="flex flex-col whitespace-nowrap">
            {str(row.step)}
            <span className="text-muted-foreground text-xs">{t('rep_rqa_step_position').replace('{n}', String(row.position ?? '—'))}</span>
        </span>
    );
}

function StatusCell({ status }: { status: string | null }) {
    const t = useT();
    if (!status) return <span className="text-muted-foreground">—</span>;
    return <StatusBadge tone={STATUS_TONE[status] ?? 'gray'}>{t(STATUS_LABEL[status] ?? status)}</StatusBadge>;
}

function NoteCell({ row }: { row: Record<string, unknown> }) {
    const t = useT();
    const skip = str(row.skip_reason) as ApprovalSkipReason | null;
    const text = str(row.note) ?? (skip && REQUEST_SKIP_REASON_LABEL[skip] ? t(REQUEST_SKIP_REASON_LABEL[skip]) : null);
    if (!text) return <span className="text-muted-foreground">—</span>;
    return (
        <span className="text-muted-foreground block max-w-[20rem] text-xs whitespace-normal" title={text}>
            {text}
        </span>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            {[4, 6, 5, 5].map((rows, i) => (
                <Card key={i} className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={rows} />
                </Card>
            ))}
        </div>
    );
}

export function RequestApprovalsCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useRequestApprovalsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <StuckCard stuck={data.stuck} />
            <ApproversCard approvers={data.approvers} filtered={Boolean(filters.approver)} />
            <EndingsCard endings={data.endings} />
            <SkipsCard skips={data.skips} />
        </div>
    );
}
