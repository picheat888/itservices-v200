/**
 * Settings → Tickets & SLA — เป้าหมายปิดเคส สามชุด และหน้าต่างเวลาทำการที่นาฬิกานับด้วย
 *
 * แยกออกมาจาก pages/index.tsx เพราะแท็บนี้ยาวกว่าแท็บอื่นมาก และการเพิ่มลิสต์ที่สาม
 * (เป้าหมายตามลักษณะงาน) จะดันไฟล์รวมไปเกิน 2,200 บรรทัด
 */
import { useT } from '@/lang';
import { TicketPriorityBadge } from '@/modules/ticket';
import { SaveButton } from '@/shared/components/save-button';
import { SearchSelect } from '@/shared/components/search-select';
import { REQUEST_TYPES, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequestType, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TimeInput } from '@/shared/ui/time-input';
import { AlertCircle, Info, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type TicketSlaHours, type TicketSlaRequestTarget } from '../api/settingsApi';
import { useSettings, useUpdateTicketSla } from '../hooks/use-settings';

const SLA_PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

/**
 * "≈ 3 working days" beside a target in hours.
 *
 * Nobody thinks in 72 hours; they think in three days. The conversion uses the working window
 * set further down this same page — the clocks only count those hours, so dividing by 24 would
 * print a number the system does not agree with. Below one day there is nothing to add.
 */
function workingDaysHint(resolveHours: number, hours: TicketSlaHours, t: (key: string) => string): string {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const breakLength = hours.break_start && hours.break_end ? minutes(hours.break_end) - minutes(hours.break_start) : 0;
    const perDay = minutes(hours.end) - minutes(hours.start) - breakLength;
    if (!Number.isFinite(resolveHours) || resolveHours < 1 || perDay <= 0) return '';

    // Only once the target is a full working day or more. Rounding 5 hours up to "≈ 1 day"
    // both overstates it and makes 5 and 9 hours read as the same thing.
    const target = resolveHours * 60;
    if (target < perDay) return '';

    return t('set_sla_approx_days').replace('{n}', String(Math.round(target / perDay)));
}

