// Settings → Ticket & SLA: working hours, pick-up and close targets (by priority, repair, request type) and the SLA goal.
// A summary card jumps to each section; one Save button at the end saves the tab (holidays save in their own dialog).
import { useT } from '@/lang';
import { TICKET_CATEGORIES, TicketCategoryIcon, TicketPriorityBadge } from '@/modules/ticket';
import { EmptyState } from '@/shared/components/empty-state';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { REQUEST_TYPE_META, REQUEST_TYPES } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequestType, TicketCategory, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { TimeInput } from '@/shared/ui/time-input';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    type SettingsData,
    type TicketSlaClock,
    type TicketSlaHours,
    type TicketSlaRequestTarget,
    type TicketSlaTargets,
    type TicketSlaWorkClassTarget,
} from '../api/settingsApi';
import { useSettings, useSlaHolidays, useUpdateTicketSla } from '../hooks/use-settings';
import { localIsoDate } from '../lib/sla-holidays';
import { FIELD_ROW, FORM_WIDTH } from './form-layout';
import { SlaHolidaysSection, useHolidayYearParam } from './sla-holidays-section';
import {
    ClockToggle,
    DayPicker,
    ErrorSummary,
    FieldError,
    HEAD_ROW,
    MINI_LABEL,
    NumberField,
    ROW,
    SECTION,
    SectionHead,
    SLA_LABEL,
    SlaSummary,
    TABLE,
    WorkdayBar,
    type SlaError,
} from './sla-parts';

const SLA_PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

// The two kinds of repair; 'standard' is never offered here (the backend refuses it).
const WORK_CLASSES = ['repair_internal', 'repair_vendor'] as const;
const WORK_CLASS_LABEL_KEY: Record<(typeof WORK_CLASSES)[number], string> = {
    repair_internal: 'set_sla_work_repair_internal',
    repair_vendor: 'set_sla_work_repair_vendor',
};
const REPAIR_PAIRS = TICKET_CATEGORIES.length * WORK_CLASSES.length;

const PRI_COLS = 'grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[7.5rem_minmax(0,1fr)_15rem]';
const REP_COLS = 'grid-cols-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_15rem_2.5rem]';
const REQ_COLS = 'grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_15rem]';

type WorkRow = TicketSlaWorkClassTarget & { uid: number };
type SlaForm = {
    draft: TicketSlaTargets;
    reqTargets: TicketSlaRequestTarget[];
    workTargets: WorkRow[];
    respTarget: number;
    goal: number;
    hours: TicketSlaHours;
};
const EMPTY_SLA: SlaForm = {
    draft: {},
    reqTargets: [],
    workTargets: [],
    respTarget: 120,
    goal: 90,
    hours: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', break_start: '12:00', break_end: '13:00' },
};

const minutesOf = (time: string | null) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null);
const fill = (text: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);
const validHours = (h: number) => Number.isInteger(h) && h >= 1 && h <= 8760;

/** Minutes the business clock counts in one working day (window less the break). */
function workMinutesPerDay(hours: TicketSlaHours): number {
    const breakLength = hours.break_start && hours.break_end ? minutesOf(hours.break_end)! - minutesOf(hours.break_start)! : 0;
    return minutesOf(hours.end)! - minutesOf(hours.start)! - breakLength;
}

/** "≈ 3 working days" for a business-clock target, "≈ 30 days" for a round-the-clock one. */
function daysHint(resolveHours: number, hours: TicketSlaHours, clock: TicketSlaClock, t: (key: string) => string): string {
    if (!validHours(resolveHours)) return '';
    if (clock === 'calendar') {
        const days = resolveHours / 24;
        return days >= 1 ? fill(t('set_sla_approx_calendar_days'), { n: oneDecimal(days) }) : '';
    }
    const perDay = workMinutesPerDay(hours);
    if (perDay <= 0) return '';
    const days = (resolveHours * 60) / perDay;
    return days >= 1 ? fill(t('set_sla_approx_days'), { n: oneDecimal(days) }) : t('set_sla_under_day');
}

