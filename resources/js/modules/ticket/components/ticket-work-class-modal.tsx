import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { formatDateTime as fmtTz } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketWorkClass } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { ArrowRight, Loader2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_WORK_CLASS_META } from './ticket-meta';

const WORK_CLASSES: TicketWorkClass[] = ['standard', 'repair_internal', 'repair_vendor'];

/**
 * The assignee classifies a case's kind of work — the SLA deadline follows it (see
 * App\Support\TicketSla::targetFor). This hands the case-holder power over their own deadline
 * back, the same power a paused-clock feature gave and then lost (2026-09-13), because a
 * decision about a target belongs to whoever owns the target, not whoever happens to be holding
 * the case. What makes this different: every number here is pre-approved by a super admin
 * (Settings -> SLA), a reason is mandatory, and the before -> after deadline bar below makes the
 * technician look at what they are about to grant themselves before they can confirm it.
 *
 * The "after" deadline is never computed here — it comes straight from
 * `ticket.work_class_forecast` (TicketResource), which runs the SAME TicketSla calculation the
 * server uses to set the real deadline. A technician holds no settings.sla permission, so this
 * dialog has no rules to compute from even if it tried; showing a guess would defeat the point
 * of the guard rail.
 */
export function TicketWorkClassModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { setWorkClass } = useTicketMutations();
    const [workClass, setWorkClassValue] = useState<TicketWorkClass>('standard');
    const [reason, setReason] = useState('');
    const [reasonErr, setReasonErr] = useState('');
    // Catch-all for a rejected save that belongs to no single field — the shake banner other
    // ticket dialogs use so a 403/422 doesn't leave the dialog looking idle.
    const [formError, setFormError] = useState('');

    const open = !!ticket;
    // Retain a "shown" copy so the content doesn't blank during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    useEffect(() => {
        if (ticket) {
            setWorkClassValue(ticket.work_class ?? 'standard');
            setReason('');
            setReasonErr('');
            setFormError('');
        }
    }, [ticket]);

    const options: SearchOption[] = WORK_CLASSES.map((c) => {
        const label = t(TICKET_WORK_CLASS_META[c].key);
        return { value: c, label, search: label };
    });

    const forecast = view?.work_class_forecast?.find((f) => f.work_class === workClass) ?? null;
    // A dedicated target only exists when the chosen class itself won the precedence race
    // (scope === 'work_class'). Anything else means this classification falls through to
    // priority/request type/the built-in default — picking it will NOT move the deadline, and
    // that has to be said outright rather than implied by quietly repeating today's number.
    // Standard is the one class that is honestly never "no rule": reverting to it IS the point.
    const hasDedicatedTarget = workClass === 'standard' || forecast?.scope === 'work_class';

    const submit = async () => {
        if (reason.trim().length < 5) {
            setReasonErr(t('ticket_update_too_short'));
            return;
        }
        if (!ticket) return;
        setFormError('');
        try {
            await setWorkClass.mutateAsync({ id: ticket.id, work_class: workClass, reason: reason.trim() });
            onClose();
        } catch (err: unknown) {
            const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
            setFormError(data?.message ?? t('ticket_work_class_change'));
        }
    };

    const saving = setWorkClass.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={Wrench}
                    eyebrow="Work class"
                    title={t('ticket_work_class_change')}
                    code={view?.ticket_no}
                    srDescription={t('ticket_work_class_change')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    {formError && (
                        <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm">
                            {formError}
                        </div>
                    )}

                    <Field label={t('ticket_work_class')} required>
                        <SearchableSelect value={workClass} onChange={(v) => setWorkClassValue(v as TicketWorkClass)} options={options} />
                    </Field>

                    <Field label={t('ticket_work_class_reason')} required error={reasonErr} help={t('ticket_work_class_reason_hint')}>
                        <Textarea
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                setReasonErr('');
                            }}
                            rows={4}
                            className={cn(reasonErr && 'border-destructive')}
                        />
                    </Field>

                    {/* The guard rail: what the technician is about to grant themselves, spelled
                        out before they can confirm it. */}
                    <div className="bg-muted/40 border-border/60 rounded-lg border px-3.5 py-3">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="min-w-0">
                                <div className="text-muted-foreground text-xs">{t('ticket_work_class_deadline_from')}</div>
                                <div className="truncate font-mono text-[13px] font-medium">
                                    {view?.sla ? fmtTz(view.sla.resolve_due_at) : '—'}
                                </div>
                            </div>
                            <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                            <div className="min-w-0 text-right">
                                <div className="text-muted-foreground text-xs">{t('ticket_work_class_deadline_to')}</div>
                                {hasDedicatedTarget && forecast ? (
                                    <div className="truncate font-mono text-[13px] font-semibold">{fmtTz(forecast.due_at)}</div>
                                ) : (
                                    <div className="text-muted-foreground text-xs leading-snug">{t('ticket_work_class_no_rule')}</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                        {t('ticket_work_class_change')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
