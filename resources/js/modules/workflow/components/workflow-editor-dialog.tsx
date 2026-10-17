import { useT } from '@/lang';
import { useDepartmentMembers, useDepartments } from '@/modules/employee';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { RecordStamps } from '@/shared/components/record-stamps';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { localName, localPair, nameSearch } from '@/shared/lib/local-name';
import { REQUEST_SKIP_REASON_LABEL, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { ServiceRequestType, Workflow, WorkflowActorType, WorkflowStep } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Flag, Loader2, Plus, Trash2, Users, Workflow as WorkflowIcon, X, Zap } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { workflowApi, type ResolvedPreviewRow, type WorkflowStepPayload } from '../api/workflowApi';
import { useWorkflowMutations } from '../hooks/use-workflows';

/** A step being edited — positions held as ids, which is what the API takes. */
type EditableStep = {
    actor_type: WorkflowStep['actor_type'];
    label: string;
    kind: WorkflowStep['kind'];
    position_ids: number[];
    /** True once somebody typed their own label; until then it follows the rule. */
    label_touched?: boolean;
    /** Department steps only: which department signs. */
    department_id: number | null;
    /** Department steps only: the people named (alternates), or empty to accept the positions. */
    approver_employee_ids: number[];
    /** Department step shape (people vs positions), held so it survives before a name is picked. */
    by_person?: boolean;
};

/** The steps as the API takes them: a department step sends only the "who signs" field of its shape. */
function toPayload(steps: EditableStep[]): WorkflowStepPayload[] {
    return steps.map((s) => {
        const byPerson = s.actor_type === 'department' && !!s.by_person;

        return {
            actor_type: s.actor_type,
            label: s.label,
            kind: s.kind,
            position_ids: byPerson ? [] : s.position_ids,
            department_id: s.actor_type === 'department' ? s.department_id : null,
            approver_employee_ids: byPerson ? s.approver_employee_ids : [],
        };
    });
}

/** Types whose Access resources carry an owner — the only ones an Owner step can serve. */
const OWNER_TYPES: ServiceRequestType[] = ['mailgroup', 'fileshare', 'recovery'];

/** Ready-made chain labels for the actor label input (stored as data, not i18n). */
const CHAIN_LABEL_PRESETS = ['Supervisor / Head', 'Manager / Asst. Manager', 'Department Manager', 'Vice President'];

/**
 * Editor for one workflow: the steps as a ladder of rungs, plus a "test with employee" preview.
 * Edits never touch in-flight requests (they run on their submit-time snapshot).
 */
