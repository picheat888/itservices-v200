// Transfer history report cards: in/out by month, waiting now, acceptance, warehouses, departments, categories (data: useAssetTransferBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ArrowRight } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAssetTransferBreakdown } from '../hooks/use-reports';
import type { AssetTransferBreakdown, ChartLabel, ChartTone, TabularFilters } from '../types';
import { CardEmpty, CardTitle, fold, FoldToggle, monthLabel } from './chart-parts';
import { FILL } from './chart-tones';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { niceMax } from './weekly-ticket-chart';

type Lang = 'th' | 'en';
type Month = AssetTransferBreakdown['months'][number];
type Waiting = AssetTransferBreakdown['waiting'][number];
export type TransferKind = 'handover' | 'return' | 'recall' | 'relocate';

/** Each kind's colour and shape — out ▲, back ▼, moved ◆ — so it never reads by colour alone. */
export const KIND_STYLE: Record<TransferKind, { tone: ChartTone; shape: string }> = {
    handover: { tone: 'soft-blue', shape: '[clip-path:polygon(50%_0,100%_100%,0_100%)]' },
    return: { tone: 'soft-green', shape: '[clip-path:polygon(0_0,100%_0,50%_100%)]' },
    recall: { tone: 'soft-amber', shape: '[clip-path:polygon(0_0,100%_0,50%_100%)]' },
    relocate: { tone: 'gray', shape: '[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]' },
};

/** A kind's mark: its shape in its colour. */
export function KindMark({ kind }: { kind: TransferKind }) {
    return <i aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0', FILL[KIND_STYLE[kind].tone], KIND_STYLE[kind].shape)} />;
}

/** A wait longer than this many days is flagged. */
const LONG_WAIT_DAYS = 7;

/** Rows listed before the rest fold under "แสดงทั้งหมด". */
const ROWS_SHOWN = 10;

/** Waiting assets listed per group before the rest fold. */
const WAITING_SHOWN = 6;

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle';
const NUM = 'text-right font-mono tabular-nums';

const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';

const count = (n: number, lang: Lang) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');
const label = (l: ChartLabel | null, lang: Lang) => (l ? (lang === 'th' && l.name_th) || l.name : null);

/** "2026-09-23 09:00" → "23 ก.ย. 26" (Gregorian, as the rest of the app). */
export function shortDate(value: string, lang: Lang): string {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(y, m - 1, d),
    );
}

/** Hours as "29 ชม." under two days, else whole days — how long an acceptance or a wait took. */
export function spanText(t: (key: string) => string, hours: number): string {
    return hours < 48
        ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(hours))))
        : t('rep_days_n').replace('{n}', String(Math.floor(hours / 24)));
}

/* ─────────────────────────── in and out by month ─────────────────────────── */

const FLOW: { key: 'handover' | 'return' | 'recall'; label_key: string }[] = [
    { key: 'handover', label_key: 'asset_hist_kind_handover' },
    { key: 'return', label_key: 'asset_hist_kind_return' },
    { key: 'recall', label_key: 'asset_hist_kind_recall' },
];

function FlowLegend({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {FLOW.map((f) => (
                <span key={f.key} className="inline-flex items-center gap-1.5">
                    <KindMark kind={f.key} />
                    {t(f.label_key)}
                    <b className="text-foreground font-mono font-semibold tabular-nums">
                        {count(
                            months.reduce((s, m) => s + m[f.key], 0),
                            lang,
                        )}
                    </b>
                </span>
            ))}
        </span>
    );
}

/** A tidy axis top at or above the value whose half is a whole number: 11 → 12, 3 → 4, 41 → 50. */
function axisTop(value: number): number {
    const steps = [4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];
    return steps.find((s) => s >= value) ?? niceMax(value);
}

