/**
 * Settings → Tickets & SLA — เป้าหมายปิดเคส สามชุด และหน้าต่างเวลาทำการที่นาฬิกานับด้วย
 *
 * แยกออกมาจาก pages/index.tsx เพราะแท็บนี้ยาวกว่าแท็บอื่นมาก และการเพิ่มลิสต์ที่สาม
 * (เป้าหมายตามลักษณะงาน) จะดันไฟล์รวมไปเกิน 2,200 บรรทัด
 */
import { useT } from '@/lang';
import { TICKET_CATEGORIES, TicketCategoryIcon, TicketPriorityBadge } from '@/modules/ticket';
import { SaveButton } from '@/shared/components/save-button';
import { SearchSelect } from '@/shared/components/search-select';
import { REQUEST_TYPES, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequestType, TicketCategory, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TimeInput } from '@/shared/ui/time-input';
import { AlertCircle, Info, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    type TicketSlaClock,
    type TicketSlaHours,
    type TicketSlaRequestTarget,
    type TicketSlaTargets,
    type TicketSlaWorkClassTarget,
} from '../api/settingsApi';
import { useSettings, useUpdateTicketSla } from '../hooks/use-settings';

const SLA_PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

// The two kinds of repair work a case can be classified as. 'standard' (non-repair) is never
// offered here — the backend rejects it with 422.
const WORK_CLASSES = ['repair_internal', 'repair_vendor'] as const;
const WORK_CLASS_LABEL_KEY: Record<(typeof WORK_CLASSES)[number], string> = {
    repair_internal: 'set_sla_work_repair_internal',
    repair_vendor: 'set_sla_work_repair_vendor',
};

/**
 * "≈ 3 working days" beside a target in hours — or "≈ N days" when the row's clock counts
 * calendar time instead of the working window.
 *
 * Nobody thinks in raw hours; they think in days. Which conversion applies depends on the
 * row's own clock: a business-clock target divides by the working window set further down
 * this same page (days off, out-of-hours and the break are skipped), while a calendar-clock
 * target is a flat ÷24 — 720 hours is 30 days, not 90 "working" ones. Below one day of either
 * kind there is nothing to add.
 */
function workingDaysHint(resolveHours: number, hours: TicketSlaHours, clock: TicketSlaClock, t: (key: string) => string): string {
    if (!Number.isFinite(resolveHours) || resolveHours < 1) return '';

    if (clock === 'calendar') {
        const days = resolveHours / 24;
        if (days < 1) return '';
        return t('set_sla_approx_calendar_days').replace('{n}', String(Math.round(days)));
    }

    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const breakLength = hours.break_start && hours.break_end ? minutes(hours.break_end) - minutes(hours.break_start) : 0;
    const perDay = minutes(hours.end) - minutes(hours.start) - breakLength;
    if (perDay <= 0) return '';

    // Only once the target is a full working day or more. Rounding 5 hours up to "≈ 1 day"
    // both overstates it and makes 5 and 9 hours read as the same thing.
    const target = resolveHours * 60;
    if (target < perDay) return '';

    return t('set_sla_approx_days').replace('{n}', String(Math.round(target / perDay)));
}

// ISO weekdays for the SLA working-window picker (1 = Monday … 7 = Sunday).
const SLA_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Both exception tables list every option, always, and a switch decides whether the row
 * applies — so a row has to exist on screen for an option nobody has configured yet.
 *
 * The filled-in number is the target the case would have had anyway, which keeps the row
 * honest before anybody edits it: switching it on changes which rule decides the deadline,
 * not the deadline itself, until somebody types a different figure.
 *
 * Expanding on the way in also keeps the dirty check working. The rows come back from the
 * API ordered by their stored key, which is not the order these tables render in, so the
 * comparison has to run against a list built exactly the way the editable one was.
 */