/** Every request type gets a row; an unconfigured one shows the medium target it would get anyway. */
function expandRequestRows(stored: TicketSlaRequestTarget[], fallback: { resolve: number; clock: TicketSlaClock }): TicketSlaRequestTarget[] {
    const byType = new Map(stored.map((r) => [r.type, r]));
    return REQUEST_TYPES.map((type) => byType.get(type) ?? { type, resolve: fallback.resolve, clock: fallback.clock, enabled: false });
}

/** The form's values from the stored settings; work rows take ids by position so a refresh compares equal. */
function slaFrom(data: SettingsData): SlaForm {
    const stored = data.ticket_sla;
    const fallback = { resolve: stored?.medium?.resolve ?? 24, clock: stored?.medium?.clock ?? ('business' as TicketSlaClock) };
    return {
        draft: stored ?? {},
        reqTargets: data.ticket_sla_request ? expandRequestRows(data.ticket_sla_request, fallback) : [],
        workTargets: (data.ticket_sla_work_class ?? []).map((row, i) => ({ ...row, uid: i + 1 })),
        respTarget: data.ticket_sla_response ?? EMPTY_SLA.respTarget,
        goal: data.ticket_sla_goal ?? EMPTY_SLA.goal,
        hours: data.ticket_sla_hours ?? EMPTY_SLA.hours,
    };
}

const requestKey = (r: TicketSlaRequestTarget) => `${r.type}:${r.resolve}:${r.clock}:${r.enabled ? 1 : 0}`;
const workKey = (r: Pick<TicketSlaWorkClassTarget, 'category' | 'work_class'>) => `${r.category}:${r.work_class}`;
const workSignature = (r: TicketSlaWorkClassTarget) => `${workKey(r)}:${r.resolve}:${r.clock}:${r.enabled ? 1 : 0}`;
const stripUid = (rows: WorkRow[]): TicketSlaWorkClassTarget[] =>
    rows.map(({ category, work_class, resolve, clock, enabled }) => ({ category, work_class, resolve, clock, enabled }));