export function WorkflowEditorDialog({ workflow, onClose }: { workflow: Workflow | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { update, preview } = useWorkflowMutations();

    const [shown, setShown] = useState<Workflow | null>(null);
    useEffect(() => {
        if (workflow) setShown(workflow);
    }, [workflow]);
    const wf = workflow ?? shown;

    const [name, setName] = useState('');
    const [nameErr, setNameErr] = useState('');
    const [active, setActive] = useState(true);
    const [autoTicket, setAutoTicket] = useState(true);
    const [steps, setSteps] = useState<EditableStep[]>([]);
    // Which step has its full position palette open (one at a time)
    const [openRanks, setOpenRanks] = useState<number | null>(null);
    const [serverError, setServerError] = useState('');
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');
    // Editable values as hydrated, for the unsaved-changes check.
    const [baseline, setBaseline] = useState('');

    // Hydrate from the opened workflow; everything transient resets here
    useEffect(() => {
        if (!workflow) return;
        setName(workflow.name);
        setNameErr('');
        setActive(workflow.active);
        setAutoTicket(workflow.auto_ticket);
        const hydrated: EditableStep[] = workflow.steps.map((s) => ({
            actor_type: s.actor_type,
            label_touched: true,
            department_id: s.department_id ?? null,
            approver_employee_ids: (s.approvers ?? []).map((a) => a.id),
            by_person: (s.approvers ?? []).length > 0,
            label: s.label,
            kind: s.kind,
            position_ids: s.positions.map((p) => p.id),
        }));
        setSteps(hydrated);
        setBaseline(JSON.stringify([workflow.name, workflow.active, workflow.auto_ticket, hydrated]));
        setServerError('');
        setSaveState('idle');
        setOpenRanks(null);
        setPreviewEmployee('');
        setPreviewRows(null);
    }, [workflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const updStep = (i: number, patch: Partial<EditableStep>) =>
        setSteps((list) => list.map((s, idx) => (idx === i ? withDerivedLabel({ ...s, ...patch }, positions, departments) : s)));

    const removeStep = (i: number) => {
        setOpenRanks(null);
        setSteps((list) => list.filter((_, idx) => idx !== i));
    };
    const moveStep = (i: number, dir: -1 | 1) => {
        setOpenRanks(null);
        setSteps((list) => {
            const j = i + dir;
            if (j < 0 || j >= list.length) return list;
            const next = [...list];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };
    const addStep = () =>
        setSteps((list) => [
            ...list,
            { actor_type: 'chain', label: '', kind: 'approval', position_ids: [], department_id: null, approver_employee_ids: [], by_person: false },
        ]);

    // Position titles, read through the workflows.manage gate
    const { data: positionData } = useQuery({
        queryKey: ['workflow-position-options'],
        queryFn: workflowApi.positionOptions,
        staleTime: 5 * 60_000,
        enabled: !!workflow,
    });
    const positions = positionData ?? [];
    const { data: departments = [] } = useDepartments();

    // ── "Test with employee" resolution preview ──────────────────────────────
    const { data: employees = [] } = useQuery({
        queryKey: ['workflow-employee-options'],
        queryFn: workflowApi.employeeOptions,
        staleTime: 5 * 60_000,
        enabled: !!workflow,
    });
    const employeeOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: String(e.id),
                label: localName(e, lang),
                sub: e.code,
                hint: [e.position, localPair(e.department, e.department_th, lang)].filter(Boolean).join(', ') || undefined,
                search: `${nameSearch(e)} ${e.code} ${e.position ?? ''} ${e.department ?? ''} ${e.department_th ?? ''}`,
            })),
        [employees, lang],
    );
    const [previewEmployee, setPreviewEmployee] = useState('');
    const [previewRows, setPreviewRows] = useState<ResolvedPreviewRow[] | null>(null);
    const [previewFailed, setPreviewFailed] = useState(false);
    const previewSeq = useRef(0);

    // Re-resolve (debounced) whenever the tested employee or the step list changes.
    useEffect(() => {
        const seq = ++previewSeq.current;
        if (!wf || !previewEmployee || steps.length === 0) {
            setPreviewRows(null);
            setPreviewFailed(false);
            return;
        }
        const timer = setTimeout(() => {
            preview
                .mutateAsync({ request_type: wf.request_type, employee_id: Number(previewEmployee), steps: toPayload(steps) })
                .then((res) => {
                    if (seq !== previewSeq.current) return;
                    setPreviewRows(res.rows);
                    setPreviewFailed(false);
                })
                .catch(() => {
                    if (seq !== previewSeq.current) return;
                    setPreviewRows(null);
                    setPreviewFailed(true);
                });
        }, 350);
        return () => clearTimeout(timer);
    }, [previewEmployee, steps, wf?.request_type]); // eslint-disable-line react-hooks/exhaustive-deps

    const isDirty = JSON.stringify([name, active, autoTicket, steps]) !== baseline;
    const guardClose = useDiscardGuard(!!workflow && isDirty && saveState !== 'done');

    if (!wf) return null;
    const ownerAllowed = OWNER_TYPES.includes(wf.request_type);
    const hasEmptyRung = steps.some((s) => s.actor_type === 'chain' && s.position_ids.length === 0);
    const approvalCount = steps.filter((s) => s.kind === 'approval').length;
    // A department step needs its department, then people or positions for its own shape
    const hasIncompleteDepartment = steps.some(
        (s) =>
            s.actor_type === 'department' &&
            (s.department_id === null || (s.by_person ? s.approver_employee_ids.length === 0 : s.position_ids.length === 0)),
    );

    const submit = async () => {
        setServerError('');
        if (!name.trim()) {
            setNameErr(t('wf_name_required'));
            focusFirstError({ name: 'required' });
            return;
        }
        if (isDirty && !(await confirmEdit({ name: wf.name, sub: t(REQUEST_TYPE_META[wf.request_type].labelKey) }))) return;
        try {
            await update.mutateAsync({
                id: wf.id,
                payload: { name: name.trim(), active, auto_ticket: autoTicket, steps: toPayload(steps) },
            });
            setSaveState('done');
            setTimeout(() => {
                setSaveState('idle');
                onClose();
            }, 700);
        } catch (e) {
            const resp = (e as { response?: { data?: { message?: string } } })?.response?.data;
            setServerError(resp?.message || t('wf_save_error_steps'));
        }
    };

    return (
        <Dialog open={!!workflow} onOpenChange={(o) => !o && !update.isPending && guardClose(onClose)}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={WorkflowIcon}
                    eyebrow={t('wf_editor_eyebrow')}
                    title={wf.name}
                    subtitle={<span className="text-muted-foreground text-xs">{t(REQUEST_TYPE_META[wf.request_type].labelKey)}</span>}
                    srDescription={t('wf_sub')}
                    headerRight={
                        wf.updated_by_name && (
                            <RecordStamps
                                className="text-right"
                                updatedAt={wf.updated_at}
                                updatedBy={wf.updated_by_name}
                                updatedByTh={wf.updated_by_name_th}
                            />
                        )
                    }
                />

                <div className="border-border/60 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    {/* Name + flags */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('wf_name')} name="name" required error={nameErr}>
                            <Input
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (nameErr) setNameErr('');
                                }}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <FlagCard label={t('wf_active')} on={active} onChange={setActive} icon={<Check className="h-4 w-4" />} />
                            <FlagCard
                                label={t('wf_auto_ticket')}
                                hint={t('wf_auto_ticket_hint')}
                                on={autoTicket}
                                onChange={setAutoTicket}
                                icon={<Zap className="h-4 w-4" />}
                            />
                        </div>
                    </div>

                    {/* The ladder — the last step carries a flag, not a number */}
                    <div>
                        <div className="mb-3 flex items-end justify-between gap-3">
                            <SectionLabel className="mb-0">
                                {t('wf_steps')}{' '}
                                <span className="text-muted-foreground text-xs">({t('wf_steps_count').replace('{n}', String(approvalCount))})</span>
                            </SectionLabel>
                            <Button variant="outline" size="sm" onClick={addStep}>
                                <Plus className="h-4 w-4" />
                                {t('wf_add_step')}
                            </Button>
                        </div>

                        <div className="ml-3 space-y-3 pl-5">
                            {steps.map((s, i) => {
                                const isEnd = s.actor_type === 'it_staff';
                                const chosen = positions.filter((p) => s.position_ids.includes(p.id));
                                return (
                                    <div key={i} className="relative">
                                        {/* Rail segment to the next rung */}
                                        {i < steps.length - 1 && (
                                            <span aria-hidden className="bg-border/70 absolute top-[30px] -bottom-[22px] left-[-18px] w-px" />
                                        )}
                                        {/* Rung marker on an opaque base */}
                                        <span className="bg-background absolute top-2 -left-[29px] h-[22px] w-[22px] rounded-full">
                                            <span
                                                className={cn(
                                                    'flex h-full w-full items-center justify-center rounded-full border-2 text-[11px] font-bold',
                                                    isEnd
                                                        ? 'border-brand/40 bg-brand/10 text-brand'
                                                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                                )}
                                            >
                                                {isEnd ? <Flag className="h-3 w-3" /> : i + 1}
                                            </span>
                                        </span>

                                        <div className="border-border hover:border-border rounded-xl border px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={s.actor_type}
                                                    onValueChange={(v) => {
                                                        const actor = v as WorkflowActorType;
                                                        updStep(i, {
                                                            actor_type: actor,
                                                            department_id: actor === 'department' ? s.department_id : null,
                                                            approver_employee_ids: actor === 'department' ? s.approver_employee_ids : [],
                                                            by_person: actor === 'department' ? s.by_person : false,
                                                            kind: actor === 'it_staff' ? 'completion' : 'approval',
                                                            label: actor === 'owner' ? 'Resource Owner' : actor === 'it_staff' ? 'IT Staff' : s.label,
                                                            position_ids: actor === 'chain' || actor === 'department' ? s.position_ids : [],
                                                        });
                                                    }}
                                                >
                                                    <SelectTrigger aria-label={t('wf_step_type')} className="h-9 w-[168px] shrink-0 font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="chain">{t('wf_actor_chain')}</SelectItem>
                                                        <SelectItem value="department">{t('wf_actor_department')}</SelectItem>
                                                        {ownerAllowed && <SelectItem value="owner">{t('wf_actor_owner')}</SelectItem>}
                                                        <SelectItem value="it_staff">{t('wf_actor_it')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <span className="flex-1" />
                                                <span className="text-muted-foreground shrink-0 text-[11px]">{t('wf_step_label')}</span>
                                                <Input
                                                    className="h-9 w-[190px] shrink-0 text-sm"
                                                    value={s.label}
                                                    onChange={(e) => updStep(i, { label: e.target.value, label_touched: true })}
                                                    list={s.actor_type === 'chain' ? 'wf-chain-labels' : undefined}
                                                    aria-label={t('wf_step_label')}
                                                />
                                                <div className="flex shrink-0 items-center">
                                                    <IconBtn
                                                        disabled={i === 0}
                                                        onClick={() => moveStep(i, -1)}
                                                        label={t('wf_step_move_up').replace('{n}', String(i + 1))}
                                                    >
                                                        <ArrowUp className="h-3.5 w-3.5" />
                                                    </IconBtn>
                                                    <IconBtn
                                                        disabled={i === steps.length - 1}
                                                        onClick={() => moveStep(i, 1)}
                                                        label={t('wf_step_move_down').replace('{n}', String(i + 1))}
                                                    >
                                                        <ArrowDown className="h-3.5 w-3.5" />
                                                    </IconBtn>
                                                    <IconBtn
                                                        onClick={() => removeStep(i)}
                                                        label={t('wf_step_remove').replace('{n}', String(i + 1))}
                                                        className="text-destructive/70 hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </IconBtn>
                                                </div>
                                            </div>

                                            {/* Who may sign this rung */}
                                            {s.actor_type === 'department' && (
                                                <DepartmentStepFields step={s} onChange={(patch) => updStep(i, patch)} t={t} />
                                            )}

                                            {(s.actor_type === 'chain' || (s.actor_type === 'department' && !s.by_person)) && (
                                                <div className="mt-2 border-t border-dashed pt-2">
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                                        <span className="text-muted-foreground text-xs">{t('wf_step_positions')}</span>
                                                        {chosen.map((p) => (
                                                            <span
                                                                key={p.id}
                                                                className="border-brand/30 bg-brand/5 text-brand rounded-full border px-2 py-0.5 text-xs font-medium"
                                                            >
                                                                {p.title}
                                                            </span>
                                                        ))}
                                                        {positions.length > 0 && chosen.length === 0 && (
                                                            <span className="text-destructive text-xs">{t('wf_step_positions_required')}</span>
                                                        )}
                                                        <span className="text-muted-foreground ml-auto text-[11px]">
                                                            {s.actor_type === 'chain'
                                                                ? t('wf_step_skip_note_chain')
                                                                : t('wf_step_skip_note_department')}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            aria-expanded={openRanks === i}
                                                            aria-controls={`wf-ranks-${i}`}
                                                            onClick={() => setOpenRanks(openRanks === i ? null : i)}
                                                            className="text-brand text-xs font-semibold hover:underline"
                                                        >
                                                            {openRanks === i ? t('wf_ranks_done') : t('wf_ranks_edit')}
                                                        </button>
                                                    </div>

                                                    {openRanks === i && (
                                                        <div
                                                            id={`wf-ranks-${i}`}
                                                            className="border-border/70 bg-muted/30 mt-2 rounded-lg border p-2.5"
                                                        >
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {positions.map((p) => {
                                                                    const on = s.position_ids.includes(p.id);
                                                                    return (
                                                                        <button
                                                                            key={p.id}
                                                                            type="button"
                                                                            aria-pressed={on}
                                                                            onClick={() =>
                                                                                updStep(i, {
                                                                                    position_ids: on
                                                                                        ? s.position_ids.filter((id) => id !== p.id)
                                                                                        : [...s.position_ids, p.id],
                                                                                })
                                                                            }
                                                                            className={cn(
                                                                                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                                                                on
                                                                                    ? 'border-brand bg-brand/10 text-brand'
                                                                                    : 'border-border text-muted-foreground hover:bg-accent/50',
                                                                            )}
                                                                        >
                                                                            {on && <Check className="h-3 w-3" />}
                                                                            {p.title}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <datalist id="wf-chain-labels">
                            {CHAIN_LABEL_PRESETS.map((l) => (
                                <option key={l} value={l} />
                            ))}
                        </datalist>
                    </div>

                    {/* Resolve against a real reporting line */}
                    <div className="border-brand/40 bg-brand/5 rounded-xl border px-4 py-4">
                        <div className="text-brand flex items-center gap-2 text-xs font-bold tracking-wide uppercase [&:lang(th)]:tracking-normal [&:lang(th)]:normal-case">
                            <Users className="h-4 w-4" />
                            {t('wf_resolve_title')}
                        </div>
                        <p className="text-foreground/65 dark:text-muted-foreground mt-1.5 mb-3 text-xs leading-relaxed">{t('wf_resolve_hint')}</p>
                        <div className="flex items-center gap-2.5">
                            <label htmlFor="wf-test-with" className="text-xs font-semibold whitespace-nowrap">
                                {t('wf_test_with')}
                            </label>
                            <div className="min-w-0 flex-1">
                                <SearchableSelect
                                    id="wf-test-with"
                                    value={previewEmployee}
                                    onChange={setPreviewEmployee}
                                    options={employeeOptions}
                                    clearable
                                />
                            </div>
                        </div>
                        <div aria-live="polite">
                            {preview.isPending && (
                                <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    {t('wf_preview_loading')}
                                </div>
                            )}
                            {previewFailed && !preview.isPending && <p className="text-destructive mt-3 text-xs">{t('wf_preview_error')}</p>}
                            {previewRows && !preview.isPending && (
                                <div className="bg-background mt-3 space-y-3 rounded-xl px-4 py-4">
                                    {previewRows.map((row, i) => (
                                        <ResolvedRow key={i} row={row} t={t} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center gap-3 border-t px-6 py-3.5">
                    {serverError && (
                        <div
                            key={serverError}
                            role="alert"
                            className="bg-destructive/10 dark:text-destructive animate-shake min-w-0 flex-1 rounded-lg px-3.5 py-2 text-sm text-red-700"
                        >
                            {serverError}
                        </div>
                    )}
                    <div className={cn('flex shrink-0 items-center gap-3', !serverError && 'ml-auto')}>
                        <Button variant="outline" onClick={() => guardClose(onClose)} disabled={update.isPending}>
                            {t('cancel')}
                        </Button>
                        {/* Disabled while a rung names no position (the API refuses it) */}
                        <SaveButton
                            onClick={submit}
                            loading={update.isPending}
                            success={saveState === 'done'}
                            disabled={saveState === 'done' || hasEmptyRung || hasIncompleteDepartment}
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** One resolved step of the preview timeline. */
function ResolvedRow({ row, t }: { row: ResolvedPreviewRow; t: (k: string) => string }) {
    const skipped = row.status === 'skipped';
    const queue = row.actor_type === 'it_staff';
    const owner = row.actor_type === 'owner' && row.approver_employee_id === null && !skipped;
    // A step open to several people lists them all
    const candidates = row.approver_candidates ?? [];
    return (
        <div className="flex items-start gap-3">
            <span
                className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    skipped && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                    queue && 'bg-brand/8 text-brand',
                    !skipped && !queue && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}
            >
                {row.position}
            </span>
            <div className="min-w-0">
                <div className="text-sm font-semibold">
                    {queue ? t('wf_actor_it') : (row.approver_name ?? (candidates.length > 0 ? candidates.join(', ') : row.label))}
                </div>
                <div className="text-muted-foreground text-xs">
                    {skipped
                        ? row.skip_reason
                            ? t(REQUEST_SKIP_REASON_LABEL[row.skip_reason])
                            : t('wf_skipped')
                        : queue
                          ? t('wf_queue_preview')
                          : owner
                            ? t('wf_owner_preview')
                            : candidates.length > 0
                              ? t('wf_any_of_preview')
                              : row.approver_position || row.label}
                </div>
                {/* Merged steps (covered_steps) */}
                {!skipped && !queue && row.approver_name && (row.covered_steps ?? 1) > 1 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        <span className="bg-muted text-foreground/65 dark:text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                            {t('wf_covers')}: {row.label}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function FlagCard({
    label,
    hint,
    on,
    onChange,
    icon,
}: {
    label: string;
    hint?: string;
    on: boolean;
    onChange: (v: boolean) => void;
    icon: React.ReactNode;
}) {
    return (
        <div className="border-border flex items-center gap-2.5 rounded-xl border px-3 py-2.5">
            <span className={cn('shrink-0', on ? 'text-brand' : 'text-muted-foreground')}>{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{label}</div>
                {hint && <div className="text-muted-foreground truncate text-[11px]">{hint}</div>}
            </div>
            <Switch checked={on} onChange={onChange} aria-label={label} />
        </div>
    );
}

/** The department half of a department step: which department, then named people or its positions. */
function DepartmentStepFields({
    step,
    onChange,
    t,
}: {
    step: EditableStep;
    onChange: (patch: Partial<EditableStep>) => void;
    t: (key: string) => string;
}) {
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: members = [] } = useDepartmentMembers(step.department_id);
    const byPerson = !!step.by_person;
    const named = step.approver_employee_ids.map((id) => members.find((m) => m.id === id)).filter((m): m is (typeof members)[number] => !!m);
    // Only active people can be added (the resolver drops leavers)
    const addable = members.filter((m) => m.status === 'active' && !step.approver_employee_ids.includes(m.id));
    const uid = useId();

    return (
        <div className="mt-2 space-y-2 border-t border-dashed pt-2">
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${uid}-dept`} className="text-muted-foreground shrink-0 text-xs">
                    {t('wf_step_department')}
                </label>
                <span className="inline-block w-56">
                    <SearchableSelect
                        id={`${uid}-dept`}
                        value={step.department_id === null ? '' : String(step.department_id)}
                        // A new department drops the people named in the old one
                        onChange={(v) => onChange({ department_id: v ? Number(v) : null, approver_employee_ids: [] })}
                        options={departments.map((d) => ({ value: String(d.id), label: localName(d, lang), search: nameSearch(d) }))}
                        placeholder={t('wf_step_department_pick')}
                    />
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground shrink-0 text-xs">{t('wf_step_who')}</span>
                <button
                    type="button"
                    aria-pressed={!byPerson}
                    onClick={() => onChange({ by_person: false })}
                    className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        byPerson ? 'border-border text-muted-foreground hover:bg-accent/50' : 'border-brand bg-brand/10 text-brand',
                    )}
                >
                    {t('wf_step_by_positions')}
                </button>
                <button
                    type="button"
                    aria-pressed={byPerson}
                    disabled={step.department_id === null}
                    onClick={() => onChange({ by_person: true })}
                    className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                        byPerson ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-accent/50',
                    )}
                >
                    {t('wf_step_by_person')}
                </button>
            </div>

            {/* The people named, as removable chips */}
            {byPerson && (
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    {named.map((m) => (
                        <span
                            key={m.id}
                            className="border-brand/30 bg-brand/5 text-brand flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                        >
                            {localName(m, lang)}
                            <button
                                type="button"
                                aria-label={`${t('wf_step_person_remove')} ${localName(m, lang)}`}
                                onClick={() => onChange({ approver_employee_ids: step.approver_employee_ids.filter((id) => id !== m.id) })}
                                className="hover:text-destructive"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                    {/* No picker for an empty department */}
                    {members.length > 0 && (
                        <span className="inline-block w-56">
                            <label htmlFor={`${uid}-person`} className="sr-only">
                                {t('wf_step_person_add')}
                            </label>
                            <SearchableSelect
                                id={`${uid}-person`}
                                value=""
                                onChange={(v) => {
                                    const id = Number(v);
                                    if (!v || step.approver_employee_ids.includes(id)) return;
                                    onChange({ approver_employee_ids: [...step.approver_employee_ids, id] });
                                }}
                                options={addable.map((m) => ({
                                    value: String(m.id),
                                    label: localName(m, lang),
                                    sub: m.position ?? undefined,
                                    search: nameSearch(m),
                                }))}
                                placeholder={t('wf_step_person_add')}
                            />
                        </span>
                    )}
                    {named.length > 0 && <span className="text-muted-foreground text-[11px]">{t('wf_step_people_note')}</span>}
                </div>
            )}

            {step.department_id === null && <p className="text-destructive text-xs">{t('wf_step_department_required')}</p>}
            {/* An empty department is a different gap from "no person chosen" */}
            {byPerson && step.department_id !== null && members.length === 0 && (
                <p className="text-destructive text-xs">{t('wf_step_department_empty')}</p>
            )}
            {byPerson && step.approver_employee_ids.length === 0 && members.length > 0 && (
                <p className="text-destructive text-xs">{t('wf_step_person_required')}</p>
            )}
        </div>
    );
}

/** A step's label until somebody writes one: it reads back the rule underneath it. */
function withDerivedLabel(step: EditableStep, positions: { id: number; title: string }[], departments: { id: number; name: string }[]): EditableStep {
    if (step.label_touched) {
        return step;
    }

    // A step naming people reads back as its department alone
    const titles = step.by_person ? [] : positions.filter((p) => step.position_ids.includes(p.id)).map((p) => p.title);
    const department = departments.find((d) => d.id === step.department_id)?.name;

    const label =
        step.actor_type === 'it_staff'
            ? 'IT Staff'
            : step.actor_type === 'owner'
              ? 'Resource Owner'
              : step.actor_type === 'department'
                ? [department, titles.join(' / ')].filter(Boolean).join(': ')
                : titles.join(' / ');

    return { ...step, label };
}

function IconBtn({
    children,
    onClick,
    disabled,
    label,
    className,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    label: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
                className,
            )}
        >
            {children}
        </button>
    );
}