function expandRequestRows(stored: TicketSlaRequestTarget[], fallback: { resolve: number; clock: TicketSlaClock }): TicketSlaRequestTarget[] {
    const byType = new Map(stored.map((r) => [r.type, r]));

    return REQUEST_TYPES.map((type) => byType.get(type) ?? { type, resolve: fallback.resolve, clock: fallback.clock, enabled: false });
}

/** Settings → Tickets: edit the per-priority SLA targets + the working window they count against. */
export function TicketsSlaTab() {
    const t = useT();
    const { data } = useSettings();
    const update = useUpdateTicketSla();
    // Shared by every clock select on this tab — priority rows, request-type rows and
    // work-class rows all pick from the same two options.
    const clockOptions = [
        { value: 'business', label: t('set_sla_clock_business') },
        { value: 'calendar', label: t('set_sla_clock_calendar') },
    ];
    const stored = data?.ticket_sla;
    const storedRequest = data?.ticket_sla_request;
    const storedWork = data?.ticket_sla_work_class;
    const storedResponse = data?.ticket_sla_response;
    const storedHours = data?.ticket_sla_hours;
    // What an unconfigured request type shows: the medium target, which is what a case with no
    // priority is judged against anyway. Read off the saved values rather than the editable
    // draft, so typing in the priority table never re-seeds the rows below it.
    // Memoized so the seeding effect below can depend on it by reference instead of reaching
    // for an eslint escape hatch.
    const reqFallback = useMemo(
        () => ({ resolve: stored?.medium?.resolve ?? 24, clock: stored?.medium?.clock ?? ('business' as TicketSlaClock) }),
        [stored?.medium?.resolve, stored?.medium?.clock],
    );
    const [draft, setDraft] = useState<TicketSlaTargets>({});
    // Targets keyed on what was requested. Every request type has a row and the switch decides
    // whether it applies, so the table reads as the full set of choices rather than a list the
    // administrator has to remember to add to.
    const [reqTargets, setReqTargets] = useState<TicketSlaRequestTarget[]>([]);
    const [reqErrors, setReqErrors] = useState<Record<string, string>>({});
    // Repair targets, one row per (ticket type, who does the work) pair. A list the
    // administrator adds to rather than a fixed table: most pairs never happen — software does
    // not go to a technician — and a case can only be classified into a pair that has a row, so
    // the list is also the set of options a technician will be offered.
    const [workTargets, setWorkTargets] = useState<TicketSlaWorkClassTarget[]>([]);
    const [workErrors, setWorkErrors] = useState<Record<string, string>>({});
    // First response is one system-wide target — priority doesn't exist while a case waits.
    const [respTarget, setRespTarget] = useState(120);
    const [respError, setRespError] = useState('');
    const [hours, setHours] = useState<TicketSlaHours>({
        days: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '17:00',
        break_start: '12:00',
        break_end: '13:00',
    });
    const [saved, setSaved] = useState(false);
    const [errors, setErrors] = useState<Record<string, { response?: string; resolve?: string }>>({});
    const [hoursError, setHoursError] = useState('');

    useEffect(() => {
        if (stored) setDraft(stored);
    }, [stored]);
    useEffect(() => {
        if (storedRequest) setReqTargets(expandRequestRows(storedRequest, reqFallback));
    }, [storedRequest, reqFallback]);
    useEffect(() => {
        if (storedWork) setWorkTargets(storedWork);
    }, [storedWork]);
    useEffect(() => {
        if (storedResponse != null) setRespTarget(storedResponse);
    }, [storedResponse]);
    useEffect(() => {
        if (storedHours) setHours(storedHours);
    }, [storedHours]);

    const hoursDirty =
        !!storedHours &&
        (hours.start !== storedHours.start ||
            hours.end !== storedHours.end ||
            hours.break_start !== storedHours.break_start ||
            hours.break_end !== storedHours.break_end ||
            hours.days.join() !== storedHours.days.join());
    // Compared as a whole: a row added, removed, switched, retimed or reclocked all count the same.
    const reqSignature = (rows: TicketSlaRequestTarget[]) => rows.map((r) => `${r.type}:${r.resolve}:${r.clock}:${r.enabled ? 1 : 0}`).join('|');
    // Compared against the SAME expansion the editable rows were built from, not against the
    // raw payload: the API returns only the rows that exist, in its own key order, so comparing
    // straight to it would report every untouched form as dirty.
    const reqDirty = !!storedRequest && reqSignature(reqTargets) !== reqSignature(expandRequestRows(storedRequest, reqFallback));
    const workSignature = (rows: TicketSlaWorkClassTarget[]) =>
        rows.map((r) => `${r.category}:${r.work_class}:${r.resolve}:${r.clock}:${r.enabled ? 1 : 0}`).join('|');
    const workDirty = !!storedWork && workSignature(workTargets) !== workSignature(storedWork);
    const dirty =
        hoursDirty ||
        reqDirty ||
        workDirty ||
        (storedResponse != null && respTarget !== storedResponse) ||
        (!!stored && SLA_PRIORITIES.some((p) => draft[p] && (draft[p].resolve !== stored[p]?.resolve || draft[p].clock !== stored[p]?.clock)));

    const setRequestTarget = (type: string, patch: Partial<TicketSlaRequestTarget>) => {
        setReqTargets((rows) => rows.map((r) => (r.type === type ? { ...r, ...patch } : r)));
        setSaved(false);
        setReqErrors((e) => ({ ...e, [type]: '' }));
    };
    /** A pair identifies a row; nothing else in the list is unique on its own. */
    const workKey = (row: Pick<TicketSlaWorkClassTarget, 'category' | 'work_class'>) => `${row.category}:${row.work_class}`;
    const setWorkTarget = (key: string, patch: Partial<TicketSlaWorkClassTarget>) => {
        setWorkTargets((rows) => rows.map((r) => (workKey(r) === key ? { ...r, ...patch } : r)));
        setSaved(false);
        setWorkErrors((e) => ({ ...e, [key]: '' }));
    };
    const addWorkTarget = () => {
        // Starts on the first pair that has no row yet, at the KPI the organisation runs —
        // 30 calendar days — so the row is a real target before anybody edits it.
        const taken = new Set(workTargets.map(workKey));
        const next = TICKET_CATEGORIES.flatMap((c) => WORK_CLASSES.map((w) => ({ category: c, work_class: w }))).find(
            (pair) => !taken.has(workKey(pair)),
        );
        if (!next) return;
        setWorkTargets((rows) => [...rows, { ...next, resolve: 720, clock: 'calendar', enabled: true }]);
        setSaved(false);
    };
    const removeWorkTarget = (key: string) => {
        setWorkTargets((rows) => rows.filter((r) => workKey(r) !== key));
        setSaved(false);
    };

    /** Toggle one working day, keeping the list in Mon→Sun order. */
    const toggleDay = (d: number) => {
        setHours((h) => ({ ...h, days: h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d].sort((a, b) => a - b) }));
        setSaved(false);
        setHoursError('');
    };
    const setHoursField = (key: 'start' | 'end', value: string) => {
        setHours((h) => ({ ...h, [key]: value }));
        setSaved(false);
        setHoursError('');
    };
    /** Break inputs are clearable — an empty value means "no break". */
    const setBreakField = (key: 'break_start' | 'break_end', value: string) => {
        setHours((h) => ({ ...h, [key]: value || null }));
        setSaved(false);
        setHoursError('');
    };

    const setField = (p: TicketPriority, value: number) => {
        setDraft((d) => ({ ...d, [p]: { resolve: value, clock: d[p]?.clock ?? 'business' } }));
        setSaved(false);
        if (errors[p]?.resolve) setErrors((e) => ({ ...e, [p]: { ...e[p], resolve: undefined } }));
    };
    const setPriorityClock = (p: TicketPriority, clock: TicketSlaClock) => {
        setDraft((d) => ({ ...d, [p]: { resolve: d[p]?.resolve ?? 0, clock } }));
        setSaved(false);
    };
    const setResponse = (value: number) => {
        setRespTarget(value);
        setSaved(false);
        setRespError('');
    };

    // First response is in minutes (1–10080, one system-wide value), resolution in
    // hours (1–8760) and must be at least the first-response target (in minutes).
    const handleSave = () => {
        let respErr = '';
        if (!Number.isInteger(respTarget) || respTarget < 1 || respTarget > 10080) {
            respErr = t('set_sla_err_response');
        }

        const next: Record<string, { response?: string; resolve?: string }> = {};
        for (const p of SLA_PRIORITIES) {
            const resolve = draft[p]?.resolve ?? 0;
            const rowErr: { resolve?: string } = {};

            if (!Number.isInteger(resolve) || resolve < 1 || resolve > 8760) {
                rowErr.resolve = t('set_sla_err_resolve');
            } else if (!respErr && resolve * 60 < respTarget) {
                rowErr.resolve = t('set_sla_err_order');
            }
            if (rowErr.resolve) next[p] = rowErr;
        }

        // Working window: at least one day, start strictly before end, and a break
        // (when set) needs both ends, in order, inside the window.
        let windowErr = '';
        if (hours.days.length === 0) windowErr = t('set_sla_err_days');
        else if (hours.start >= hours.end) windowErr = t('set_sla_err_window');
        else if (!!hours.break_start !== !!hours.break_end) windowErr = t('set_sla_err_break_pair');
        else if (
            hours.break_start &&
            hours.break_end &&
            (hours.break_start >= hours.break_end || hours.break_start < hours.start || hours.break_end > hours.end)
        ) {
            windowErr = t('set_sla_err_break_range');
        }

        // Request-type targets follow the same two rules as the priority rows.
        const reqNext: Record<string, string> = {};
        for (const row of reqTargets) {
            if (!Number.isInteger(row.resolve) || row.resolve < 1 || row.resolve > 8760) {
                reqNext[row.type] = t('set_sla_err_resolve');
            } else if (!respErr && row.resolve * 60 < respTarget) {
                reqNext[row.type] = t('set_sla_err_order');
            }
        }

        // Repair-work targets follow the same two rules, keyed on work class instead of type.
        const workNext: Record<string, string> = {};
        for (const row of workTargets) {
            if (!Number.isInteger(row.resolve) || row.resolve < 1 || row.resolve > 8760) {
                workNext[row.work_class] = t('set_sla_err_resolve');
            } else if (!respErr && row.resolve * 60 < respTarget) {
                workNext[row.work_class] = t('set_sla_err_order');
            }
        }

        setRespError(respErr);
        setErrors(next);
        setReqErrors(reqNext);
        setWorkErrors(workNext);
        setHoursError(windowErr);
        if (respErr || Object.keys(next).length > 0 || Object.keys(reqNext).length > 0 || Object.keys(workNext).length > 0 || windowErr) return;
        update.mutate(
            {
                ticket_sla: draft,
                ticket_sla_request: reqTargets,
                ticket_sla_work_class: workTargets,
                ticket_sla_response: respTarget,
                ticket_sla_hours: hours,
            },
            { onSuccess: () => setSaved(true) },
        );
    };

    return (
        <div className="max-w-5xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_sla_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_sla_desc')}</p>
            </div>

            {/* One system-wide first-response target — a case has no priority while it waits. */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold">{t('set_sla_response')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-2.5 text-xs">{t('set_sla_response_help')}</p>
                <div className="flex items-center gap-2">
                    <span className="text-sm">{t('set_sla_response_within')}</span>
                    <Input
                        type="number"
                        min={1}
                        value={Number.isFinite(respTarget) ? respTarget : ''}
                        onChange={(e) => setResponse(e.target.valueAsNumber)}
                        aria-invalid={!!respError}
                        className={cn(
                            'h-9 w-24 font-mono',
                            respError && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                        )}
                    />
                    <span className="text-sm">{t('set_sla_minutes')}</span>
                </div>
                {respError && (
                    <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {respError}
                    </p>
                )}
                <div className="mt-2.5 flex items-center gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>{t('set_sla_response_note')}</span>
                </div>
            </div>

            {/* Resolution targets — its own section so the two goals read separately. */}
            <div className="border-border mt-6 border-t pt-5">
                <h3 className="text-sm font-semibold">{t('set_sla_resolution_title')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-2.5 text-xs">{t('set_sla_resolution_help')}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                            <th className="px-3 py-2">{t('ticket_priority')}</th>
                            <th className="px-3 py-2">{t('set_sla_resolution')}</th>
                            <th className="px-3 py-2">{t('set_sla_clock')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SLA_PRIORITIES.map((p) => (
                            <tr key={p} className="border-border/60 border-b last:border-0">
                                <td className="px-3 py-3">
                                    <TicketPriorityBadge priority={p} t={t} />
                                </td>
                                <td className="px-3 py-3 align-top">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={Number.isFinite(draft[p]?.resolve) ? draft[p]?.resolve : ''}
                                            onChange={(e) => setField(p, e.target.valueAsNumber)}
                                            aria-invalid={!!errors[p]?.resolve}
                                            className={cn(
                                                'h-9 w-24 font-mono',
                                                errors[p]?.resolve &&
                                                    'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                            )}
                                        />
                                        <span className="text-muted-foreground text-xs">{t('set_sla_hours')}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {workingDaysHint(draft[p]?.resolve, hours, draft[p]?.clock ?? 'business', t)}
                                        </span>
                                    </div>
                                    {errors[p]?.resolve && (
                                        <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {errors[p]?.resolve}
                                        </p>
                                    )}
                                </td>
                                <td className="px-3 py-3 align-top">
                                    <span className="inline-block w-40">
                                        <SearchSelect
                                            value={draft[p]?.clock ?? 'business'}
                                            onChange={(v) => setPriorityClock(p, v as TicketSlaClock)}
                                            options={clockOptions}
                                        />
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400">
                <Info className="h-4 w-4 shrink-0" />
                <span>{t('set_sla_resolution_note')}</span>
            </div>

            {/* Repair work is judged on its own KPI, and this table wins over the priority one
                once a case is classified — which only a case somebody reported can be. That is
                why this one keeps the left rule and the request table does not: this really is a
                continuation of the priority path above it, an exception carved out of the same
                population, while the request table governs a separate one.

                Fixed rows for the same reason as the table above: there are only two kinds of
                repair, and both should be visible whether or not anybody has set a figure yet. */}
            <div className="border-border/70 mt-5 ml-1 border-l-2 pl-4">
                <h3 className="text-sm font-semibold">{t('set_sla_work_title')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{t('set_sla_work_desc')}</p>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                <th className="px-3 py-2">{t('set_sla_col_ticket_type')}</th>
                                <th className="px-3 py-2">{t('set_sla_col_work_class')}</th>
                                <th className="px-3 py-2">{t('set_sla_resolution')}</th>
                                <th className="px-3 py-2">{t('set_sla_clock')}</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {workTargets.map((row) => {
                                const key = workKey(row);
                                const taken = new Set(workTargets.filter((r) => workKey(r) !== key).map(workKey));
                                return (
                                    <tr key={key} className="border-border/60 border-b last:border-0">
                                        <td className="px-3 py-3 align-top">
                                            <span className="inline-block w-32">
                                                <SearchSelect
                                                    value={row.category}
                                                    onChange={(v) => setWorkTarget(key, { category: v as TicketCategory })}
                                                    // Every ticket type is listed on every row, and one whose
                                                    // pair another row already claims is greyed with the reason.
                                                    // Dropping it instead gave three rows of the same column
                                                    // three different lists and a search box that answered "no
                                                    // results" for a type sitting in plain sight one row down.
                                                    options={TICKET_CATEGORIES.map((c) => ({
                                                        value: c,
                                                        label: t(`ticket_cat_${c}`),
                                                        icon: <TicketCategoryIcon category={c} className="text-muted-foreground h-4 w-4" />,
                                                        disabled: c !== row.category && taken.has(`${c}:${row.work_class}`),
                                                        note: c !== row.category && taken.has(`${c}:${row.work_class}`) ? t('set_sla_pair_taken') : undefined,
                                                    }))}
                                                />
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <span className="inline-block w-52">
                                                <SearchSelect
                                                    value={row.work_class}
                                                    onChange={(v) => setWorkTarget(key, { work_class: v as TicketSlaWorkClassTarget['work_class'] })}
                                                    options={WORK_CLASSES.map((w) => ({
                                                        value: w,
                                                        label: t(WORK_CLASS_LABEL_KEY[w]),
                                                        disabled: w !== row.work_class && taken.has(`${row.category}:${w}`),
                                                        note: w !== row.work_class && taken.has(`${row.category}:${w}`) ? t('set_sla_pair_taken') : undefined,
                                                    }))}
                                                />
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={8760}
                                                    value={Number.isFinite(row.resolve) ? row.resolve : ''}
                                                    onChange={(e) => setWorkTarget(key, { resolve: e.target.valueAsNumber })}
                                                    aria-invalid={!!workErrors[key]}
                                                    className={cn(
                                                        'h-9 w-24 font-mono',
                                                        workErrors[key] &&
                                                            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                                    )}
                                                />
                                                <span className="text-muted-foreground text-xs">{t('set_sla_hours')}</span>
                                                <span className="text-muted-foreground text-xs">
                                                    {workingDaysHint(row.resolve, hours, row.clock, t)}
                                                </span>
                                            </div>
                                            {workErrors[key] && (
                                                <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                    {workErrors[key]}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <span className="inline-block w-40">
                                                <SearchSelect
                                                    value={row.clock}
                                                    onChange={(v) => setWorkTarget(key, { clock: v as TicketSlaClock })}
                                                    options={clockOptions}
                                                />
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <button
                                                type="button"
                                                onClick={() => removeWorkTarget(key)}
                                                aria-label={t('delete')}
                                                title={t('delete')}
                                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-8 w-8 place-items-center rounded-md"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {workTargets.length === 0 && <p className="text-muted-foreground mt-1 mb-3 text-xs">{t('set_sla_work_empty')}</p>}

                {/* An action is a button. The pair is chosen in the row it belongs to. */}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={addWorkTarget}
                    disabled={workTargets.length >= TICKET_CATEGORIES.length * WORK_CLASSES.length}
                >
                    <Plus className="h-4 w-4" />
                    {t('set_sla_work_add')}
                </Button>
            </div>

            {/* Cases opened from an approved request, where the length of the work was decided
                by what was asked for rather than by how urgent anybody judged it.

                Last, and a sibling section rather than an indented one: this is not an exception
                to anything above it, it is the other half of the system. The priority table and
                the repair exception carved out of it both govern cases somebody reported; this
                one governs cases a request opened. The two sets cannot overlap — a reported case
                has no request, and a request-born case is never given a priority — so neither is
                a special case of the other, and nothing here continues from what precedes it.

                Every request type gets a row whether or not it has been configured, and none of
                them can be switched off: a request-born case has no priority to fall back to, so
                a disabled rule would drop it onto the built-in default with nothing saying so. */}
            <div className="mt-6">
                <h3 className="text-sm font-semibold">{t('set_sla_request_title')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{t('set_sla_request_desc')}</p>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                <th className="px-3 py-2">{t('set_sla_col_request_type')}</th>
                                <th className="px-3 py-2">{t('set_sla_resolution')}</th>
                                <th className="px-3 py-2">{t('set_sla_clock')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reqTargets.map((row) => {
                                const meta = REQUEST_TYPE_META[row.type as ServiceRequestType];
                                return (
                                    <tr key={row.type} className="border-border/60 border-b last:border-0">
                                        <td className="px-3 py-3">
                                            <span className="flex items-center gap-2">
                                                {meta && <meta.icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />}
                                                <span>{t(meta?.labelKey ?? row.type)}</span>
                                            </span>
                                        </td>
                                        {/* Always applies: a request-born case has no priority to fall back to. */}
                                        <td className="px-3 py-3 align-top">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={8760}
                                                    value={Number.isFinite(row.resolve) ? row.resolve : ''}
                                                    onChange={(e) => setRequestTarget(row.type, { resolve: e.target.valueAsNumber })}
                                                    aria-invalid={!!reqErrors[row.type]}
                                                    className={cn(
                                                        'h-9 w-24 font-mono',
                                                        reqErrors[row.type] &&
                                                            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                                    )}
                                                />
                                                <span className="text-muted-foreground text-xs">{t('set_sla_hours')}</span>
                                                <span className="text-muted-foreground text-xs">
                                                    {workingDaysHint(row.resolve, hours, row.clock, t)}
                                                </span>
                                            </div>
                                            {reqErrors[row.type] && (
                                                <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                    {reqErrors[row.type]}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <span className="inline-block w-40">
                                                <SearchSelect
                                                    value={row.clock}
                                                    onChange={(v) => setRequestTarget(row.type, { clock: v as TicketSlaClock })}
                                                    options={clockOptions}
                                                />
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Working window the SLA clocks count against — outside it the clock pauses. */}
            <div className="border-border mt-6 border-t pt-5">
                <h3 className="text-sm font-semibold">{t('set_sla_hours_title')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-3.5 text-xs">{t('set_sla_hours_desc')}</p>

                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div>
                        <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('set_sla_days')}</div>
                        <div className="flex gap-1.5">
                            {SLA_DAYS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggleDay(d)}
                                    aria-pressed={hours.days.includes(d)}
                                    className={cn(
                                        'focus-visible:border-brand focus-visible:ring-brand/15 h-9 w-9 rounded-md border text-xs font-semibold transition-colors focus:outline-hidden focus-visible:ring-[3px]',
                                        hours.days.includes(d)
                                            ? 'border-brand bg-brand/10 text-brand'
                                            : 'border-border text-muted-foreground hover:border-brand/50',
                                    )}
                                >
                                    {t(`set_sla_day_${d}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('set_sla_start')}</div>
                            <TimeInput value={hours.start} onChange={(v) => setHoursField('start', v)} className="h-9 w-28" />
                        </div>
                        <span className="text-muted-foreground pb-2.5 text-xs">–</span>
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('set_sla_end')}</div>
                            <TimeInput value={hours.end} onChange={(v) => setHoursField('end', v)} className="h-9 w-28" />
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('set_sla_break')}</div>
                            <TimeInput
                                value={hours.break_start ?? ''}
                                onChange={(v) => setBreakField('break_start', v)}
                                clearable
                                className="h-9 w-32"
                            />
                        </div>
                        <span className="text-muted-foreground pb-2.5 text-xs">–</span>
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">&nbsp;</div>
                            <TimeInput value={hours.break_end ?? ''} onChange={(v) => setBreakField('break_end', v)} clearable className="h-9 w-32" />
                        </div>
                    </div>
                </div>
                {hoursError && (
                    <p className="text-destructive mt-2 flex items-center gap-1.5 text-xs">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {hoursError}
                    </p>
                )}
                <div className="mt-3 flex items-center gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>{t('set_sla_hours_note')}</span>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-5">
                <SaveButton onClick={handleSave} loading={update.isPending} success={saved} disabled={!dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}
