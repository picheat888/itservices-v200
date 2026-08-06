import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequestType, Workflow, WorkflowActorType, WorkflowStep } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, Users, Workflow as WorkflowIcon, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { workflowApi, type ResolvedPreviewRow } from '../api/workflowApi';
import { useWorkflowMutations } from '../hooks/use-workflows';
import { WorkflowStrip } from './workflow-strip';

type EditableStep = Omit<WorkflowStep, 'id' | 'position'>;

/** Types whose Access resources carry an owner — the only ones an Owner step can serve. */
const OWNER_TYPES: ServiceRequestType[] = ['mailgroup', 'fileshare', 'recovery'];

/** Ready-made chain labels for the actor label input (stored as data, not i18n). */
const CHAIN_LABEL_PRESETS = ['Supervisor / Head', 'Manager / Asst. Manager', 'Department Manager', 'Vice President'];

/**
 * Focus-dialog editor for one workflow: flags, the ordered step list, a live
 * route strip, and a "test with employee" panel that resolves the edited steps
 * along a real reporting line. Edits never touch in-flight requests — they run
 * on their submit-time snapshot.
 */
export function WorkflowEditorDialog({ workflow, onClose }: { workflow: Workflow | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { update, preview } = useWorkflowMutations();

    const [shown, setShown] = useState<Workflow | null>(null);
    useEffect(() => {
        if (workflow) setShown(workflow);
    }, [workflow]);
    const wf = workflow ?? shown;

    const [name, setName] = useState('');
    const [active, setActive] = useState(true);
    const [autoTicket, setAutoTicket] = useState(true);
    const [steps, setSteps] = useState<EditableStep[]>([]);
    const [serverError, setServerError] = useState('');
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');

    // Hydrate from the opened workflow.
    useEffect(() => {
        if (!workflow) return;
        setName(workflow.name);
        setActive(workflow.active);
        setAutoTicket(workflow.auto_ticket);
        setSteps(workflow.steps.map((s) => ({ actor_type: s.actor_type, label: s.label, kind: s.kind })));
        setServerError('');
        setSaveState('idle');
        setPreviewEmployee('');
        setPreviewRows(null);
    }, [workflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const updStep = (i: number, patch: Partial<EditableStep>) => setSteps((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    const removeStep = (i: number) => setSteps((list) => list.filter((_, idx) => idx !== i));
    const moveStep = (i: number, dir: -1 | 1) =>
        setSteps((list) => {
            const j = i + dir;
            if (j < 0 || j >= list.length) return list;
            const next = [...list];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    const addStep = () => setSteps((list) => [...list, { actor_type: 'chain', label: 'Department Manager', kind: 'approval' }]);

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
                label: e.name,
                sub: e.code,
                hint: [e.position, e.department].filter(Boolean).join(' · ') || undefined,
                search: `${e.name} ${e.code} ${e.position ?? ''} ${e.department ?? ''}`,
            })),
        [employees],
    );
    const [previewEmployee, setPreviewEmployee] = useState('');
    const [previewRows, setPreviewRows] = useState<ResolvedPreviewRow[] | null>(null);

    // Re-resolve (debounced) whenever the tested employee or the step list changes.
    useEffect(() => {
        if (!wf || !previewEmployee || steps.length === 0) {
            setPreviewRows(null);
            return;
        }
        const timer = setTimeout(() => {
            preview
                .mutateAsync({ request_type: wf.request_type, employee_id: Number(previewEmployee), steps })
                .then((res) => setPreviewRows(res.rows))
                .catch(() => setPreviewRows(null));
        }, 350);
        return () => clearTimeout(timer);
    }, [previewEmployee, steps, wf?.request_type]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!wf) return null;
    const ownerAllowed = OWNER_TYPES.includes(wf.request_type);

    const submit = async () => {
        setServerError('');
        try {
            await update.mutateAsync({ id: wf.id, payload: { name: name.trim() || wf.name, active, auto_ticket: autoTicket, steps } });
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
        <Dialog open={!!workflow} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={WorkflowIcon}
                    eyebrow={t('wf_editor_eyebrow')}
                    title={wf.name}
                    subtitle={<span className="text-muted-foreground text-xs">{t(REQUEST_TYPE_META[wf.request_type].labelKey)}</span>}
                    srDescription={t('wf_sub')}
                />

                <div className="border-border/60 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    {/* Name + flags */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('wf_step_label')} name="name">
                            <Input value={name} onChange={(e) => setName(e.target.value)} />
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

                    {/* Step list */}
                    <div>
                        <SectionLabel>
                            {t('wf_steps')} <span className="text-muted-foreground font-mono text-xs">· {steps.length}</span>
                        </SectionLabel>
                        <div className="space-y-2">
                            {steps.map((s, i) => (
                                <div key={i} className="border-border flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
                                    <span
                                        className={cn(
                                            'mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold',
                                            s.kind === 'fulfillment'
                                                ? 'bg-brand/10 text-brand'
                                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                        )}
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1.1fr_1.4fr_1fr]">
                                        <Select
                                            value={s.actor_type}
                                            onValueChange={(v) => {
                                                const actor = v as WorkflowActorType;
                                                updStep(i, {
                                                    actor_type: actor,
                                                    // Sensible companions: IT staff fulfills; people approve.
                                                    kind: actor === 'it_staff' ? 'fulfillment' : 'approval',
                                                    label: actor === 'owner' ? 'Resource Owner' : actor === 'it_staff' ? 'IT Staff' : s.label,
                                                });
                                            }}
                                        >
                                            <SelectTrigger className="h-9 font-medium">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="chain">{t('wf_actor_chain')}</SelectItem>
                                                {ownerAllowed && <SelectItem value="owner">{t('wf_actor_owner')}</SelectItem>}
                                                <SelectItem value="it_staff">{t('wf_actor_it')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <div>
                                            <Input
                                                className="h-9 text-sm"
                                                value={s.label}
                                                onChange={(e) => updStep(i, { label: e.target.value })}
                                                list={s.actor_type === 'chain' ? 'wf-chain-labels' : undefined}
                                            />
                                        </div>
                                        <Select value={s.kind} onValueChange={(v) => updStep(i, { kind: v as EditableStep['kind'] })}>
                                            <SelectTrigger className="h-9 font-medium">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="approval">{t('wf_approval')}</SelectItem>
                                                <SelectItem value="fulfillment">{t('wf_fulfillment')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-0.5">
                                        <IconBtn disabled={i === 0} onClick={() => moveStep(i, -1)} label="up">
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        <IconBtn disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} label="down">
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </IconBtn>
                                    </div>
                                    <IconBtn
                                        onClick={() => removeStep(i)}
                                        label="remove"
                                        className="text-destructive/70 hover:text-destructive mt-1.5"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </IconBtn>
                                </div>
                            ))}
                        </div>
                        <datalist id="wf-chain-labels">
                            {CHAIN_LABEL_PRESETS.map((l) => (
                                <option key={l} value={l} />
                            ))}
                        </datalist>
                        <Button variant="outline" size="sm" className="mt-3" onClick={addStep}>
                            <Plus className="h-4 w-4" />
                            {t('wf_add_step')}
                        </Button>
                    </div>

                    {/* Live route preview */}
                    <div>
                        <SectionLabel>{t('wf_preview_title')}</SectionLabel>
                        <div className="bg-muted/30 rounded-xl px-4 py-4">
                            <WorkflowStrip steps={steps} />
                        </div>
                    </div>

                    {/* Resolve against a real reporting line */}
                    <div className="border-brand/40 bg-brand/5 rounded-xl border px-4 py-4">
                        <div className="text-brand flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
                            <Users className="h-4 w-4" />
                            {t('wf_resolve_title')}
                        </div>
                        <p className="text-muted-foreground mt-1.5 mb-3 text-xs leading-relaxed">{t('wf_resolve_hint')}</p>
                        <div className="flex items-center gap-2.5">
                            <span className="text-xs font-semibold whitespace-nowrap">{t('wf_test_with')}</span>
                            <div className="min-w-0 flex-1">
                                <SearchableSelect value={previewEmployee} onChange={setPreviewEmployee} options={employeeOptions} clearable />
                            </div>
                        </div>
                        {preview.isPending && (
                            <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />…
                            </div>
                        )}
                        {previewRows && !preview.isPending && (
                            <div className="bg-background mt-3 space-y-3 rounded-xl px-4 py-4">
                                {previewRows.map((row, i) => (
                                    <ResolvedRow key={i} row={row} t={t} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center gap-3 border-t px-6 py-3.5">
                    {serverError && <p className="text-destructive min-w-0 flex-1 truncate text-xs">{serverError}</p>}
                    <div className={cn('flex items-center gap-3', !serverError && 'ml-auto')}>
                        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={submit} disabled={update.isPending || saveState === 'done'}>
                            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {saveState === 'done' ? (lang === 'th' ? 'บันทึกแล้ว' : 'Saved!') : t('save')}
                        </Button>
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
    return (
        <div className="flex items-start gap-3">
            <span
                className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    skipped && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    queue && 'bg-brand/10 text-brand',
                    !skipped && !queue && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}
            >
                {row.position}
            </span>
            <div className="min-w-0">
                <div className="text-sm font-semibold">{queue ? t('wf_actor_it') : (row.approver_name ?? row.label)}</div>
                <div className="text-muted-foreground text-xs">
                    {skipped
                        ? `${t('wf_skipped')} — ${row.note ?? ''}`
                        : queue
                          ? t('wf_queue_preview')
                          : owner
                            ? t('wf_owner_preview')
                            : row.approver_position || row.label}
                </div>
                {!skipped && !queue && row.approver_name && row.label.includes(' · ') && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
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
            <Switch checked={on} onChange={onChange} />
        </div>
    );
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
