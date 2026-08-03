import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { WorkflowStrip } from '@/modules/workflow';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { RequestFieldSchema, ServiceRequest, ServiceRequestType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Loader2, Send, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type RequestTypeOption } from '../api/requestApi';
import { useRequestMutations, useRequestOptions } from '../hooks/use-requests';

const LAST_STEP = 2;

/**
 * New Request — a 3-step focus-dialog wizard (the Contract wizard chrome):
 * ① pick the service (clicking a tile advances), ② fill the shared and
 * service-specific fields, ③ review, see the approval route, and submit.
 * Field schemas and select sources come from /service-requests/options, so the
 * dialog always asks for exactly what the server will validate.
 *
 * The dialog keeps a fixed height across steps so it never resizes under the
 * pointer; the chooser centres itself instead of leaving space below.
 */
export function RequestCreateDialog({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: (request: ServiceRequest) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const { data: options } = useRequestOptions(open);
    const { submit } = useRequestMutations();

    const [step, setStep] = useState(0);
    const [type, setType] = useState<ServiceRequestType | null>(null);
    const [reason, setReason] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [err, setErr] = useState<Record<string, string>>({});
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');

    // Reset when (re)opened.
    useEffect(() => {
        if (!open) return;
        setStep(0);
        setType(null);
        setReason('');
        setFields({});
        setErr({});
        setSaveState('idle');
    }, [open]);

    const selected: RequestTypeOption | null = useMemo(() => options?.types.find((o) => o.type === type) ?? null, [options, type]);
    const schema = selected?.fields ?? [];

    const pickType = (option: RequestTypeOption) => {
        setType(option.type);
        setErr({});
        // Seed schema defaults (e.g. qty = 1).
        const seeded: Record<string, string> = {};
        for (const f of option.fields) if (f.default != null) seeded[f.key] = String(f.default);
        setFields(seeded);
    };

    const fieldLabel = (f: RequestFieldSchema) => (lang === 'th' ? f.label_th : f.label_en);
    const requiredMsg = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';

    /** Drop one field's error as soon as the user edits it. */
    const clearErr = (key: string) =>
        setErr((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });

    /**
     * The request's stored title. Nobody types it — a request is fully described
     * by the service it asks for, so the title is derived and the requester only
     * writes the reason. Frozen in the submitting user's language, like the
     * requester-name snapshot on the record.
     */
    const autoTitle = (): string => (type ? t('req_auto_title').replace('{service}', t(REQUEST_TYPE_META[type].labelKey)) : '');

    const buildErrors = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (!type) e.type = requiredMsg;
        if (!reason.trim()) e.reason = requiredMsg;
        for (const f of schema) {
            if (f.internal) continue;
            // An either/or pair passes as long as one of the two sides is filled.
            if (f.allow_other) {
                if (!(fields[f.key] ?? '').trim() && !(fields[f.allow_other] ?? '').trim()) e[`field_${f.key}`] = requiredMsg;
                continue;
            }
            if (f.required && !(fields[f.key] ?? '').trim()) e[`field_${f.key}`] = requiredMsg;
        }
        return e;
    };
    const stepOwns = (s: number, key: string): boolean => (s === 0 ? key === 'type' : s === 1 ? key !== 'type' : false);

    const goToStep = (target: number) => {
        const clamped = Math.max(0, Math.min(target, LAST_STEP));
        if (clamped <= step) {
            setErr({});
            setStep(clamped);
            return;
        }
        const all = buildErrors();
        for (let s = step; s < clamped; s++) {
            const bad = Object.keys(all).filter((k) => stepOwns(s, k));
            if (bad.length) {
                setErr(Object.fromEntries(bad.map((k) => [k, all[k]])));
                setStep(s);
                return;
            }
        }
        setErr({});
        setStep(clamped);
    };

    const doSubmit = async () => {
        const all = buildErrors();
        if (Object.keys(all).length) {
            setErr(all);
            setStep(all.type ? 0 : 1);
            return;
        }
        try {
            const created = await submit.mutateAsync({
                type: type as string,
                title: autoTitle(),
                reason: reason.trim(),
                fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')),
            });
            setSaveState('done');
            useToastStore.getState().push(`${created.reference} · ${t('req_awaiting_first')}`, 'success', t('req_submitted'));
            onCreated?.(created);
            setTimeout(() => {
                setSaveState('idle');
                onClose();
            }, 600);
        } catch (e) {
            const resp = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            // Map server-side field errors onto the wizard's own field names. Keys
            // with no field on screen (requester, title) fall through to the toast.
            const serverErrs: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(resp?.errors ?? {})) {
                const local = key.startsWith('fields.') ? `field_${key.slice(7)}` : key;
                serverErrs[local] = msgs[0] ?? '';
            }
            if (Object.keys(serverErrs).length) {
                setErr(serverErrs);
                setStep(serverErrs.type ? 0 : 1);
            }
            useToastStore.getState().push(resp?.message ?? 'Something went wrong.', 'error');
        }
    };

    const steps = [t('req_step_service'), t('req_step_details'), t('req_step_review')];
    const HeaderIcon = type ? REQUEST_TYPE_META[type].icon : Inbox;
    // An account with no employee record cannot be routed to an approver. Say so
    // on step ① instead of letting someone fill three steps and hit a 422.
    const noEmployee = !!user && user.employee_id == null;
    // Fields the requester actually sees: an `internal` field is revealed by its
    // `allow_other` partner rather than standing on its own.
    const visibleSchema = schema.filter((f) => !f.internal);
    const hasServiceFields = visibleSchema.length > 0;
    // The column count is the service's own choice (RequestSchemas::layouts) —
    // with nothing to put beside the reason it always collapses to one.
    const twoColumnDetails = hasServiceFields && selected?.columns === 2;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            {/* 1100px matches every other focus dialog in the app. Fixed height on
                purpose: the dialog must not resize as you move between steps —
                short steps centre their content instead of leaving a void. */}
            <DialogContent className="!flex h-[min(760px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={HeaderIcon}
                    accent={type ? REQUEST_TYPE_META[type].color : undefined}
                    eyebrow={type ? `${t('req_new_eyebrow')} · ${t(REQUEST_TYPE_META[type].labelKey)}` : t('req_new_eyebrow')}
                    title={t('req_new_title')}
                    srDescription={t('requests_sub')}
                />

                {/* Horizontal stepper */}
                <div className="border-border/60 flex items-start border-b px-6 pb-4">
                    {steps.map((label, i) => {
                        const active = i === step;
                        const done = i < step;
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => goToStep(i)}
                                className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
                            >
                                {i < steps.length - 1 && (
                                    <span
                                        className={cn(
                                            'absolute top-[13px] right-[calc(-50%+17px)] left-[calc(50%+17px)] h-0.5 rounded-full',
                                            done ? 'bg-brand' : 'bg-border',
                                        )}
                                    />
                                )}
                                <span
                                    className={cn(
                                        'bg-background z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold transition-colors',
                                        active && 'border-brand bg-brand text-brand-foreground',
                                        done && 'border-brand/40 bg-brand/10 text-brand',
                                        !active && !done && 'border-input text-muted-foreground',
                                    )}
                                >
                                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                                </span>
                                <span
                                    className={cn(
                                        'text-xs leading-tight font-semibold transition-colors',
                                        active ? 'text-brand' : done ? 'text-foreground' : 'text-muted-foreground',
                                    )}
                                >
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div key={step} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                        {/* ── ① Pick the service — one job, one click ─── */}
                        {/* A chooser has nothing to scroll to, so it sits in the middle of the
                            fixed-height dialog rather than leaving the space below it empty. */}
                        {step === 0 && (
                            <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col justify-center gap-5">
                                <div>
                                    <h2 className="text-lg font-bold tracking-tight">{t('req_pick_title')}</h2>
                                    <p className="text-muted-foreground mt-0.5 text-sm">{t('req_pick_sub')}</p>
                                </div>

                                {noEmployee && (
                                    <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs">
                                        <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                                        {t('req_no_employee_hint')}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                                    {(options?.types ?? []).map((option) => {
                                        const meta = REQUEST_TYPE_META[option.type];
                                        const Icon = meta.icon;
                                        const closed = !option.workflow?.active;
                                        const inactive = closed || noEmployee;
                                        return (
                                            <ChoiceCard
                                                key={option.type}
                                                selected={type === option.type}
                                                disabled={inactive}
                                                // Picking IS the step — one click moves on, no Next to hunt for.
                                                onClick={() => {
                                                    pickType(option);
                                                    setStep(1);
                                                }}
                                                // min-h keeps every tile identical whether its name wraps to one
                                                // line or two, so the grid never shifts between rows.
                                                className={cn(
                                                    'flex min-h-[116px] flex-col items-center justify-center gap-2.5 rounded-lg px-3 py-4 text-center',
                                                    inactive && 'opacity-55',
                                                )}
                                            >
                                                <span
                                                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                                                    style={{ background: `${meta.color}1f`, color: meta.color }}
                                                >
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                <span className="text-sm leading-snug font-semibold">{t(meta.labelKey)}</span>
                                                {/* Only a closed service needs a caption — the rest speak for themselves. */}
                                                {closed && (
                                                    <span className="text-muted-foreground text-[11px] leading-tight">{t('req_inactive')}</span>
                                                )}
                                            </ChoiceCard>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── ② Fill details ─────────────────────────── */}
                        {step === 1 && type && (
                            <div className={cn('mx-auto w-full', twoColumnDetails ? 'max-w-[1000px]' : 'max-w-[620px]')}>
                                <div className="mb-5">
                                    <h2 className="text-lg font-bold tracking-tight">{t('req_details_title')}</h2>
                                    <p className="text-muted-foreground mt-0.5 text-sm">{t('req_details_sub')}</p>
                                </div>

                                <div className={cn('grid gap-x-10 gap-y-6', twoColumnDetails && 'md:grid-cols-2')}>
                                    {/* The reason carries everything a form field used to ask for
                                        piecemeal — quantity, model, timing, urgency. */}
                                    <div className="space-y-4">
                                        {hasServiceFields && <SectionLabel>{t('req_section_general')}</SectionLabel>}
                                        <Field label={t('req_field_reason')} required error={err.reason} name="reason">
                                            <Textarea
                                                autoFocus
                                                value={reason}
                                                onChange={(e) => {
                                                    setReason(e.target.value);
                                                    clearErr('reason');
                                                }}
                                                placeholder={t('req_field_reason_ph')}
                                                className="min-h-[160px]"
                                            />
                                        </Field>
                                    </div>

                                    {/* Service-specific fields. In a one-column layout they follow the
                                        reason under a rule rather than sitting beside it. */}
                                    {hasServiceFields && (
                                        <div className={cn('space-y-4', !twoColumnDetails && 'border-border/70 border-t pt-6')}>
                                            <SectionLabel>{t('req_service_section')}</SectionLabel>
                                            {visibleSchema.map((f) => (
                                                <SchemaField
                                                    key={f.key}
                                                    schema={f}
                                                    label={fieldLabel(f)}
                                                    lang={lang}
                                                    value={fields[f.key] ?? ''}
                                                    otherValue={f.allow_other ? (fields[f.allow_other] ?? '') : undefined}
                                                    otherLabel={f.allow_other ? fieldLabel(schema.find((s) => s.key === f.allow_other)!) : undefined}
                                                    error={err[`field_${f.key}`]}
                                                    sources={options?.sources}
                                                    onChange={(v) => {
                                                        setFields((prev) => ({ ...prev, [f.key]: v }));
                                                        clearErr(`field_${f.key}`);
                                                    }}
                                                    onOtherChange={(v) => {
                                                        if (!f.allow_other) return;
                                                        setFields((prev) => ({ ...prev, [f.allow_other as string]: v, [f.key]: '' }));
                                                        clearErr(`field_${f.key}`);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── ③ Review ───────────────────────────────── */}
                        {step === 2 && type && (
                            <div className="mx-auto w-full max-w-[800px]">
                                <div className="mb-5">
                                    <h2 className="text-lg font-bold tracking-tight">{t('req_review_title')}</h2>
                                    <p className="text-muted-foreground mt-0.5 text-sm">{t('req_review_sub')}</p>
                                </div>

                                <div className="border-border divide-border/70 divide-y overflow-hidden rounded-lg border">
                                    <ReviewRow k={t('req_filter_type')} v={t(REQUEST_TYPE_META[type].labelKey)} />
                                    <ReviewRow k={t('req_requester_label')} v={user?.name ?? ''} />
                                    {schema
                                        .filter((f) => (fields[f.key] ?? '') !== '')
                                        .map((f) => (
                                            <ReviewRow
                                                key={f.key}
                                                k={fieldLabel(f)}
                                                v={displayValue(f, fields[f.key], lang, options?.sources)}
                                                mono={f.mono}
                                            />
                                        ))}
                                    {/* Reason runs long — it gets the full width instead of being squeezed
                                        into a right-aligned cell. */}
                                    <div className="odd:bg-muted/30 px-4 py-2.5">
                                        <div className="text-muted-foreground mb-1 text-xs">{t('req_field_reason')}</div>
                                        <p className="text-sm whitespace-pre-wrap">{reason}</p>
                                    </div>
                                </div>

                                {/* The one place the approval route lives — you are about to commit to it. */}
                                {selected?.workflow && (
                                    <div className="mt-6">
                                        <SectionLabel>{t('req_route_title')}</SectionLabel>
                                        <div className="bg-muted/30 rounded-lg px-4 py-4">
                                            {/* showSla off: the requester sees who approves, not the clock behind it. */}
                                            <WorkflowStrip steps={selected.workflow.steps} showSla={false} />
                                        </div>
                                        {selected.workflow.auto_ticket && (
                                            <p className="text-muted-foreground mt-2.5 flex items-center gap-2 text-xs">
                                                <Zap className="text-brand h-3.5 w-3.5 shrink-0" />
                                                {t('req_auto_ticket_note')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-border/60 bg-muted/30 flex items-center gap-3 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={step === 0 ? onClose : () => goToStep(step - 1)} disabled={submit.isPending}>
                        {step === 0 ? (
                            t('cancel')
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" />
                                {t('back')}
                            </>
                        )}
                    </Button>
                    <div className="flex-1" />
                    {/* Step ① needs no Next — choosing a service moves the wizard on. */}
                    {step === 1 && (
                        <Button onClick={() => goToStep(2)}>
                            {t('next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    )}
                    {step === LAST_STEP && (
                        <Button onClick={doSubmit} disabled={submit.isPending || saveState === 'done'}>
                            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {saveState === 'done' ? t('req_submitted') : t('req_submit')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Render one schema-driven field with the right input widget. */
function SchemaField({
    schema,
    label,
    value,
    otherValue,
    otherLabel,
    error,
    onChange,
    onOtherChange,
    lang,
    sources,
}: {
    schema: RequestFieldSchema;
    label: string;
    value: string;
    /** Current typed-in value of the `allow_other` partner, when the field has one. */
    otherValue?: string;
    otherLabel?: string;
    error?: string;
    onChange: (v: string) => void;
    onOtherChange?: (v: string) => void;
    lang: string;
    sources?: Record<string, { id: number; label: string; detail: string | null }[]>;
}) {
    const t = useT();

    if (schema.input === 'source') {
        const list = sources?.[schema.source ?? ''] ?? [];
        // A catalogue with an escape hatch: tick the box when what you need is
        // not on the list, and type it instead.
        const usingOther = schema.allow_other != null && (otherValue ?? '') !== '';
        return (
            <>
                <Field
                    label={label}
                    required={schema.required || schema.allow_other != null}
                    error={usingOther ? undefined : error}
                    name={schema.key}
                >
                    <SearchableSelect
                        value={usingOther ? '' : value}
                        onChange={onChange}
                        clearable={!schema.required}
                        options={
                            usingOther
                                ? []
                                : list.map((o) => ({
                                      value: String(o.id),
                                      label: o.label,
                                      hint: o.detail ?? undefined,
                                      search: `${o.label} ${o.detail ?? ''}`,
                                  }))
                        }
                    />
                </Field>

                {schema.allow_other != null && onOtherChange && (
                    <div className="space-y-3">
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                            <Checkbox
                                checked={usingOther}
                                onCheckedChange={(on) => {
                                    // Ticking parks a space so the field counts as "in use";
                                    // unticking clears it and hands control back to the list.
                                    onOtherChange(on ? ' ' : '');
                                    if (on) onChange('');
                                }}
                            />
                            {t('req_other_software')}
                        </label>
                        {usingOther && (
                            <Field label={otherLabel ?? ''} required error={error} name={schema.allow_other}>
                                <Input
                                    autoFocus
                                    value={otherValue?.trimStart() ?? ''}
                                    onChange={(e) => onOtherChange(e.target.value)}
                                    placeholder={schema.placeholder}
                                />
                            </Field>
                        )}
                    </div>
                )}
            </>
        );
    }
    if (schema.input === 'select') {
        return (
            <Field label={label} required={schema.required} error={error} name={schema.key}>
                <select
                    className={cn('border-input bg-background h-10 w-full rounded-lg border px-3 text-sm', error && 'border-destructive')}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">{lang === 'th' ? '— เลือก —' : '— select —'}</option>
                    {(schema.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                            {lang === 'th' ? o.label_th : o.label_en}
                        </option>
                    ))}
                </select>
            </Field>
        );
    }
    if (schema.input === 'date') {
        return (
            <Field label={label} required={schema.required} error={error} name={schema.key}>
                <DateInput value={value} onChange={onChange} />
            </Field>
        );
    }
    return (
        <Field label={label} required={schema.required} error={error} name={schema.key}>
            <Input
                type={schema.input === 'number' ? 'number' : 'text'}
                min={schema.min}
                max={schema.max}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={schema.placeholder}
                className={cn(schema.mono && 'font-mono')}
            />
        </Field>
    );
}

/** Resolve a review value for display (select label / source name). */
function displayValue(
    f: RequestFieldSchema,
    raw: string,
    lang: string,
    sources?: Record<string, { id: number; label: string; detail: string | null }[]>,
): string {
    if (f.input === 'select') {
        const opt = (f.options ?? []).find((o) => o.value === raw);
        return opt ? (lang === 'th' ? opt.label_th : opt.label_en) : raw;
    }
    if (f.input === 'source') {
        return sources?.[f.source ?? '']?.find((o) => String(o.id) === raw)?.label ?? raw;
    }
    return raw;
}

function ReviewRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="odd:bg-muted/30 flex justify-between gap-4 px-4 py-2 text-sm">
            <span className="text-muted-foreground shrink-0 text-xs leading-6">{k}</span>
            <span className={cn('min-w-0 text-right font-semibold break-words', mono && 'font-mono text-sm')}>{v}</span>
        </div>
    );
}