function MonthFlowCard({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const titleId = useId();
    const back = (m: Month) => m.return + m.recall;
    const up = axisTop(Math.max(0, ...months.map((m) => m.handover)));
    // The lower half never shrinks below a quarter of the upper, so a single return still reads.
    const down = axisTop(Math.max(Math.ceil(up / 4), ...months.map(back)));
    const out = months.reduce((s, m) => s + m.handover, 0);
    const inn = months.reduce((s, m) => s + back(m), 0);
    const peak = months.reduce<Month | null>((best, m) => (m.handover > (best?.handover ?? 0) ? m : best), null);
    const upAt = (v: number) => ({ bottom: `${(v / up) * 100}%` });
    const downAt = (v: number) => ({ top: `${(v / down) * 100}%` });

    return (
        <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
            <CardTitle
                id={titleId}
                title={t('rep_th_month_title')}
                note={
                    peak
                        ? t('rep_th_month_peak')
                              .replace('{month}', monthLabel(peak.month, lang, false, true))
                              .replace('{n}', count(peak.handover, lang))
                        : undefined
                }
                sub={<FlowLegend months={months} />}
            />
            {out + inn === 0 ? (
                <CardEmpty>{t('rep_th_empty')}</CardEmpty>
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <div role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-summary`} className="flex min-h-56 flex-1 gap-2">
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
                                <span className="text-muted-foreground absolute right-0 bottom-1 inline-flex items-center gap-1 text-[10.5px] leading-none whitespace-nowrap">
                                    <KindMark kind="handover" />
                                    {t('rep_th_axis_out')}
                                </span>
                            </div>
                            <div className="relative mb-[18px]" style={{ flex: down }}>
                                <span className="text-muted-foreground absolute top-1.5 right-0 inline-flex items-center gap-1 text-[10.5px] leading-none whitespace-nowrap">
                                    <KindMark kind="return" />
                                    {t('rep_th_axis_in')}
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
                            <div className="h-9 shrink-0" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="relative mt-[18px]" style={{ flex: up }}>
                                <div aria-hidden>
                                    {[up / 2, up].map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t" style={upAt(v)} />
                                    ))}
                                    {[up / 4, (up * 3) / 4].map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={upAt(v)} />
                                    ))}
                                </div>
                                <div aria-hidden className="absolute inset-0 flex items-end gap-1 sm:gap-2.5">
                                    {months.map((m) => (
                                        <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                                            <div className="relative w-full max-w-8" style={{ height: `${(m.handover / up) * 100}%` }}>
                                                {m.handover > 0 && (
                                                    <span className="absolute -top-[18px] right-0 left-0 text-center font-mono text-[11px] font-semibold tabular-nums">
                                                        {count(m.handover, lang)}
                                                    </span>
                                                )}
                                                <span
                                                    title={`${t('asset_hist_kind_handover')}: ${count(m.handover, lang)}`}
                                                    className={cn('block h-full rounded-t-md', FILL[KIND_STYLE.handover.tone])}
                                                />
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
                                <div aria-hidden className="absolute inset-0 flex items-start gap-1 sm:gap-2.5">
                                    {months.map((m) => (
                                        <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center">
                                            <div className="relative flex w-full max-w-8 flex-col" style={{ height: `${(back(m) / down) * 100}%` }}>
                                                {(['return', 'recall'] as const).map((k) =>
                                                    m[k] > 0 ? (
                                                        <span
                                                            key={k}
                                                            title={`${t(`asset_hist_kind_${k}`)}: ${count(m[k], lang)}`}
                                                            className={cn('block w-full basis-0 last:rounded-b-md', FILL[KIND_STYLE[k].tone])}
                                                            style={{ flexGrow: m[k] }}
                                                        />
                                                    ) : null,
                                                )}
                                                {back(m) > 0 && (
                                                    <span className="absolute right-0 -bottom-[18px] left-0 text-center font-mono text-[11px] font-semibold tabular-nums">
                                                        {count(back(m), lang)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div aria-hidden className="flex h-9 shrink-0 gap-1 pt-1.5 sm:gap-2.5">
                                {months.map((m) => (
                                    <div key={m.month} className="min-w-0 flex-1 text-center text-[10.5px] whitespace-nowrap">
                                        <b className="text-foreground block font-semibold">{monthLabel(m.month, lang, false)}</b>
                                        <span className="text-muted-foreground tabular-nums">{m.month.slice(2, 4)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p id={`${titleId}-summary`} className="sr-only">
                            {t('rep_th_month_aria')
                                .replace('{from}', monthLabel(months[0].month, lang, false, true))
                                .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                                .replace('{out}', count(out, lang))
                                .replace('{in}', count(inn, lang))}
                        </p>
                    </div>
                    <table className="sr-only">
                        <caption>{t('rep_th_month_title')}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('rep_wo_month_col')}</th>
                                {(['handover', 'return', 'recall'] as const).map((k) => (
                                    <th key={k} scope="col">
                                        {t(`asset_hist_kind_${k}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((m) => (
                                <tr key={m.month}>
                                    <th scope="row">{monthLabel(m.month, lang, false, true)}</th>
                                    <td>{count(m.handover, lang)}</td>
                                    <td>{count(m.return, lang)}</td>
                                    <td>{count(m.recall, lang)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── location updates ─────────────────────────── */

function RelocationCard({ relocations }: { relocations: AssetTransferBreakdown['relocations'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(relocations, ROWS_SHOWN, open);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_th_reloc_title')}
                note={t('rep_th_reloc_sub')}
                sub={relocations.length > 0 ? t('rep_th_reloc_count').replace('{n}', count(relocations.length, lang)) : undefined}
            />
            {relocations.length === 0 ? (
                <CardEmpty>{t('rep_th_reloc_empty')}</CardEmpty>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_th_reloc_title')}</caption>
                            <thead>
                                <tr className="bg-muted/40 border-border border-b">
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_th_reloc_col_at')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_th_reloc_col_asset')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_th_reloc_col_move')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_th_reloc_col_reason')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_th_reloc_col_by')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((r) => {
                                    const href = `/assets?view=${r.asset_id}`;
                                    return (
                                        <tr key={r.id} className="border-border/60 border-b last:border-b-0">
                                            <td className={cn(TD, 'whitespace-nowrap')}>{shortDate(r.at, lang)}</td>
                                            <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                                {canOpen(href) ? (
                                                    <Link to={href} className={CODE_LINK} translate="no">
                                                        {r.code}
                                                    </Link>
                                                ) : (
                                                    <span className="font-mono text-xs font-semibold" translate="no">
                                                        {r.code}
                                                    </span>
                                                )}
                                                <div className="text-muted-foreground max-w-[16rem] truncate text-xs" title={r.model}>
                                                    {r.model}
                                                </div>
                                            </th>
                                            <td className={TD}>
                                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                                    <span className="text-muted-foreground">{r.from ?? '—'}</span>
                                                    <ArrowRight
                                                        aria-label={t('rep_th_reloc_to')}
                                                        className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                                                    />
                                                    <span className="font-medium">{r.to}</span>
                                                </span>
                                            </td>
                                            <td className={TD}>
                                                {r.reason ? (
                                                    <div className="max-w-[18rem] truncate" title={r.reason}>
                                                        {r.reason}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className={cn(TD, 'whitespace-nowrap')}>
                                                {r.by ?? <span className="text-muted-foreground">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={relocations.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── waiting now ─────────────────────────── */

function WaitingRow({ w }: { w: Waiting }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const href = `/assets?view=${w.id}`;
    const cause = t(w.cause ? `rep_th_cause_${w.cause}` : 'rep_th_cause_since').replace('{date}', shortDate(w.since, lang));
    const who = [w.holder?.name ?? w.owner_label, label(w.holder?.department ?? null, lang), cause].filter((s): s is string => Boolean(s));
    const late = w.days > LONG_WAIT_DAYS;

    return (
        <li className="border-border/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b px-5 py-2.5 last:border-b-0">
            <span className="min-w-0 truncate text-sm">
                {canOpen(href) ? (
                    <Link to={href} className={CODE_LINK}>
                        {w.code}
                    </Link>
                ) : (
                    <span className="font-mono text-xs font-semibold">{w.code}</span>
                )}
                {w.model && <span className="text-muted-foreground ml-2 text-xs">{w.model}</span>}
            </span>
            <span className="row-span-2" title={late ? t('rep_th_wait_long') : undefined}>
                <StatusBadge tone={late ? 'red' : 'gray'} className="font-mono tabular-nums">
                    {t('rep_days_n').replace('{n}', count(w.days, lang))}
                    {late && <span className="sr-only">{t('rep_th_wait_long')}</span>}
                </StatusBadge>
            </span>
            <span className="text-muted-foreground flex min-w-0 gap-x-3 text-xs" title={who.join('\n')}>
                {who.map((part) => (
                    <span key={part} className="truncate">
                        {part}
                    </span>
                ))}
            </span>
        </li>
    );
}

function WaitingGroup({ title, rows, first }: { title: string; rows: Waiting[]; first?: boolean }) {
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(rows, WAITING_SHOWN, open);
    if (rows.length === 0) return null;

    return (
        <section>
            <h3
                className={cn(
                    'bg-muted/50 border-border text-muted-foreground flex items-baseline justify-between border-b px-5 py-2 text-xs font-semibold',
                    !first && 'border-t',
                )}
            >
                {title}
                <b className="text-foreground font-mono tabular-nums">{count(rows.length, lang)}</b>
            </h3>
            <ul>
                {shown.map((w) => (
                    <WaitingRow key={w.id} w={w} />
                ))}
            </ul>
            {folds && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
        </section>
    );
}

function WaitingCard({ waiting }: { waiting: Waiting[] }) {
    const t = useT();
    const accept = waiting.filter((w) => w.status === 'pending_acceptance');
    const back = waiting.filter((w) => w.status === 'pending_return');

    return (
        <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <CardTitle title={t('rep_th_wait_title')} note={t('rep_th_wait_sub')} />
            {waiting.length === 0 ? (
                <CardEmpty>{t('rep_th_wait_empty')}</CardEmpty>
            ) : (
                <>
                    <WaitingGroup title={t('rep_th_wait_accept')} rows={accept} first />
                    <WaitingGroup title={t('rep_th_wait_return')} rows={back} first={accept.length === 0} />
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── acceptance ─────────────────────────── */

const ACCEPT_TILES: { key: 'same_day' | 'next_day' | 'later' | 'waiting' | 'closed'; label_key: string; edge: string }[] = [
    { key: 'same_day', label_key: 'rep_th_acc_same_day', edge: 'border-t-emerald-500' },
    { key: 'next_day', label_key: 'rep_th_acc_next_day', edge: 'border-t-blue-500' },
    { key: 'later', label_key: 'rep_th_acc_later', edge: 'border-t-amber-500' },
    { key: 'waiting', label_key: 'rep_th_acc_waiting', edge: 'border-t-red-500' },
    { key: 'closed', label_key: 'rep_th_acc_closed', edge: 'border-t-slate-400' },
];

function AcceptanceCard({ acceptance: a }: { acceptance: AssetTransferBreakdown['acceptance'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const values = { same_day: a.same_day, next_day: a.next_day, later: a.later, waiting: a.waiting, closed: a.recalled + a.never_accepted };
    const n = (key: string, v: Record<string, number>) => Object.entries(v).reduce((s, [k, x]) => s.replaceAll(`{${k}}`, count(x, lang)), t(key));
    const notes = [
        a.later > 0 && a.later_weekend === a.later ? n('rep_th_acc_weekend_all', { n: a.later }) : null,
        a.later_weekend > 0 && a.later_weekend < a.later ? n('rep_th_acc_weekend_some', { w: a.later_weekend, n: a.later }) : null,
        values.closed > 0 ? n('rep_th_acc_closed_note', { r: a.recalled, n: a.never_accepted }) : null,
        a.to_shared > 0 ? n('rep_th_acc_shared_note', { n: a.to_shared }) : null,
    ].filter((s): s is string => s !== null);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_th_acc_title')} note={n('rep_th_acc_sub', { n: a.to_people })} />
            {a.to_people === 0 ? (
                <CardEmpty>{t('rep_th_acc_empty')}</CardEmpty>
            ) : (
                <>
                    <ul className="grid grid-cols-2 gap-2 px-5 pt-4 pb-3 sm:grid-cols-3 md:grid-cols-5">
                        {ACCEPT_TILES.map((tile) => (
                            <li key={tile.key} className={cn('bg-muted/60 flex flex-col gap-0.5 rounded-lg border-t-[3px] px-3 py-2.5', tile.edge)}>
                                <b className={cn('font-mono text-xl font-bold tabular-nums', values[tile.key] === 0 && 'text-muted-foreground')}>
                                    {count(values[tile.key], lang)}
                                </b>
                                <span className="text-muted-foreground text-xs">{t(tile.label_key)}</span>
                            </li>
                        ))}
                    </ul>
                    {notes.length > 0 && (
                        <ul className="text-muted-foreground space-y-1 px-5 pb-4 text-xs">
                            {notes.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── warehouses ─────────────────────────── */

function WarehouseCard({ warehouses }: { warehouses: AssetTransferBreakdown['warehouses'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const max = Math.max(1, ...warehouses.map((w) => Math.max(w.out, w.back)));

    return (
        <Card className="overflow-hidden">
            <CardTitle
                title={t('rep_th_wh_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1.5">
                            <KindMark kind="return" />
                            {t('rep_th_wh_col_back')}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <KindMark kind="handover" />
                            {t('rep_th_wh_col_out')}
                        </span>
                    </span>
                }
            />
            {warehouses.length === 0 ? (
                <CardEmpty>{t('rep_th_empty')}</CardEmpty>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_th_wh_title')}</caption>
                        <thead>
                            <tr className="bg-muted/40 border-border border-b">
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_th_wh_col_name')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_th_wh_col_back')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-center')}>
                                    <span className="sr-only">{t('rep_th_wh_col_bar')}</span>
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_th_wh_col_out')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {warehouses.map((w) => (
                                <tr key={w.name} className="border-border/60 border-b last:border-b-0">
                                    <th scope="row" className={cn(TD, 'max-w-[12rem] truncate text-left font-normal')} title={w.name}>
                                        {w.name}
                                    </th>
                                    <td className={cn(TD, NUM, w.back === 0 && 'text-muted-foreground')}>{count(w.back, lang)}</td>
                                    <td className={cn(TD, 'w-1/2')}>
                                        {/* Back in grows left from the middle, out grows right. */}
                                        <div aria-hidden className="grid min-w-[9rem] grid-cols-2 gap-0.5">
                                            <span className="flex justify-end">
                                                <span
                                                    className={cn('block h-2.5 rounded-l-full', FILL[KIND_STYLE.return.tone])}
                                                    style={{ width: `${(w.back / max) * 100}%` }}
                                                />
                                            </span>
                                            <span
                                                className={cn('block h-2.5 rounded-r-full', FILL[KIND_STYLE.handover.tone])}
                                                style={{ width: `${(w.out / max) * 100}%` }}
                                            />
                                        </div>
                                    </td>
                                    <td className={cn(TD, NUM, 'font-semibold', w.out === 0 && 'text-muted-foreground font-normal')}>
                                        {count(w.out, lang)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── departments and categories ─────────────────────────── */

type BarRow = { key: string; name: string; value: number; muted?: boolean };

function BarList({ rows, apart }: { rows: BarRow[]; apart?: BarRow | null }) {
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(rows, ROWS_SHOWN, open);
    const max = Math.max(1, ...rows.map((r) => r.value), apart?.value ?? 0);
    const line = (r: BarRow, isApart = false) => (
        <li
            key={r.key}
            className={cn(
                'grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm',
                isApart && 'border-border border-t-2 border-dashed pt-2.5',
            )}
        >
            <span className={cn('truncate', (r.muted || isApart) && 'text-muted-foreground')} title={r.name}>
                {r.name}
            </span>
            <span aria-hidden className="bg-muted block h-2.5 overflow-hidden rounded-full">
                <span
                    className={cn('block h-full rounded-full', isApart ? FILL['asset-common'] : FILL[KIND_STYLE.handover.tone])}
                    style={{ width: `${(r.value / max) * 100}%` }}
                />
            </span>
            <b className="text-right font-mono font-semibold tabular-nums">{count(r.value, lang)}</b>
        </li>
    );

    return (
        <>
            <ul className="space-y-2.5 px-5 py-4">
                {shown.map((r) => line(r))}
                {apart && apart.value > 0 && line(apart, true)}
            </ul>
            {folds && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
        </>
    );
}

function DepartmentCard({ departments, shared }: { departments: AssetTransferBreakdown['departments']; shared: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const total = departments.reduce((s, d) => s + d.count, 0);
    const rows = departments.map((d) => ({
        key: String(d.department_id ?? 'none'),
        name: label(d.name === null ? null : { name: d.name, name_th: d.name_th }, lang) ?? t('rep_th_no_department'),
        value: d.count,
        muted: d.name === null,
    }));

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_th_dept_title')}
                note={t('rep_th_dept_sub').replace('{n}', count(departments.length, lang)).replace('{m}', count(total, lang))}
            />
            {rows.length === 0 && shared === 0 ? (
                <CardEmpty>{t('rep_th_empty')}</CardEmpty>
            ) : (
                <BarList rows={rows} apart={{ key: 'shared', name: t('rep_th_dept_shared'), value: shared }} />
            )}
        </Card>
    );
}

function CategoryCard({ categories }: { categories: AssetTransferBreakdown['categories'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const total = categories.reduce((s, c) => s + c.count, 0);
    const rows = categories.map((c) => ({
        key: c.name ?? 'none',
        name: label(c.name === null ? null : { name: c.name, name_th: c.name_th }, lang) ?? t('rep_th_no_category'),
        value: c.count,
        muted: c.name === null,
    }));

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_th_cat_title')}
                note={t('rep_th_cat_sub').replace('{n}', count(categories.length, lang)).replace('{m}', count(total, lang))}
            />
            {rows.length === 0 ? <CardEmpty>{t('rep_th_empty')}</CardEmpty> : <BarList rows={rows} />}
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
                    <BarRowsSkeleton rows={6} />
                </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={3} />
                </Card>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={4} />
                </Card>
            </div>
        </div>
    );
}

export function TransferCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAssetTransferBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <MonthFlowCard months={data.months} />
                <WaitingCard waiting={data.waiting} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <AcceptanceCard acceptance={data.acceptance} />
                <WarehouseCard warehouses={data.warehouses} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <DepartmentCard departments={data.departments} shared={data.acceptance.to_shared} />
                <CategoryCard categories={data.categories} />
            </div>
            <RelocationCard relocations={data.relocations} />
        </div>
    );
}