// ISO weekdays for the SLA working-window picker (1 = Monday … 7 = Sunday).
const SLA_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Settings → Tickets: edit the per-priority SLA targets + the working window they count against. */
export function TicketsSlaTab() {
    const t = useT();
    const { data } = useSettings();
    const update = useUpdateTicketSla();
    const stored = data?.ticket_sla;
    const storedRequest = data?.ticket_sla_request;
    const storedResponse = data?.ticket_sla_response;
    const storedHours = data?.ticket_sla_hours;
    const [draft, setDraft] = useState<Record<string, { resolve: number }>>({});
    // Targets keyed on what was requested. A list rather than a fixed table: the administrator
    // adds a row only for the kinds of request whose length differs from their urgency.
    const [reqTargets, setReqTargets] = useState<TicketSlaRequestTarget[]>([]);
    const [reqErrors, setReqErrors] = useState<Record<string, string>>({});
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
        if (storedRequest) setReqTargets(storedRequest);
    }, [storedRequest]);
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
    // Compared as a whole: a row added, removed, switched or retimed all count the same.
    const reqSignature = (rows: TicketSlaRequestTarget[]) => rows.map((r) => `${r.type}:${r.resolve}:${r.enabled ? 1 : 0}`).join('|');
    const reqDirty = !!storedRequest && reqSignature(reqTargets) !== reqSignature(storedRequest);
    const dirty =
        hoursDirty ||
        reqDirty ||
        (storedResponse != null && respTarget !== storedResponse) ||
        (!!stored && SLA_PRIORITIES.some((p) => draft[p] && draft[p].resolve !== stored[p]?.resolve));

    /** The request kinds without a target yet — the only ones the picker can offer. */
    const availableRequestTypes = REQUEST_TYPES.filter((type) => !reqTargets.some((r) => r.type === type));

    /**
     * A new exception starts on the first unused type and the medium target — the number the
     * case would have had anyway, so the row is never wrong before it is edited.
     */
    const addRequestTarget = () => {
        const type = availableRequestTypes[0];
        if (!type) return;
        setReqTargets((rows) => [...rows, { type, resolve: draft.medium?.resolve ?? 24, enabled: true }]);
        setSaved(false);
    };
    const setRequestTarget = (type: string, patch: Partial<TicketSlaRequestTarget>) => {
        setReqTargets((rows) => rows.map((r) => (r.type === type ? { ...r, ...patch } : r)));
        setSaved(false);
        setReqErrors((e) => ({ ...e, [type]: '' }));
    };
    const removeRequestTarget = (type: string) => {
        setReqTargets((rows) => rows.filter((r) => r.type !== type));
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
        setDraft((d) => ({ ...d, [p]: { resolve: value } }));
        setSaved(false);
        if (errors[p]?.resolve) setErrors((e) => ({ ...e, [p]: { ...e[p], resolve: undefined } }));
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

        setRespError(respErr);
        setErrors(next);
        setReqErrors(reqNext);
        setHoursError(windowErr);
        if (respErr || Object.keys(next).length > 0 || Object.keys(reqNext).length > 0 || windowErr) return;
        update.mutate(
            { ticket_sla: draft, ticket_sla_request: reqTargets, ticket_sla_response: respTarget, ticket_sla_hours: hours },
            { onSuccess: () => setSaved(true) },
        );
    };

    return (
        <div className="max-w-3xl">
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
                                        <span className="text-muted-foreground text-xs">{workingDaysHint(draft[p]?.resolve, hours, t)}</span>
                                    </div>
                                    {errors[p]?.resolve && (
                                        <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {errors[p]?.resolve}
                                        </p>
                                    )}
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

            {/* Exceptions to the table above, for cases opened from a request — where the length
                of the work is decided by what was asked for, not by how urgent it is.

                Indented under a left rule rather than presented as a sibling section: the heading
                says "except", and the layout has to agree with it. Written as one sentence in a
                blue note, the precedence was a rule people would read once and forget. */}
            <div className="border-border/70 mt-5 ml-1 border-l-2 pl-4">
                <h3 className="text-sm font-semibold">{t('set_sla_request_title')}</h3>
                <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{t('set_sla_request_desc')}</p>

                {reqTargets.length === 0 ? (
                    // Says what the system does right now, rather than leaving an empty control.
                    <p className="text-muted-foreground mb-3 text-xs">{t('set_sla_request_empty')}</p>
                ) : (
                    <ul className="mb-3 space-y-2">
                        {reqTargets.map((row, i) => {
                            const meta = REQUEST_TYPE_META[row.type as ServiceRequestType];
                            return (
                                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <span className="w-56 shrink-0">
                                        <SearchSelect
                                            value={row.type}
                                            onChange={(v) => setRequestTarget(row.type, { type: v })}
                                            // Its own type stays in the list; the others' do not,
                                            // so two rows can never name the same thing.
                                            options={[row.type, ...availableRequestTypes].map((type) => ({
                                                value: type,
                                                label: t(REQUEST_TYPE_META[type as ServiceRequestType]?.labelKey ?? type),
                                            }))}
                                        />
                                    </span>
                                    {meta && <meta.icon className="hidden h-4 w-4 shrink-0 sm:block" style={{ color: meta.color }} />}
                                    <Input
                                        type="number"
                                        min={1}
                                        max={8760}
                                        value={row.resolve}
                                        onChange={(e) => setRequestTarget(row.type, { resolve: Number(e.target.value) })}
                                        className={cn('h-9 w-24', reqErrors[row.type] && 'border-destructive')}
                                    />
                                    <span className="text-muted-foreground text-sm">{t('set_sla_hours')}</span>
                                    <span className="text-muted-foreground min-w-[86px] text-xs">{workingDaysHint(row.resolve, hours, t)}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeRequestTarget(row.type)}
                                        aria-label={t('delete')}
                                        title={t('delete')}
                                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-8 w-8 place-items-center rounded-md"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    {reqErrors[row.type] && <p className="text-destructive w-full text-xs">{reqErrors[row.type]}</p>}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* An action is a button. The type is chosen in the row it belongs to. */}
                <Button type="button" variant="outline" size="sm" onClick={addRequestTarget} disabled={availableRequestTypes.length === 0}>
                    <Plus className="h-4 w-4" />
                    {t('set_sla_request_add')}
                </Button>
                {availableRequestTypes.length === 0 && <p className="text-muted-foreground mt-2 text-xs">{t('set_sla_request_all_used')}</p>}
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
