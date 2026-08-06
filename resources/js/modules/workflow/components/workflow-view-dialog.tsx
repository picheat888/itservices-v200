import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { Workflow } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Pencil, Workflow as WorkflowIcon, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WorkflowStrip } from './workflow-strip';

/**
 * Read-only focus dialog for one workflow: route strip, per-step detail and
 * the auto-ticket behavior — with a shortcut into the editor.
 */
export function WorkflowViewDialog({ workflow, onClose, onEdit }: { workflow: Workflow | null; onClose: () => void; onEdit: (w: Workflow) => void }) {
    const t = useT();

    // Keep the last shown workflow so content doesn't blank during the exit animation.
    const [shown, setShown] = useState<Workflow | null>(null);
    useEffect(() => {
        if (workflow) setShown(workflow);
    }, [workflow]);
    const wf = workflow ?? shown;
    if (!wf) return null;

    const approvals = wf.steps.filter((s) => s.kind === 'approval').length;

    return (
        <Dialog open={!!workflow} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex max-h-[min(860px,calc(100vh-72px))] max-w-[760px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={WorkflowIcon}
                    eyebrow={t(REQUEST_TYPE_META[wf.request_type].labelKey)}
                    title={wf.name}
                    srDescription={t('wf_sub')}
                    headerRight={
                        <>
                            <StatusBadge tone={wf.active ? 'green' : 'gray'}>{wf.active ? t('wf_active') : t('wf_inactive')}</StatusBadge>
                            {wf.auto_ticket && (
                                <StatusBadge tone="blue" dot={false}>
                                    <Zap className="h-3 w-3" />
                                    {t('wf_auto_ticket')}
                                </StatusBadge>
                            )}
                        </>
                    }
                />

                <div className="border-border/60 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <InfoCell label={t('wf_applies_to')} value={t(REQUEST_TYPE_META[wf.request_type].labelKey)} />
                        <InfoCell
                            label={t('wf_steps')}
                            value={`${approvals} ${t(approvals === 1 ? 'req_catalog_approval_one' : 'req_catalog_approval_many')} + ${t('wf_fulfillment')}`}
                        />
                        {/* Measured, not configured — and absent rather than zero when this
                            route decided nothing inside the window. */}
                        <InfoCell
                            label={t('wf_row_decision')}
                            value={wf.measured ? `${wf.measured.avg_days}${t('wf_days_suffix')} (${wf.measured.requests})` : '—'}
                            mono
                        />
                    </div>

                    <div>
                        <SectionLabel>{t('wf_chain_title')}</SectionLabel>
                        <div className="bg-muted/30 rounded-xl px-4 py-4">
                            <WorkflowStrip steps={wf.steps} />
                        </div>
                    </div>

                    <div>
                        <SectionLabel>{t('wf_step_detail')}</SectionLabel>
                        <div className="space-y-2">
                            {wf.steps.map((s, i) => (
                                <div key={i} className="border-border flex items-center gap-3 rounded-xl border px-3.5 py-2.5">
                                    <span
                                        className={cn(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold',
                                            s.kind === 'fulfillment'
                                                ? 'bg-brand/10 text-brand'
                                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                        )}
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold">{s.label}</div>
                                        <div className="text-muted-foreground text-xs">
                                            {s.kind === 'fulfillment' ? t('wf_fulfillment') : t('wf_approval')}
                                        </div>
                                        {/* The titles this rung accepts — what resolution matches on. */}
                                        {s.positions.length > 0 && (
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                                {s.positions.map((p) => (
                                                    <span key={p.id} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
                                                        {p.title}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {wf.auto_ticket && (
                        <div className="border-border text-muted-foreground flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-xs">
                            <Zap className="text-brand h-4 w-4 shrink-0" />
                            {t('wf_auto_ticket_footnote')}
                        </div>
                    )}
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center justify-end gap-3 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                    <Button onClick={() => onEdit(wf)}>
                        <Pencil className="h-4 w-4" />
                        {t('wf_edit')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</div>
            <div className={cn('mt-0.5 text-sm font-semibold', mono && 'font-mono')}>{value}</div>
        </div>
    );
}