export function TicketsSlaTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const { data } = useSettings();
    const update = useUpdateTicketSla();
    const { data: holidays } = useSlaHolidays();
    const pickHolidayYear = useHolidayYearParam();
    // Stored work rows take ids by position; rows added here count up from far above them
    const nextUid = useRef(10_000);

    // Every piece in one state, so a refresh of the stored settings rebases them together
    const [sla, setSla] = useState<SlaForm>(EMPTY_SLA);
    const { draft, reqTargets, workTargets, respTarget, goal, hours } = sla;
    const piece =
        <K extends keyof SlaForm>(key: K) =>
        (next: SlaForm[K] | ((prev: SlaForm[K]) => SlaForm[K])) =>
            setSla((f) => ({ ...f, [key]: typeof next === 'function' ? (next as (prev: SlaForm[K]) => SlaForm[K])(f[key]) : next }));
    const setDraft = piece('draft');
    const setReqTargets = piece('reqTargets');
    const setWorkTargets = piece('workTargets');
    const setRespTarget = piece('respTarget');
    const setGoal = piece('goal');
    const setHours = piece('hours');
    // What the form opened with, moved along by refreshes of the stored settings
    const [base, setBase] = useState<SlaForm>(EMPTY_SLA);
    const fresh: SlaForm | null = data ? slaFrom(data) : null;
    useSeedOnce(fresh ? 'sla' : null, () => {
        if (!fresh) return;
        setSla(fresh);
        setBase(fresh);
    });
    useFormRebase({ fresh, base, setBase, setForm: setSla });
    const [saved, setSaved] = useState(false);
    // Errors show once Save is refused, then follow every edit until a save goes through.
    const [submitted, setSubmitted] = useState(false);
    const [attempt, setAttempt] = useState(0);

    // Unsaved edits, counted per thing a person changed (the hours block, a field, a row).
    const changeCount = useMemo(() => {
        if (!data) return 0;
        let n = 0;
        if (JSON.stringify(hours) !== JSON.stringify(base.hours)) n++;
        if (respTarget !== base.respTarget) n++;
        if (goal !== base.goal) n++;
        n += SLA_PRIORITIES.filter(
            (p) => draft[p] && (draft[p].resolve !== base.draft[p]?.resolve || draft[p].clock !== base.draft[p]?.clock),
        ).length;
        n += reqTargets.filter((row, i) => !base.reqTargets[i] || requestKey(row) !== requestKey(base.reqTargets[i])).length;
        const before = base.workTargets.map(workSignature);
        const after = workTargets.map(workSignature);
        n += after.filter((sig, i) => sig !== before[i]).length + Math.max(0, before.length - after.length);
        return n;
    }, [data, hours, respTarget, goal, draft, reqTargets, workTargets, base]);

    useEffect(() => {
        onDirtyChange(changeCount > 0);
        return () => onDirtyChange(false);
    }, [changeCount, onDirtyChange]);

    const touch = () => setSaved(false);
    const setRequestTarget = (type: string, patch: Partial<TicketSlaRequestTarget>) => {
        setReqTargets((rows) => rows.map((r) => (r.type === type ? { ...r, ...patch } : r)));
        touch();
    };
    const setWorkTarget = (uid: number, patch: Partial<TicketSlaWorkClassTarget>) => {
        setWorkTargets((rows) => rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
        touch();
    };
    const addWorkTarget = () => {
        // The first pair without a row, at the organisation's repair KPI: 30 days round the clock.
        const taken = new Set(workTargets.map(workKey));
        const next = TICKET_CATEGORIES.flatMap((c) => WORK_CLASSES.map((w) => ({ category: c, work_class: w }))).find(
            (pair) => !taken.has(workKey(pair)),
        );
        if (!next) return;
        setWorkTargets((rows) => [...rows, { ...next, resolve: 720, clock: 'calendar', enabled: true, uid: nextUid.current++ }]);
        touch();
    };
    const removeWorkTarget = (uid: number) => {
        setWorkTargets((rows) => rows.filter((r) => r.uid !== uid));
        touch();
    };
    const toggleDay = (day: number) => {
        setHours((h) => ({ ...h, days: h.days.includes(day) ? h.days.filter((x) => x !== day) : [...h.days, day].sort((a, b) => a - b) }));
        touch();
    };
    const setHoursField = (key: 'start' | 'end', value: string) => {
        setHours((h) => ({ ...h, [key]: value }));
        touch();
    };
    // An empty break time means no break.
    const setBreakField = (key: 'break_start' | 'break_end', value: string) => {
        setHours((h) => ({ ...h, [key]: value || null }));
        touch();
    };
    const setPriority = (p: TicketPriority, patch: Partial<{ resolve: number; clock: TicketSlaClock }>) => {
        setDraft((d) => ({ ...d, [p]: { resolve: d[p]?.resolve ?? 0, clock: d[p]?.clock ?? 'business', ...patch } }));
        touch();
    };

    const categoryLabel = (c: TicketCategory) => t(`ticket_cat_${c}`);
    const workLabel = (w: TicketSlaWorkClassTarget['work_class']) => t(WORK_CLASS_LABEL_KEY[w as (typeof WORK_CLASSES)[number]]);

    // Same rules as the server: response 1–10080 min, every resolve 1–8760 h and not under the response.
    const errors = useMemo<SlaError[]>(() => {
        const list: SlaError[] = [];
        if (hours.days.length === 0) list.push({ id: 'sla-days', where: t('set_sla_days'), message: t('set_sla_err_days') });
        if (hours.start >= hours.end) list.push({ id: 'sla-end', where: t('set_sla_work_time'), message: t('set_sla_err_window') });
        if (!!hours.break_start !== !!hours.break_end) {
            list.push({ id: 'sla-break-start', where: t('set_sla_break'), message: t('set_sla_err_break_pair') });
        } else if (
            hours.break_start &&
            hours.break_end &&
            (hours.break_start >= hours.break_end || hours.break_start < hours.start || hours.break_end > hours.end)
        ) {
            list.push({ id: 'sla-break-start', where: t('set_sla_break'), message: t('set_sla_err_break_range') });
        }
        const respOk = Number.isInteger(respTarget) && respTarget >= 1 && respTarget <= 10080;
        if (!respOk) list.push({ id: 'sla-resp', where: t('set_sla_response_within'), message: t('set_sla_err_response') });
        const resolveError = (h: number) =>
            !validHours(h) ? t('set_sla_err_resolve') : respOk && h * 60 < respTarget ? fill(t('set_sla_err_order'), { n: respTarget }) : '';
        for (const p of SLA_PRIORITIES) {
            const message = resolveError(draft[p]?.resolve ?? 0);
            if (message) list.push({ id: `sla-pri-${p}`, where: `${t('set_sla_resolve_within')} ${t(`ticket_prio_${p}`)}`, message });
        }
        for (const row of workTargets) {
            const message = resolveError(row.resolve);
            if (message)
                list.push({
                    id: `sla-rep-${row.uid}`,
                    where: `${t('set_sla_work_title')} ${t(`ticket_cat_${row.category}`)} ${t(WORK_CLASS_LABEL_KEY[row.work_class as (typeof WORK_CLASSES)[number]])}`,
                    message,
                });
        }
        for (const row of reqTargets) {
            const message = resolveError(row.resolve);
            const meta = REQUEST_TYPE_META[row.type as ServiceRequestType];
            if (message) list.push({ id: `sla-req-${row.type}`, where: `${t('set_sla_request_title')} ${t(meta?.labelKey ?? row.type)}`, message });
        }
        if (!(Number.isInteger(goal) && goal >= 1 && goal <= 100))
            list.push({ id: 'sla-goal', where: t('set_sla_goal'), message: t('set_sla_err_goal') });
        return list;
    }, [hours, respTarget, draft, workTargets, reqTargets, goal, t]);

    const shown = submitted ? errors : [];
    const errorOf = (id: string) => shown.find((e) => e.id === id)?.message ?? '';
    const countErrors = (test: (id: string) => boolean) => shown.filter((e) => test(e.id)).length;

    const handleSave = () => {
        if (errors.length > 0) {
            setSubmitted(true);
            setAttempt((n) => n + 1);
            return;
        }
        update.mutate(
            {
                ticket_sla: draft,
                ticket_sla_request: reqTargets,
                ticket_sla_work_class: stripUid(workTargets),
                ticket_sla_response: respTarget,
                ticket_sla_goal: goal,
                ticket_sla_hours: hours,
            },
            {
                onSuccess: (response) => {
                    // The server orders work rows and fills request rows, so the form restarts from what it stored
                    setSla(slaFrom(response));
                    setBase(slaFrom(response));
                    setSaved(true);
                    setSubmitted(false);
                },
            },
        );
    };

    // Summary card values
    const perDay = workMinutesPerDay(hours);
    const days = [...hours.days].sort((a, b) => a - b);
    const contiguous = days.length > 1 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    const dayShort = (d: number) => t(`set_sla_day_${d}`);
    const daysText = contiguous ? `${dayShort(days[0])}–${dayShort(days[days.length - 1])}` : days.map(dayShort).join(' ');
    const respHint = Number.isInteger(respTarget) && respTarget >= 60 ? fill(t('set_sla_approx_hours'), { n: oneDecimal(respTarget / 60) }) : '';
    const priValues = SLA_PRIORITIES.map((p) => draft[p]?.resolve).filter((v): v is number => Number.isFinite(v));
    const reqValues = reqTargets.map((r) => r.resolve).filter(Number.isFinite);
    const reqSame = reqValues.length > 0 && reqValues.every((v) => v === reqValues[0]) && reqTargets.every((r) => r.clock === reqTargets[0].clock);
    const range = (values: number[]) =>
        values.length === 0
            ? '–'
            : Math.min(...values) === Math.max(...values)
              ? fill(t('set_sla_hours_short'), { n: values[0] })
              : fill(t('set_sla_range_hours'), { from: Math.min(...values), to: Math.max(...values) });
    const summary = {
        days: daysText,
        window: `${hours.start}–${hours.end}`,
        breakText:
            hours.break_start && hours.break_end
                ? fill(t('set_sla_break_range'), { from: hours.break_start, to: hours.break_end })
                : t('set_sla_no_break'),
        response: `${Number.isFinite(respTarget) ? respTarget : '–'} ${t('set_sla_minutes')}`,
        responseHint: respHint,
        priority: range(priValues),
        repair: workTargets.length > 0 ? fill(t('set_sla_sum_repair_n'), { n: workTargets.length }) : t('set_sla_sum_repair_none'),
        request: reqSame ? fill(t('set_sla_sum_request_all'), { n: reqValues[0] }) : range(reqValues),
        goal: `${Number.isFinite(goal) ? goal : '–'}%`,
        hoursErrors: countErrors((id) => ['sla-days', 'sla-end', 'sla-break-start'].includes(id)),
        responseErrors: countErrors((id) => id === 'sla-resp'),
        closeErrors: countErrors((id) => /^sla-(pri|rep|req)-/.test(id)),
        goalErrors: countErrors((id) => id === 'sla-goal'),
    };

    // Summary card: this year's holiday count, and a warning while next year has none
    const thisYear = Number(localIsoDate(new Date()).slice(0, 4));
    const holidaySummary = holidays
        ? {
              year: thisYear,
              count: holidays.filter((h) => h.date.startsWith(`${thisYear}-`)).length,
              nextYear: thisYear + 1,
              nextMissing: !holidays.some((h) => h.date.startsWith(`${thisYear + 1}-`)),
              onPick: pickHolidayYear,
          }
        : undefined;

    return (
        <div className="@container">
            <div className={FORM_WIDTH}>
                <div className="mb-4">
                    <h2 className="text-lg font-semibold">{t('set_tickets')}</h2>
                    <p className="text-muted-foreground text-sm">{t('set_sla_lead')}</p>
                </div>

                {shown.length > 0 && <ErrorSummary key={attempt} errors={shown} attempt={attempt} />}

                <SlaSummary values={summary} holidays={holidaySummary} />

                {/* Working days and hours */}
                <section id="sla-sec-hours" tabIndex={-1} aria-labelledby="sla-h-hours" className={cn(SECTION, 'mt-1 border-t-0')}>
                    <SectionHead id="sla-h-hours" title={t('set_sla_hours_title')} desc={t('set_sla_hours_desc')} />
                    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
                        <DayPicker id="sla-days" days={hours.days} onToggle={toggleDay} error={errorOf('sla-days')} />
                        <div>
                            <span id="sla-l-work" className={SLA_LABEL}>
                                {t('set_sla_work_time')}
                            </span>
                            <div role="group" aria-labelledby="sla-l-work" className="flex flex-wrap items-center gap-2">
                                <label htmlFor="sla-start" className="sr-only">
                                    {t('set_sla_start')}
                                </label>
                                <TimeInput id="sla-start" value={hours.start} onChange={(v) => setHoursField('start', v)} className="w-28" />
                                <span aria-hidden className="text-muted-foreground text-sm">
                                    {t('set_sla_to')}
                                </span>
                                <label htmlFor="sla-end" className="sr-only">
                                    {t('set_sla_end')}
                                </label>
                                <TimeInput
                                    id="sla-end"
                                    value={hours.end}
                                    onChange={(v) => setHoursField('end', v)}
                                    className="w-28"
                                    invalid={!!errorOf('sla-end')}
                                    ariaDescribedBy={errorOf('sla-end') ? 'sla-end-error' : undefined}
                                />
                            </div>
                            <FieldError id="sla-end-error" message={errorOf('sla-end')} />
                        </div>
                        <div>
                            <span id="sla-l-break" className={SLA_LABEL}>
                                {t('set_sla_break')} <span className="text-muted-foreground font-normal">{t('set_sla_break_optional')}</span>
                            </span>
                            <div role="group" aria-labelledby="sla-l-break" className="flex flex-wrap items-center gap-2">
                                <label htmlFor="sla-break-start" className="sr-only">
                                    {t('set_sla_break_start')}
                                </label>
                                <TimeInput
                                    id="sla-break-start"
                                    value={hours.break_start ?? ''}
                                    onChange={(v) => setBreakField('break_start', v)}
                                    clearable
                                    className="w-32"
                                    invalid={!!errorOf('sla-break-start')}
                                    ariaDescribedBy={errorOf('sla-break-start') ? 'sla-break-error' : undefined}
                                />
                                <span aria-hidden className="text-muted-foreground text-sm">
                                    {t('set_sla_to')}
                                </span>
                                <label htmlFor="sla-break-end" className="sr-only">
                                    {t('set_sla_break_end')}
                                </label>
                                <TimeInput
                                    id="sla-break-end"
                                    value={hours.break_end ?? ''}
                                    onChange={(v) => setBreakField('break_end', v)}
                                    clearable
                                    className="w-32"
                                    invalid={!!errorOf('sla-break-start')}
                                    ariaDescribedBy={errorOf('sla-break-start') ? 'sla-break-error' : undefined}
                                />
                            </div>
                            <FieldError id="sla-break-error" message={errorOf('sla-break-start')} />
                        </div>
                        <div className="self-end">
                            <WorkdayBar
                                start={minutesOf(hours.start) ?? 0}
                                end={minutesOf(hours.end) ?? 0}
                                breakStart={minutesOf(hours.break_start)}
                                breakEnd={minutesOf(hours.break_end)}
                            />
                            {perDay > 0 && (
                                <p className="text-muted-foreground mt-0.5 text-xs">{fill(t('set_sla_per_day'), { n: oneDecimal(perDay / 60) })}</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Company holidays */}
                <SlaHolidaysSection workDays={hours.days} />

                {/* Pick-up target and SLA goal */}
                <section aria-labelledby="sla-h-main" className={SECTION}>
                    <h3 id="sla-h-main" className="sr-only">{`${t('set_sla_response_within')} ${t('set_sla_goal')}`}</h3>
                    <div className={FIELD_ROW}>
                        <div>
                            <label htmlFor="sla-resp" className={SLA_LABEL}>
                                {t('set_sla_response_within')}
                            </label>
                            <NumberField
                                id="sla-resp"
                                value={respTarget}
                                onChange={(v) => {
                                    setRespTarget(v);
                                    touch();
                                }}
                                unit={t('set_sla_minutes')}
                                hint={respHint}
                                max={10080}
                                error={errorOf('sla-resp')}
                            />
                            <p className="text-muted-foreground mt-1.5 text-xs">{t('set_sla_response_help')}</p>
                        </div>
                        <div>
                            <label htmlFor="sla-goal" className={SLA_LABEL}>
                                {t('set_sla_goal')}
                            </label>
                            <NumberField
                                id="sla-goal"
                                value={goal}
                                onChange={(v) => {
                                    setGoal(v);
                                    touch();
                                }}
                                unit="%"
                                max={100}
                                error={errorOf('sla-goal')}
                            />
                            {Number.isFinite(goal) && (
                                <p className="text-muted-foreground mt-1.5 text-xs">{fill(t('set_sla_goal_help'), { n: goal })}</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Close by priority */}
                <section id="sla-sec-priority" tabIndex={-1} aria-labelledby="sla-h-pri" className={SECTION}>
                    <SectionHead id="sla-h-pri" title={t('set_sla_pri_title')} desc={t('set_sla_pri_desc')} />
                    <div role="table" aria-labelledby="sla-h-pri" className={TABLE}>
                        <div role="row" className={cn(ROW, HEAD_ROW, PRI_COLS)}>
                            <span role="columnheader">{t('ticket_priority')}</span>
                            <span role="columnheader">{t('set_sla_resolve_within')}</span>
                            <span role="columnheader">{t('set_sla_clock')}</span>
                        </div>
                        {SLA_PRIORITIES.map((p) => {
                            const name = t(`ticket_prio_${p}`);
                            const row = draft[p];
                            return (
                                <div key={p} role="row" className={cn(ROW, PRI_COLS)}>
                                    <div role="rowheader" className="col-span-2 @2xl:col-span-1">
                                        <TicketPriorityBadge priority={p} t={t} />
                                    </div>
                                    <div role="cell">
                                        <span aria-hidden className={MINI_LABEL}>
                                            {t('set_sla_resolve_within')}
                                        </span>
                                        <NumberField
                                            id={`sla-pri-${p}`}
                                            value={row?.resolve ?? NaN}
                                            onChange={(v) => setPriority(p, { resolve: v })}
                                            unit={t('set_sla_hours')}
                                            hint={daysHint(row?.resolve ?? NaN, hours, row?.clock ?? 'business', t)}
                                            max={8760}
                                            error={errorOf(`sla-pri-${p}`)}
                                            ariaLabel={fill(t('set_sla_aria_resolve'), { name })}
                                        />
                                    </div>
                                    <div role="cell">
                                        <span aria-hidden className={MINI_LABEL}>
                                            {t('set_sla_clock')}
                                        </span>
                                        <ClockToggle
                                            name={`sla-clock-pri-${p}`}
                                            value={row?.clock ?? 'business'}
                                            onChange={(clock) => setPriority(p, { clock })}
                                            legend={fill(t('set_sla_aria_clock'), { name })}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Repair targets */}
                <section id="sla-sec-repair" tabIndex={-1} aria-labelledby="sla-h-rep" className={SECTION}>
                    <SectionHead
                        id="sla-h-rep"
                        title={t('set_sla_work_title')}
                        desc={t('set_sla_work_desc')}
                        aside={fill(t('set_sla_work_count'), { n: workTargets.length, max: REPAIR_PAIRS })}
                    />
                    {workTargets.length === 0 ? (
                        <div className={TABLE}>
                            <EmptyState
                                title={t('set_empty_sla_repair_targets')}
                                hint={t('set_empty_sla_repair_targets_hint')}
                                className="min-h-[220px]"
                            >
                                <Button type="button" variant="outline" onClick={addWorkTarget}>
                                    <Plus className="h-4 w-4" />
                                    {t('set_sla_work_add')}
                                </Button>
                            </EmptyState>
                        </div>
                    ) : (
                        <div role="table" aria-labelledby="sla-h-rep" className={cn(TABLE, 'overflow-visible')}>
                            {/* Not clipped, so a type or work menu on the last row opens in full */}
                            <div role="row" className={cn(ROW, HEAD_ROW, REP_COLS, 'rounded-t-[calc(var(--radius-lg)-1px)]')}>
                                <span role="columnheader">{t('set_sla_col_ticket_type')}</span>
                                <span role="columnheader">{t('set_sla_col_work_class')}</span>
                                <span role="columnheader">{t('set_sla_resolve_within')}</span>
                                <span role="columnheader">{t('set_sla_clock')}</span>
                                <span role="columnheader">
                                    <span className="sr-only">{t('delete')}</span>
                                </span>
                            </div>
                            {workTargets.map((row) => {
                                const taken = new Set(workTargets.filter((r) => r.uid !== row.uid).map(workKey));
                                const name = `${categoryLabel(row.category)} ${workLabel(row.work_class)}`;
                                return (
                                    <div key={row.uid} role="row" className={cn(ROW, REP_COLS)}>
                                        <div role="cell">
                                            <span aria-hidden className={MINI_LABEL}>
                                                {t('set_sla_col_ticket_type')}
                                            </span>
                                            <SearchableSelect
                                                aria-label={fill(t('set_sla_aria_category'), { name })}
                                                value={row.category}
                                                onChange={(v) => setWorkTarget(row.uid, { category: v as TicketCategory })}
                                                // Every type stays listed; one another row already claims is greyed with the reason.
                                                options={TICKET_CATEGORIES.map((c) => ({
                                                    value: c,
                                                    label: categoryLabel(c),
                                                    search: categoryLabel(c),
                                                    icon: <TicketCategoryIcon category={c} className="text-muted-foreground h-4 w-4" />,
                                                    disabled: c !== row.category && taken.has(`${c}:${row.work_class}`),
                                                    sub:
                                                        c !== row.category && taken.has(`${c}:${row.work_class}`)
                                                            ? t('set_sla_pair_taken')
                                                            : undefined,
                                                }))}
                                            />
                                        </div>
                                        <div role="cell">
                                            <span aria-hidden className={MINI_LABEL}>
                                                {t('set_sla_col_work_class')}
                                            </span>
                                            <SearchableSelect
                                                aria-label={fill(t('set_sla_aria_work_class'), { name })}
                                                value={row.work_class}
                                                onChange={(v) => setWorkTarget(row.uid, { work_class: v as TicketSlaWorkClassTarget['work_class'] })}
                                                options={WORK_CLASSES.map((w) => ({
                                                    value: w,
                                                    label: workLabel(w),
                                                    search: workLabel(w),
                                                    disabled: w !== row.work_class && taken.has(`${row.category}:${w}`),
                                                    sub:
                                                        w !== row.work_class && taken.has(`${row.category}:${w}`)
                                                            ? t('set_sla_pair_taken')
                                                            : undefined,
                                                }))}
                                            />
                                        </div>
                                        <div role="cell">
                                            <span aria-hidden className={MINI_LABEL}>
                                                {t('set_sla_resolve_within')}
                                            </span>
                                            <NumberField
                                                id={`sla-rep-${row.uid}`}
                                                value={row.resolve}
                                                onChange={(v) => setWorkTarget(row.uid, { resolve: v })}
                                                unit={t('set_sla_hours')}
                                                hint={daysHint(row.resolve, hours, row.clock, t)}
                                                max={8760}
                                                error={errorOf(`sla-rep-${row.uid}`)}
                                                ariaLabel={fill(t('set_sla_aria_resolve'), { name })}
                                            />
                                        </div>
                                        <div role="cell">
                                            <span aria-hidden className={MINI_LABEL}>
                                                {t('set_sla_clock')}
                                            </span>
                                            <ClockToggle
                                                name={`sla-clock-rep-${row.uid}`}
                                                value={row.clock}
                                                onChange={(clock) => setWorkTarget(row.uid, { clock })}
                                                legend={fill(t('set_sla_aria_clock'), { name })}
                                            />
                                        </div>
                                        <div role="cell" className="col-span-2 justify-self-end @2xl:col-span-1">
                                            <button
                                                type="button"
                                                onClick={() => removeWorkTarget(row.uid)}
                                                aria-label={fill(t('set_sla_work_remove'), { name })}
                                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-10 w-10 place-items-center rounded-md"
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div role="row" className={cn(ROW, 'py-1.5')}>
                                <div role="cell">
                                    <Button type="button" variant="ghost" onClick={addWorkTarget} disabled={workTargets.length >= REPAIR_PAIRS}>
                                        <Plus className="h-4 w-4" />
                                        {t('set_sla_work_add')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Cases opened from a request */}
                <section id="sla-sec-request" tabIndex={-1} aria-labelledby="sla-h-req" className={SECTION}>
                    <SectionHead id="sla-h-req" title={t('set_sla_request_title')} desc={t('set_sla_request_desc')} />
                    <div role="table" aria-labelledby="sla-h-req" className={TABLE}>
                        <div role="row" className={cn(ROW, HEAD_ROW, REQ_COLS)}>
                            <span role="columnheader">{t('set_sla_col_request_type')}</span>
                            <span role="columnheader">{t('set_sla_resolve_within')}</span>
                            <span role="columnheader">{t('set_sla_clock')}</span>
                        </div>
                        {reqTargets.map((row) => {
                            const meta = REQUEST_TYPE_META[row.type as ServiceRequestType];
                            const name = t(meta?.labelKey ?? row.type);
                            return (
                                <div key={row.type} role="row" className={cn(ROW, REQ_COLS)}>
                                    <div role="rowheader" className="col-span-2 flex min-w-0 items-center gap-2 text-sm font-medium @2xl:col-span-1">
                                        {meta && <meta.icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} aria-hidden />}
                                        <span className="min-w-0">{name}</span>
                                    </div>
                                    <div role="cell">
                                        <span aria-hidden className={MINI_LABEL}>
                                            {t('set_sla_resolve_within')}
                                        </span>
                                        <NumberField
                                            id={`sla-req-${row.type}`}
                                            value={row.resolve}
                                            onChange={(v) => setRequestTarget(row.type, { resolve: v })}
                                            unit={t('set_sla_hours')}
                                            hint={daysHint(row.resolve, hours, row.clock, t)}
                                            max={8760}
                                            error={errorOf(`sla-req-${row.type}`)}
                                            ariaLabel={fill(t('set_sla_aria_resolve'), { name })}
                                        />
                                    </div>
                                    <div role="cell">
                                        <span aria-hidden className={MINI_LABEL}>
                                            {t('set_sla_clock')}
                                        </span>
                                        <ClockToggle
                                            name={`sla-clock-req-${row.type}`}
                                            value={row.clock}
                                            onChange={(clock) => setRequestTarget(row.type, { clock })}
                                            legend={fill(t('set_sla_aria_clock'), { name })}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            {/* Save */}
            <div className={cn(FORM_WIDTH, 'flex items-center justify-end gap-3 pt-2')}>
                <SaveButton onClick={handleSave} loading={update.isPending} success={saved && changeCount === 0} disabled={changeCount === 0}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}
