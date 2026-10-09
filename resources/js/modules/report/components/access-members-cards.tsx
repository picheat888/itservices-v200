// Resource members report cards: type segments, File Share space, the resource table, the picked resource's owner strip and review sheet (data: useAccessMembersBreakdown).
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useAccessMembersBreakdown, useAccessReviewSheet } from '../hooks/use-reports';
import type { AccessDepartment, AccessMemberKind, AccessMembersBreakdown, AccessMembersResource, AccessType, ChartTone, TabularFilters } from '../types';
import { CardEmpty, CardTitle, fold, FoldToggle } from './chart-parts';
import { FILL } from './chart-tones';
import { GroupRow, NUM, registryOptions, ResourceHead, Segments, SIDE_BODY, SIDE_CARD, TD, TH, TypeLabel } from './access-overview-cards';
import { BarRowsSkeleton, CardHeadingSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { shortDate } from './transfer-cards';

type Lang = 'th' | 'en';
type Patch = (next: TabularFilters) => void;
type Resource = AccessMembersResource;
type Sheet = NonNullable<AccessMembersBreakdown['sheet']>;

/** The registries an owner reviews — software has its own report. */
const MEMBER_TYPES: AccessType[] = ['email_group', 'file_share', 'social_platform'];

/** Each kind of member's tone, in the bar's order. */
const MIX: { key: AccessMemberKind; tone: ChartTone; label: string }[] = [
    { key: 'in_dept', tone: 'soft-blue', label: 'rep_ar_mix_in_dept' },
    { key: 'cross', tone: 'soft-amber', label: 'rep_ar_mix_cross' },
    { key: 'gone', tone: 'soft-red', label: 'rep_ar_mix_gone' },
    { key: 'open', tone: 'gray', label: 'rep_ar_mix_open' },
];

/** Resource rows listed before the rest fold. */
const ROWS_SHOWN = 10;

/** File share sizes to GB (AccessResourceMembersReport::TO_GB). */
const TO_GB: Record<string, number> = { KB: 1 / 1048576, GB: 1, TB: 1024, PB: 1048576 };

const count = (n: number, lang: Lang) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');
const deptName = (d: AccessDepartment, lang: Lang) => (d ? (lang === 'th' && d.name_th) || d.name : null);
const keyOf = (r: Pick<Resource, 'type' | 'id'>) => `${r.type}:${r.id}`;

/** "500 GB", or "ไม่จำกัด" for 0. */
function sizeText(t: (key: string) => string, lang: Lang, size: Resource['size']): string | null {
    if (!size) return null;
    return size.value === 0 ? t('rep_ar_size_unlimited') : `${count(size.value, lang)} ${size.unit ?? ''}`.trim();
}

/** Whole GB as "700 GB", from a terabyte as "2.32 TB". */
function gbText(lang: Lang, gb: number): string {
    return gb >= 1024
        ? `${(Math.round((gb / 1024) * 100) / 100).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')} TB`
        : `${count(Math.round(gb), lang)} GB`;
}

const gbOf = (r: Resource) => (r.size && r.size.value > 0 ? r.size.value * (TO_GB[r.size.unit ?? ''] ?? 0) : 0);

/* ─────────────────────────── segments and the list's heading ─────────────────────────── */

/** The type filter as segments in the filter bar, each with its resources. */
export function AccessMembersTypeSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useAccessMembersBreakdown(filters);
    return (
        <Segments
            size="md"
            label={t('rep_fl_ac_type')}
            options={registryOptions(t, MEMBER_TYPES, data?.types)}
            value={(filters.type as AccessType | null | undefined) ?? null}
            onChange={(type) => patch({ type, resource: null })}
        />
    );
}

