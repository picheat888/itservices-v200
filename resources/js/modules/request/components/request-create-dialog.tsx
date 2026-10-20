import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { WorkflowStrip } from '@/modules/workflow';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { AttachmentList, AttachmentRow, FileDropZone, mergeFiles } from '@/shared/components/file-drop-zone';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { serverMessage } from '@/shared/lib/api-errors';
import { DARK_GROUND, LIGHT_GROUND, readableInk } from '@/shared/lib/contrast';
import { localLabel, localName } from '@/shared/lib/local-name';
import { REQUEST_BLOCK_REASON_LABEL, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn, focusFirstError, isEmail } from '@/shared/lib/utils';
import type { RequestFieldSchema, ServiceRequest, ServiceRequestType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Send, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { type RequestTypeOption } from '../api/requestApi';
import { useRequestMutations, useRequestOptions } from '../hooks/use-requests';

const LAST_STEP = 2;

/** Total upload size the wizard will send; PHP's post_max_size would refuse more without a readable answer. */
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

// Non-empty field values only, so a blanked field compares equal to an untouched one.
const filledKey = (values: Record<string, string>) =>
    JSON.stringify(
        Object.entries(values)
            .filter(([, v]) => v !== '')
            .sort(),
    );

/**
 * New request wizard: ① pick the service, ② fill the fields, ③ review the route and submit.
 * Schemas come from /service-requests/options, so it asks exactly what the server validates.
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
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const { data: options } = useRequestOptions(open);
    const { submit } = useRequestMutations();

    const [step, setStep] = useState(0);
    const [type, setType] = useState<ServiceRequestType | null>(null);
    const [reason, setReason] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<File[]>([]);
    const [err, setErr] = useState<Record<string, string>>({});
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');
    const formError = useFormError();
    /** Upload percentage of the submit itself — one request, so one bar. */
    const [uploadPct, setUploadPct] = useState<number | null>(null);

    // Reset when (re)opened, during render so the last session never flashes
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setStep(0);
            setType(null);
            setReason('');
            setFields({});
            setFiles([]);
            setErr({});
            formError.clear();
            setSaveState('idle');
            setUploadPct(null);
        }
    }
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(closeTimer.current), []);

    const selected: RequestTypeOption | null = useMemo(() => options?.types.find((o) => o.type === type) ?? null, [options, type]);
    const schema = selected?.fields ?? [];

    // Any picked service, typed value beyond the schema defaults, or attached file counts as input.
    const seededFields = useMemo(() => {
        const seeded: Record<string, string> = {};
        for (const f of selected?.fields ?? []) if (f.default != null) seeded[f.key] = String(f.default);
        return seeded;
    }, [selected]);
    const isDirty = type !== null || reason !== '' || files.length > 0 || filledKey(fields) !== filledKey(seededFields);
    const guardClose = useDiscardGuard(open && isDirty && saveState !== 'done');

    const pickType = (option: RequestTypeOption) => {
        setType(option.type);
        setErr({});
        formError.clear();
        // Files belong to the service they were picked for
        setFiles([]);
        // Seed schema defaults (e.g. qty = 1).
        const seeded: Record<string, string> = {};
        for (const f of option.fields) if (f.default != null) seeded[f.key] = String(f.default);
        setFields(seeded);
    };

    const fieldLabel = (f: RequestFieldSchema) => localLabel(f, lang);
    const requiredMsg = t('req_err_required');

    /** Drop one field's error as soon as the user edits it. */
    const clearErr = (key: string) =>
        setErr((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });

    const buildErrors = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (!type) e.type = t('req_err_pick_service');
        if (!reason.trim()) e.reason = requiredMsg;
        for (const f of schema) {
            if (f.internal) continue;
            // An either/or pair passes as long as one of the two sides is filled.
            if (f.allow_other) {
                if (!(fields[f.key] ?? '').trim() && !(fields[f.allow_other] ?? '').trim()) e[`field_${f.key}`] = requiredMsg;
                continue;
            }
            const filled = (fields[f.key] ?? '').trim();
            if (f.required && !filled) {
                e[`field_${f.key}`] = requiredMsg;
                continue;
            }
            if (f.input === 'email' && filled && !isEmail(filled)) e[`field_${f.key}`] = t('req_bad_email');
        }
        // Mirrors RequestSchemas::attachmentsRequired
        if (selected?.attachments_required && files.length === 0) e.files = t('req_attach_needed');
        if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) {
            e.files = t('req_attach_too_large').replace('{mb}', fmtN(Math.round(MAX_TOTAL_BYTES / 1048576)));
        }
        return e;
    };
    /** Show errors and move focus to the first one (Field names are the schema keys). */
    const showErrors = (errors: Record<string, string>) => {
        setErr(errors);
        focusFirstError(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.startsWith('field_') ? k.slice(6) : k, v])));
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
                showErrors(Object.fromEntries(bad.map((k) => [k, all[k]])));
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
            showErrors(all);
            setStep(all.type ? 0 : 1);
            return;
        }
        formError.clear();
        try {
            const created = await submit.mutateAsync({
                payload: {
                    type: type as string,
                    reason: reason.trim(),
                    fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')),
                    files,
                },
                onProgress: files.length > 0 ? setUploadPct : undefined,
            });
            setUploadPct(null);
            setSaveState('done');
            useToastStore.getState().push(created.reference, 'success', t('req_submitted'));
            onCreated?.(created);
            closeTimer.current = setTimeout(() => {
                setSaveState('idle');
                onClose();
            }, 600);
        } catch (e) {
            setUploadPct(null);
            const resp = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            // Server field errors land on the wizard's own fields; the rest go to the banner.
            const onScreen = new Set(['type', 'reason', 'files', ...schema.map((f) => `field_${f.key}`)]);
            const serverErrs: Record<string, string> = {};
            const offScreen: string[] = [];
            for (const [key, msgs] of Object.entries(resp?.errors ?? {})) {
                const local = key.startsWith('fields.') ? `field_${key.slice(7)}` : key.startsWith('files') ? 'files' : key;
                if (onScreen.has(local)) serverErrs[local] = msgs[0] ?? '';
                else if (msgs[0]) offScreen.push(msgs[0]);
            }
            if (Object.keys(serverErrs).length) {
                showErrors(serverErrs);
                setStep(serverErrs.type ? 0 : 1);
            }
            // A refused reporting line arrives as a code (ChainBlockReason), worded here
            const blockKey = REQUEST_BLOCK_REASON_LABEL[resp?.errors?.requester?.[0] ?? ''];
            if (blockKey) formError.show(`${t('req_block_title')}: ${t(blockKey)}`);
            else if (offScreen.length) formError.show(offScreen[0]);
            else if (!Object.keys(serverErrs).length) formError.show(serverMessage(e) ?? t('cd_error'));
        }
    };

    const steps = [t('req_step_service'), t('req_step_details'), t('req_step_review')];
    const HeaderIcon = type ? REQUEST_TYPE_META[type].icon : Inbox;
    // No employee record means no route to an approver: said on step ①
    const noEmployee = !!user && user.employee_id == null;
    // An `internal` field is revealed by its `allow_other` partner
    const visibleSchema = schema.filter((f) => !f.internal);
    const hasServiceFields = visibleSchema.length > 0;
    // Column count from RequestSchemas::layouts
    const twoColumnDetails = hasServiceFields && selected?.columns === 2;
    // Limits from RequestAttachmentService; the fallback covers the first load
    const attachLimits = options?.attachments ?? { max_files: 5, max_size_kb: 10240, extensions: [] };
    const acceptExtensions = attachLimits.extensions;
    const attachRequired = !!selected?.attachments_required;

    const addFiles = (list: FileList | File[]) => {
        setFiles((prev) => mergeFiles(prev, list, acceptExtensions, attachLimits.max_files));
        clearErr('files');
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !submit.isPending && guardClose(onClose)}>
            {/* Fixed height so the dialog never resizes between steps */}
            <DialogContent className={focusDialogContentClass}>
                <FocusDialogHeader
                    icon={HeaderIcon}
                    accent={type ? REQUEST_TYPE_META[type].color : undefined}
                    eyebrow={type ? `${t('req_new_eyebrow')}: ${t(REQUEST_TYPE_META[type].labelKey)}` : t('req_new_eyebrow')}
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
                                aria-current={active ? 'step' : undefined}
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
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} className="mx-auto mb-5 max-w-[960px]" />
                    <div key={step} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                        {/* ① Pick the service — one click moves on */}
                        {step === 0 && (
                            <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col justify-center gap-4">
                                <div>
                                    <h2 className="text-lg font-bold tracking-tight">{t('req_pick_title')}</h2>
                                    <p className="text-muted-foreground mt-0.5 text-sm">{t('req_pick_sub')}</p>
                                    {err.type && (
                                        <p
                                            key={err.type}
                                            role="alert"
                                            className="text-destructive animate-shake mt-1.5 flex items-center gap-1.5 text-xs"
                                        >
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {err.type}
                                        </p>
                                    )}
                                </div>

                                {noEmployee && (
                                    <div className="border-destructive/40 bg-destructive/5 dark:text-destructive flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs text-red-700">
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
                                                invalid={!!err.type && !inactive}
                                                disabled={inactive}
                                                onClick={() => {
                                                    pickType(option);
                                                    setStep(1);
                                                }}
                                                className={cn(
                                                    'flex min-h-[116px] flex-col items-center justify-center gap-2.5 rounded-lg px-3 py-4 text-center',
                                                    inactive && 'opacity-55',
                                                )}
                                            >
                                                <span
                                                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--ink)] dark:text-[var(--ink-dark)]"
                                                    style={iconTile(meta.color)}
                                                >
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                <span className="text-sm leading-snug font-semibold">{t(meta.labelKey)}</span>
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

                                    {/* Service-specific fields */}
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

                                {/* Attachments, full width */}
                                <div data-field="files" className="border-border/70 mt-6 border-t pt-6">
                                    <SectionLabel>
                                        {t('req_attach_section')}
                                        {attachRequired && <span className="text-destructive ml-0.5">*</span>}
                                    </SectionLabel>
                                    <p className="text-muted-foreground mb-3.5 text-xs">
                                        {attachRequired ? t('req_attach_required') : t('req_attach_optional')}
                                    </p>

                                    <FileDropZone
                                        accept={acceptExtensions}
                                        hint={t('req_attach_types')
                                            .replace('{size}', fmtN(Math.round(attachLimits.max_size_kb / 1024)))
                                            .replace('{max}', fmtN(attachLimits.max_files))}
                                        compact={files.length > 0}
                                        onPick={addFiles}
                                    />

                                    {files.length > 0 && (
                                        <AttachmentList count={files.length} max={attachLimits.max_files}>
                                            {files.map((f, i) => (
                                                <AttachmentRow
                                                    key={i}
                                                    name={f.name}
                                                    size={f.size}
                                                    mime={f.type}
                                                    onRemove={() => {
                                                        setFiles((prev) => prev.filter((_, j) => j !== i));
                                                        clearErr('files');
                                                    }}
                                                />
                                            ))}
                                        </AttachmentList>
                                    )}

                                    {err.files && (
                                        <p className="text-destructive mt-2 flex items-center gap-1.5 text-xs">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {err.files}
                                        </p>
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
                                    <ReviewRow k={t('req_requester_label')} v={(user && localName(user, lang)) ?? ''} />
                                    {schema
                                        .filter((f) => (fields[f.key] ?? '') !== '')
                                        .map((f) => (
                                            <ReviewRow key={f.key} k={fieldLabel(f)} v={displayValue(f, fields[f.key], lang, options?.sources)} />
                                        ))}
                                    {files.length > 0 && (
                                        <ReviewRow k={t('req_attach_section')} v={t('req_attach_review').replace('{n}', fmtN(files.length))} />
                                    )}
                                    {/* Reason, full width */}
                                    <div className="odd:bg-muted/30 px-4 py-2.5">
                                        <div className="text-muted-foreground mb-1 text-xs">{t('req_field_reason')}</div>
                                        <p className="text-sm whitespace-pre-wrap">{reason}</p>
                                    </div>
                                </div>

                                {/* Files about to be sent */}
                                {files.length > 0 && (
                                    <div className="mt-4">
                                        <AttachmentList count={files.length} max={attachLimits.max_files}>
                                            {files.map((f, i) => (
                                                <AttachmentRow key={i} name={f.name} size={f.size} mime={f.type} />
                                            ))}
                                        </AttachmentList>
                                    </div>
                                )}

                                {/* Approval route */}
                                {selected?.workflow && (
                                    <div className="mt-6">
                                        <SectionLabel>{t('req_route_title')}</SectionLabel>
                                        <div className="bg-muted/30 rounded-lg px-4 py-4">
                                            <WorkflowStrip steps={selected.workflow.steps} />
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
                    <Button variant="outline" onClick={step === 0 ? () => guardClose(onClose) : () => goToStep(step - 1)} disabled={submit.isPending}>
                        {step === 0 ? (
                            t('cancel')
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" />
                                {t('back')}
                            </>
                        )}
                    </Button>
                    {/* Upload progress */}
                    {uploadPct != null && (
                        <div className="ml-4 flex items-center gap-2">
                            <div
                                role="progressbar"
                                aria-label={t('req_attach_section')}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={uploadPct}
                                className="bg-muted h-1.5 w-40 overflow-hidden rounded-full"
                            >
                                <div className="bg-brand h-full rounded-full transition-[width]" style={{ width: `${uploadPct}%` }} />
                            </div>
                            <span className="text-muted-foreground text-xs">{uploadPct}%</span>
                        </div>
                    )}
                    <div className="flex-1" />
                    {/* Step ① has no Next: picking a service moves on */}
                    {step === 1 && (
                        <Button onClick={() => goToStep(2)}>
                            {t('next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    )}
                    {step === LAST_STEP && (
                        <SaveButton onClick={doSubmit} loading={submit.isPending} disabled={saveState === 'done'}>
                            <Send className="h-4 w-4" />
                            {saveState === 'done' ? t('req_submitted') : t('req_submit')}
                        </SaveButton>
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
        // Tick "not on the list" to type it instead
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
                                    // A parked space marks the typed field as in use
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
                                    autoComplete="off"
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
        const options = schema.options ?? [];

        // Two fixed choices sit side by side; managed lists always keep the dropdown
        if (options.length === 2 && !schema.managed) {
            return (
                <Field label={label} required={schema.required} error={error} name={schema.key}>
                    <ChoicePair
                        label={label}
                        options={options.map((o) => ({ value: o.value, label: localLabel(o, lang) }))}
                        value={value}
                        required={schema.required}
                        invalid={!!error}
                        onChange={onChange}
                    />
                </Field>
            );
        }

        return (
            <Field label={label} required={schema.required} error={error} name={schema.key}>
                <SelectField
                    value={value}
                    onChange={onChange}
                    invalid={!!error}
                    placeholder={t('req_select_placeholder')}
                    options={options.map((o) => ({ value: o.value, label: localLabel(o, lang) }))}
                />
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
                type={schema.input === 'number' ? 'number' : schema.input === 'email' ? 'email' : 'text'}
                autoComplete="off"
                inputMode={schema.input === 'email' ? 'email' : undefined}
                autoCapitalize={schema.input === 'email' ? 'none' : undefined}
                autoCorrect={schema.input === 'email' ? 'off' : undefined}
                spellCheck={schema.input === 'email' ? false : undefined}
                min={schema.min}
                max={schema.max}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={schema.placeholder}
                className={cn(error && 'border-destructive')}
            />
        </Field>
    );
}

type FieldWiring = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** Radix Select with Field's id and error wiring on the trigger (the Root renders no element). */
function SelectField({
    value,
    onChange,
    invalid,
    placeholder,
    options,
    ...wiring
}: FieldWiring & {
    value: string;
    onChange: (v: string) => void;
    invalid: boolean;
    placeholder: string;
    options: { value: string; label: string }[];
}) {
    return (
        <Select value={value || undefined} onValueChange={onChange}>
            <SelectTrigger {...wiring} className={cn('h-10 w-full', invalid && 'border-destructive')}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** Two fixed choices side by side, as a radio group (arrow keys move; pressing the chosen one clears an optional field). */
function ChoicePair({
    label,
    options,
    value,
    required,
    invalid,
    onChange,
    id,
    ...wiring
}: FieldWiring & {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    required?: boolean;
    invalid: boolean;
    onChange: (v: string) => void;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const current = options.findIndex((o) => o.value === value);

    const onKeyDown = (e: KeyboardEvent, i: number) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const next = (i + 1) % options.length;
        onChange(options[next].value);
        refs.current[next]?.focus();
    };

    return (
        <div role="radiogroup" aria-label={label} aria-required={required} {...wiring} className="grid grid-cols-2 gap-2">
            {options.map((o, i) => {
                const on = i === current;
                return (
                    <button
                        key={o.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        id={i === 0 ? id : undefined}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
                        onClick={() => onChange(on && !required ? '' : o.value)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={cn(
                            'h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
                            on
                                ? 'border-brand bg-brand/10 text-brand'
                                : invalid
                                  ? 'border-destructive hover:bg-accent/50'
                                  : 'border-input hover:bg-accent/50',
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
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
        return opt ? localLabel(opt, lang) : raw;
    }
    if (f.input === 'source') {
        return sources?.[f.source ?? '']?.find((o) => String(o.id) === raw)?.label ?? raw;
    }
    return raw;
}

function ReviewRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="odd:bg-muted/30 flex justify-between gap-4 px-4 py-2 text-sm">
            <span className="text-muted-foreground shrink-0 text-xs leading-6">{k}</span>
            <span className={'min-w-0 text-right font-semibold break-words'}>{v}</span>
        </div>
    );
}

// Service icon on a tint of its colour, at least 3:1 in both themes
function iconTile(color: string): CSSProperties {
    return {
        background: `${color}1f`,
        '--ink': readableInk(color, LIGHT_GROUND, 0x1f / 255, 3),
        '--ink-dark': readableInk(color, DARK_GROUND, 0x1f / 255, 3),
    } as CSSProperties;
}