/** Beside the list's heading: the picked resource (cleared with ✕), active / cross / revoked, and the order. */
export function AccessMembersListLead({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useAccessMembersBreakdown(filters);
    const picked = data?.sheet ?? null;
    const sort = (filters.sort as string | null | undefined) ?? 'resource';

    return (
        <>
            {filters.resource && (
                <button
                    type="button"
                    onClick={() => patch({ resource: null })}
                    aria-label={t('rep_ar_unpick')}
                    className="bg-brand/10 text-brand hover:bg-brand/20 focus-visible:ring-brand inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-full px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                >
                    <span className="truncate">{picked?.name ?? String(filters.resource)}</span>
                    <X aria-hidden className="h-3 w-3 shrink-0" />
                </button>
            )}
            <Segments
                label={t('rep_fl_ar_state')}
                options={(['active', 'cross', 'revoked'] as const).map((s) => ({ value: s as string, label: t(`rep_ar_state_${s}`), count: data ? data.states[s] : null }))}
                value={(filters.state as string | null | undefined) ?? 'active'}
                onChange={(state) => patch({ state })}
            />
            <span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
                {t('rep_fl_ar_sort')}
                <Select value={sort} onValueChange={(value) => patch({ sort: value })}>
                    <SelectTrigger className="h-7 w-40 text-xs" aria-label={t('rep_fl_ar_sort')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {['resource', 'employee', 'department', 'newest', 'oldest'].map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                                {t(`rep_ar_sort_${s}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </span>
        </>
    );
}

/* ─────────────────────────── File Share space ─────────────────────────── */

function StorageCards({ resources }: { resources: Resource[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const shares = resources.filter((r) => r.type === 'file_share' && r.size);
    const capped = shares.filter((r) => gbOf(r) > 0).sort((a, b) => gbOf(b) - gbOf(a) || (a.code ?? '').localeCompare(b.code ?? ''));
    const unlimited = shares.filter((r) => r.size?.value === 0);
    const total = capped.reduce((s, r) => s + gbOf(r), 0);
    const byDept = new Map<string, { name: string; muted: boolean; count: number; gb: number; unlimited: number }>();
    for (const r of shares) {
        const name = deptName(r.department, lang) ?? t('rep_ac_no_department');
        const row = byDept.get(name) ?? { name, muted: r.department === null, count: 0, gb: 0, unlimited: 0 };
        row.count += 1;
        row.gb += gbOf(r);
        row.unlimited += r.size?.value === 0 ? 1 : 0;
        byDept.set(name, row);
    }
    const rows = [...byDept.values()].sort((a, b) => b.gb - a.gb || a.name.localeCompare(b.name, 'th'));
    const scale = Math.max(1, ...rows.map((r) => r.gb));
    const pct = (gb: number) => `${(Math.round((gb / total) * 1000) / 10).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}%`;
    const flag = (v: number) =>
        v > 0 ? (
            <StatusBadge tone="gray" className="font-mono tabular-nums">
                {count(v, lang)}
            </StatusBadge>
        ) : (
            <span className="text-muted-foreground font-mono">0</span>
        );
    if (shares.length === 0) return null;

    return (
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
                <CardTitle
                    title={t('rep_ar_space_title')}
                    sub={
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>{t('rep_ar_space_sub')}</span>
                            <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className={cn('inline-block h-2 w-2 rounded-full', FILL['access-file'])} />
                                {t('rep_ar_space_allocated')}
                            </span>
                        </span>
                    }
                />
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_ar_space_title')}</caption>
                        <thead>
                            <tr className="bg-muted/40 border-border border-b">
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_ac_dept_col_name')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_ar_space_col_shares')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_ar_space_col_allocated')}
                                </th>
                                <th scope="col" className={cn(TH, 'w-1/2 text-left')}>
                                    {t('rep_ar_space_col_share')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_ar_size_unlimited')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.name} className="border-border/60 border-b last:border-b-0">
                                    <th scope="row" className={cn(TD, 'max-w-[12rem] truncate text-left font-medium', r.muted && 'text-muted-foreground font-normal')}>
                                        {r.name}
                                    </th>
                                    <td className={cn(TD, NUM)}>{count(r.count, lang)}</td>
                                    <td className={cn(TD, NUM, 'font-semibold')}>
                                        {r.gb > 0 ? gbText(lang, r.gb) : <span className="text-muted-foreground font-normal">{t('rep_ar_size_unlimited')}</span>}
                                    </td>
                                    <td className={TD}>
                                        {r.gb > 0 ? (
                                            <div className="bg-muted h-5 min-w-[9rem] overflow-hidden rounded-full">
                                                <div
                                                    title={`${r.name}: ${gbText(lang, r.gb)}`}
                                                    className={cn(
                                                        'flex h-full items-center justify-center font-mono text-[10.5px] font-semibold whitespace-nowrap text-white tabular-nums [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]',
                                                        FILL['access-file'],
                                                    )}
                                                    style={{ width: `max(${(r.gb / scale) * 100}%, 2.75rem)` }}
                                                >
                                                    {pct(r.gb)}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">{t('rep_ar_space_not_counted')}</span>
                                        )}
                                    </td>
                                    <td className={cn(TD, 'text-right')}>{flag(r.unlimited)}</td>
                                </tr>
                            ))}
                            <tr className="bg-muted/40 border-border border-t font-semibold">
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_ac_dept_total').replace('{n}', count(rows.length, lang))}
                                </th>
                                <td className={cn(TD, NUM)}>{count(shares.length, lang)}</td>
                                <td className={cn(TD, NUM)}>{gbText(lang, total)}</td>
                                <td className={cn(TD, 'text-muted-foreground text-xs font-normal')}>{t('rep_ar_space_total_note')}</td>
                                <td className={cn(TD, 'text-right')}>{flag(unlimited.length)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
            <Card className={cn(SIDE_CARD, shares.length <= 4 && 'lg:min-h-0 lg:[contain:none]')}>
                <CardTitle title={t('rep_ar_space_list_title')} sub={t('rep_ar_space_list_sub')} />
                <dl className="border-border grid grid-cols-3 gap-3 border-b px-5 pt-1 pb-3">
                    {[
                        [t('rep_ar_space_total'), gbText(lang, total)],
                        [t('rep_ar_space_col_shares'), count(shares.length, lang)],
                        [t('rep_ar_size_unlimited'), count(unlimited.length, lang)],
                    ].map(([k, v]) => (
                        <div key={k} className="min-w-0">
                            <dt className="text-muted-foreground text-xs">{k}</dt>
                            <dd className="font-mono text-xl font-bold tabular-nums">{v}</dd>
                        </div>
                    ))}
                </dl>
                <div className={SIDE_BODY}>
                    {[
                        { title: t('rep_ar_space_capped'), rows: capped },
                        { title: t('rep_ar_size_unlimited'), rows: unlimited },
                    ]
                        .filter((g) => g.rows.length > 0)
                        .map((g, i) => (
                            <section key={g.title}>
                                <h3
                                    className={cn(
                                        'bg-muted/50 border-border text-muted-foreground flex items-baseline justify-between border-b px-5 py-2 text-xs font-semibold',
                                        i > 0 && 'border-t',
                                    )}
                                >
                                    {g.title}
                                    <b className="text-foreground font-mono tabular-nums">{count(g.rows.length, lang)}</b>
                                </h3>
                                <ul>
                                    {g.rows.map((r) => (
                                        <GroupRow
                                            key={keyOf(r)}
                                            head={<ResourceHead r={r} />}
                                            side={
                                                gbOf(r) > 0 ? (
                                                    <b className="font-mono text-sm tabular-nums">{sizeText(t, lang, r.size)}</b>
                                                ) : (
                                                    <StatusBadge tone="gray">{t('rep_ar_size_unlimited')}</StatusBadge>
                                                )
                                            }
                                            sub={[r.detail, deptName(r.department, lang), gbOf(r) > 0 && total > 0 ? pct(gbOf(r)) : null]}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                </div>
            </Card>
        </div>
    );
}

/* ─────────────────────────── the resource table ─────────────────────────── */

/** Who the members are, one bar on the table's scale with the counts in the pieces. */
function MixBar({ mix, scale }: { mix: Resource['mix']; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const parts = MIX.filter((m) => mix[m.key] > 0);
    const total = parts.reduce((s, m) => s + mix[m.key], 0);
    if (total === 0) return <span className="text-muted-foreground text-xs">{t('rep_ar_no_members')}</span>;

    return (
        <div className="bg-muted h-5 min-w-[8rem] overflow-hidden rounded-full">
            <div
                role="img"
                aria-label={parts.map((m) => `${t(m.label)} ${count(mix[m.key], lang)}`).join(', ')}
                className="flex h-full gap-px"
                style={{ width: `max(${(total / scale) * 100}%, ${parts.length * 1.75}rem)` }}
            >
                {parts.map((m) => (
                    <span
                        key={m.key}
                        title={`${t(m.label)}: ${count(mix[m.key], lang)}`}
                        className={cn(
                            'flex min-w-[1.5rem] basis-0 items-center justify-center font-mono text-[10.5px] font-semibold text-white tabular-nums [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]',
                            FILL[m.tone],
                        )}
                        style={{ flexGrow: mix[m.key] }}
                    >
                        {count(mix[m.key], lang)}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** What to do about a resource, most pressing first — the warranty / contract cards' "สิ่งที่ต้องทำ". */
function Todo({ r }: { r: Resource }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const lines: { tone: 'bad' | 'warn' | 'ok' | 'muted'; text: string }[] = [];
    if (r.mix.gone > 0) lines.push({ tone: 'bad', text: t('rep_ar_todo_revoke_leavers').replace('{n}', count(r.mix.gone, lang)) });
    if (r.owner_issue === 'gone') lines.push({ tone: 'bad', text: t('rep_ar_todo_owner_gone') });
    if (r.owner_issue === 'none') lines.push({ tone: 'warn', text: t('rep_ar_todo_owner_none') });
    if (r.mix.cross > 0) lines.push({ tone: 'warn', text: t('rep_ar_todo_confirm_cross').replace('{n}', count(r.mix.cross, lang)) });
    if (r.members === 0) lines.push({ tone: 'muted', text: t('rep_ar_todo_no_members') });
    if (lines.length === 0) lines.push({ tone: 'ok', text: t('rep_ar_todo_none') });
    const ink = {
        bad: 'font-semibold text-red-700 dark:text-red-300',
        warn: 'font-semibold text-amber-700 dark:text-amber-300',
        ok: 'font-semibold text-emerald-700 dark:text-emerald-300',
        muted: 'text-muted-foreground',
    };

    return (
        <div className="min-w-0 text-sm">
            <div className={ink[lines[0].tone]}>{lines[0].text}</div>
            {lines.slice(1).map((l) => (
                <div key={l.text} className="text-muted-foreground text-xs">
                    {l.text}
                </div>
            ))}
        </div>
    );
}

function OwnerCell({ r }: { r: Resource }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (r.type === 'social_platform') return <span className="text-muted-foreground text-xs">{t('rep_ar_no_owner_registry')}</span>;
    if (!r.owner) return <StatusBadge tone="amber">{t('rep_ar_owner_none')}</StatusBadge>;
    return (
        <div className="min-w-0">
            <div className="max-w-[12rem] truncate">{r.owner.name}</div>
            <div className="text-muted-foreground font-mono text-xs">
                {r.owner.code}
                {r.owner_issue === 'gone' && (
                    <span className="ml-2 font-sans text-red-700 dark:text-red-300">
                        {t('rep_ar_owner_left_on').replace('{date}', r.owner.last_day ? shortDate(r.owner.last_day, lang) : '—')}
                    </span>
                )}
            </div>
        </div>
    );
}

function ResourceTableCard({ resources, filters, patch }: { resources: Resource[]; filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const used = resources.filter((r) => r.members > 0);
    const ordered = [...used, ...resources.filter((r) => r.members === 0)];
    const { folds, shown } = fold(ordered, ROWS_SHOWN, open);
    const scale = Math.max(1, ...resources.map((r) => r.members));
    const legend = MIX.filter((m) => resources.some((r) => r.mix[m.key] > 0));
    const pick = (r: Resource) => {
        patch({ resource: keyOf(r), state: 'active' });
        requestAnimationFrame(() => document.getElementById('report-rows')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_ar_res_title')}
                note={t('rep_ar_res_note')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {legend.map((m) => (
                            <span key={m.key} className="inline-flex items-center gap-1.5">
                                <i aria-hidden className={cn('inline-block h-2 w-2 rounded-full', FILL[m.tone])} />
                                {t(m.label)}
                            </span>
                        ))}
                    </span>
                }
            />
            {resources.length === 0 ? (
                <CardEmpty>{t('rep_ar_res_empty')}</CardEmpty>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_ar_res_title')}</caption>
                            <thead>
                                <tr className="bg-muted/40 border-border border-b">
                                    {['rep_ar_col_resource', 'rep_c_ac_type', 'rep_ac_dept_col_name', 'rep_c_ar_owner', 'rep_ar_col_members', 'rep_ar_col_todo'].map((k) => (
                                        <th key={k} scope="col" className={cn(TH, 'text-left')}>
                                            {t(k)}
                                        </th>
                                    ))}
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_ar_col_list')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((r, i) => {
                                    const apart = r.members === 0 && used.length > 0 && (i === 0 || shown[i - 1].members > 0);
                                    const picked = filters.resource === keyOf(r);
                                    const sub = [r.detail, sizeText(t, lang, r.size)].filter((s): s is string => Boolean(s));
                                    return (
                                        <tr
                                            key={keyOf(r)}
                                            className={cn('border-border/60 border-b last:border-b-0', apart && '[&>td]:border-border [&>td]:border-t-2 [&>td]:border-dashed', picked && 'bg-brand/5')}
                                        >
                                            <td className={TD}>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <ResourceHead r={r} />
                                                    </div>
                                                    <div className="text-muted-foreground flex max-w-[16rem] gap-x-3 text-xs" title={sub.join('\n')} translate="no">
                                                        {sub.map((part) => (
                                                            <span key={part} className="truncate">
                                                                {part}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={TD}>
                                                <TypeLabel type={r.type} />
                                            </td>
                                            <td className={cn(TD, !r.department && 'text-muted-foreground')}>{deptName(r.department, lang) ?? '—'}</td>
                                            <td className={TD}>
                                                <OwnerCell r={r} />
                                            </td>
                                            <td className={cn(TD, 'w-1/4')}>
                                                <MixBar mix={r.mix} scale={scale} />
                                                {r.type === 'file_share' && r.members > 0 && (
                                                    <div className="text-muted-foreground mt-1 text-xs">
                                                        {t('rep_ar_levels').replace('{read}', count(r.read, lang)).replace('{write}', count(r.write, lang))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={TD}>
                                                <Todo r={r} />
                                            </td>
                                            <td className={cn(TD, 'text-right')}>
                                                {r.members > 0 ? (
                                                    <button
                                                        type="button"
                                                        aria-pressed={picked}
                                                        onClick={() => (picked ? patch({ resource: null }) : pick(r))}
                                                        aria-label={t('rep_ar_pick_aria').replace('{name}', r.name ?? '').replace('{n}', count(r.members, lang))}
                                                        className={cn(
                                                            'border-border focus-visible:ring-brand rounded-full border px-2 py-px text-[11px] font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none',
                                                            picked ? 'bg-brand text-brand-foreground border-brand' : 'text-brand hover:bg-brand/10',
                                                        )}
                                                    >
                                                        {t('rep_ar_pick').replace('{n}', count(r.members, lang))}
                                                    </button>
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

/* ─────────────────────────── the picked resource: owner strip and review sheet ─────────────────────────── */

function OwnerStrip({ sheet, onOpen }: { sheet: Sheet; onOpen: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const flags = [
        sheet.mix.cross > 0 ? t('rep_ar_strip_cross').replace('{n}', count(sheet.mix.cross, lang)) : null,
        sheet.mix.gone > 0 ? t('rep_ar_strip_gone').replace('{n}', count(sheet.mix.gone, lang)) : null,
    ].filter(Boolean);
    const fact = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
        <div className="min-w-0">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-sm">{value}</div>
            {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
        </div>
    );

    return (
        <Card className="bg-muted/40 flex flex-wrap items-end gap-x-8 gap-y-3 px-5 py-3">
            {fact(
                t('rep_ar_col_resource'),
                <span>
                    <b>{sheet.name}</b> <span className="text-muted-foreground font-mono text-xs">{sheet.code}</span>
                </span>,
                <span className="inline-flex items-center gap-2" translate="no">
                    <TypeLabel type={sheet.type} />
                    {sheet.detail}
                </span>,
            )}
            {fact(t('rep_ac_dept_col_name'), deptName(sheet.department, lang) ?? <span className="text-muted-foreground">{t('rep_ar_no_department')}</span>)}
            {fact(
                sheet.type === 'email_group' ? t('rep_ar_owner_approver') : t('rep_c_ar_owner'),
                sheet.type === 'social_platform' ? (
                    <span className="text-muted-foreground">{t('rep_ar_no_owner_registry')}</span>
                ) : sheet.owner ? (
                    <span>
                        <b>{sheet.owner.name}</b>{' '}
                        <span className="text-muted-foreground text-xs">
                            {sheet.owner.code} · {deptName(sheet.owner.department, lang) ?? '—'}
                        </span>
                        {sheet.owner_issue === 'gone' && (
                            <StatusBadge tone="red" className="ml-2">
                                {t('rep_ar_owner_left')}
                            </StatusBadge>
                        )}
                    </span>
                ) : (
                    <StatusBadge tone="amber">{t('rep_ar_owner_none')}</StatusBadge>
                ),
            )}
            {fact(t('rep_ar_strip_members'), <b>{t('rep_ac_people_n').replace('{n}', count(sheet.list.length, lang))}</b>, flags.join(' · ') || undefined)}
            <Button variant="outline" size="sm" className="ml-auto" onClick={onOpen}>
                <FileText className="h-4 w-4" />
                {t('rep_ar_sheet_open')}
            </Button>
        </Card>
    );
}

/** The sheet as the PDF prints it — white paper whatever the theme. */
function SheetPaper({ sheet }: { sheet: Sheet }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const isFile = sheet.type === 'file_share';
    const ownable = sheet.type !== 'social_platform';
    const today = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
    const cell = 'border border-slate-300 px-2 py-1 align-top';

    return (
        <div className="rounded bg-white px-8 py-7 text-[12.5px] leading-normal text-slate-900 shadow-sm">
            <header className="mb-3 flex items-start justify-between border-b-2 border-slate-900 pb-2">
                <div>
                    <h3 className="text-lg font-bold">{t('rep_ar_sheet_title')}</h3>
                    <p className="text-xs text-slate-500">{t('rep_ar_sheet_asof').replace('{date}', today)}</p>
                </div>
                <span className="font-mono font-semibold">{sheet.code}</span>
            </header>
            <dl className="mb-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
                <dt className="text-slate-500">{t('rep_ar_col_resource')}</dt>
                <dd>
                    <b>{sheet.name}</b> · {t(`rep_ac_type_${sheet.type}`)}
                </dd>
                <dt className="text-slate-500">{t(`rep_ar_sheet_address_${sheet.type}`)}</dt>
                <dd translate="no">{sheet.detail ?? '—'}</dd>
                <dt className="text-slate-500">{t('rep_ac_dept_col_name')}</dt>
                <dd>{ownable ? (deptName(sheet.department, lang) ?? '—') : t('rep_ar_no_department')}</dd>
                <dt className="text-slate-500">{t('rep_c_ar_owner')}</dt>
                <dd>
                    {!ownable
                        ? t('rep_ar_sheet_no_owner')
                        : sheet.owner
                          ? `${sheet.owner.name} (${sheet.owner.code}) · ${deptName(sheet.owner.department, lang) ?? '—'}${sheet.owner_issue === 'gone' ? ` · ${t('rep_ar_owner_left')}` : ''}`
                          : t('rep_ar_owner_none')}
                </dd>
            </dl>
            <p className="mb-2 rounded bg-slate-100 px-2.5 py-2">{t('rep_ar_sheet_ask')}</p>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-slate-100 text-left">
                        <th className={cn(cell, 'w-8 text-right')}>#</th>
                        <th className={cell}>{t('rep_c_ac_employee')}</th>
                        <th className={cell}>{t('rep_ac_dept_col_name')}</th>
                        {isFile && <th className={cell}>{t('rep_c_ac_level')}</th>}
                        <th className={cell}>{t('rep_c_ac_purpose')}</th>
                        <th className={cell}>{t('rep_c_ac_granted_at')}</th>
                        <th className={cell}>{t('rep_ar_sheet_note')}</th>
                        <th className={cn(cell, 'w-14 text-center')}>{t('rep_ar_sheet_keep')}</th>
                        <th className={cn(cell, 'w-14 text-center')}>{t('rep_ar_sheet_revoke')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sheet.list.map((m, i) => (
                        <tr key={m.employee_id} className={cn(m.kind === 'gone' && 'bg-red-50')}>
                            <td className={cn(cell, 'text-right')}>{i + 1}</td>
                            <td className={cell}>
                                <b>{m.name}</b> <span className="font-mono text-[11.5px] text-slate-500">{m.code}</span>
                            </td>
                            <td className={cell}>{deptName(m.department, lang) ?? '—'}</td>
                            {isFile && <td className={cell}>{t(`rep_ac_level_${m.level.toLowerCase()}`)}</td>}
                            <td className={cell}>{m.purpose ?? '—'}</td>
                            <td className={cell}>{m.granted_at ?? '—'}</td>
                            <td className={cell}>
                                {m.kind === 'gone' ? t('rep_ar_sheet_gone') : m.kind === 'cross' ? t('rep_ac_status_cross_short') : ''}
                            </td>
                            <td className={cn(cell, 'text-center')}>
                                <i aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm border-[1.5px] border-slate-500" />
                            </td>
                            <td className={cn(cell, 'text-center')}>
                                <i aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm border-[1.5px] border-slate-500" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-2 text-right text-slate-600">{t('rep_ac_people_n').replace('{n}', count(sheet.list.length, lang))}</p>
            <footer className="mt-9 grid grid-cols-2 gap-10 text-center">
                {[ownable ? t('rep_ar_sheet_sign_owner') : t('rep_ar_sheet_sign_reviewer'), t('rep_ar_sheet_sign_it')].map((who) => (
                    <div key={who}>
                        <div className="mx-auto mb-1 h-7 w-4/5 border-b border-dotted border-slate-900" />
                        {who}
                        <div className="text-xs text-slate-500">{t('rep_ar_sheet_date_line')}</div>
                    </div>
                ))}
            </footer>
        </div>
    );
}

function ReviewSheetDialog({ sheet, open, onOpenChange }: { sheet: Sheet; open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useT();
    const download = useAccessReviewSheet();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 sm:max-w-4xl">
                <FocusDialogHeader
                    icon={FileText}
                    eyebrow={t('rep_ar_sheet_title')}
                    title={sheet.name ?? ''}
                    code={sheet.code ?? undefined}
                    srDescription={t('rep_ar_sheet_title')}
                />
                <div className="bg-muted max-h-[calc(100dvh-14rem)] overflow-y-auto px-6 py-4">
                    <SheetPaper sheet={sheet} />
                </div>
                <DialogFooter className="border-border items-center border-t px-6 py-4 sm:justify-between">
                    <span className="text-muted-foreground text-xs">{t('rep_ar_sheet_footnote')}</span>
                    <span className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            {t('rep_dialog_cancel')}
                        </Button>
                        <Button onClick={() => download.mutate(`${sheet.type}:${sheet.id}`)} disabled={download.isPending}>
                            {download.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            {t('rep_ar_sheet_download')}
                        </Button>
                    </span>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <BarRowsSkeleton rows={4} />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={6} />
            </Card>
        </div>
    );
}

export function AccessMembersCards({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAccessMembersBreakdown(filters);
    const [sheetOpen, setSheetOpen] = useState(false);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;
    const showSpace = !filters.type || filters.type === 'file_share';

    return (
        <div className="space-y-4">
            {showSpace && <StorageCards resources={data.resources} />}
            <ResourceTableCard resources={data.resources} filters={filters} patch={patch} />
            {data.sheet && (
                <>
                    <OwnerStrip sheet={data.sheet} onOpen={() => setSheetOpen(true)} />
                    <ReviewSheetDialog sheet={data.sheet} open={sheetOpen} onOpenChange={setSheetOpen} />
                </>
            )}
        </div>
    );
}

