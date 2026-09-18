import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { formatDateTime as fmtTz } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketWorkClass } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { AlertTriangle, ArrowRight, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_WORK_CLASS_META } from './ticket-meta';

const WORK_CLASSES: TicketWorkClass[] = ['standard', 'repair_internal', 'repair_vendor'];

/**
 * The assignee writes a progress note on a case in flight — and, in the same breath, says who
 * the repair went to.
 *
 * Handing a repair to an in-house or an external technician IS a progress update; it used to
 * live in a dialog of its own, which meant one action produced two timeline entries and asked
 * for the reason twice. The note is the reason.
 *
 * A note alone never moves the case: it stays In progress and its SLA clock keeps running.
 * Changing the kind of work does move the deadline (App\Support\TicketSla::targetFor), which is
 * why the before -> after bar below exists — it hands the case-holder power over their own
 * deadline back, the same power a paused-clock feature gave and then lost (2026-09-13). What
 * makes this different: every number is pre-approved by a super admin in Settings, a reason is
 * mandatory, and the technician has to look at what they are about to grant themselves.
 *
 * The "after" deadline is never computed here — it comes from `ticket.work_class_forecast`,
 * which runs the SAME TicketSla calculation the server uses to write the real one. A technician
 * holds no settings.sla permission and so has no rules to compute from; a guess would defeat
 * the point of showing it.
 */
export function TicketUpdateModal({
    ticket,
    canSetWorkClass = false,
    onClose,
}: {
    ticket: Ticket | null;
    /** tickets.set_work_class — without it the picker is not offered at all. */
    canSetWorkClass?: boolean;
    onClose: () => void;
}) {
    const t = useT();
    const { addUpdate } = useTicketMutations();
    const [body, setBody] = useState('');
    const [err, setErr] = useState('');
    const [formError, setFormError] = useState('');
    const [workClass, setWorkClass] = useState<TicketWorkClass>('standard');

    const open = !!ticket;
    // Retain a "shown" copy so the content doesn't blank during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    useEffect(() => {
        if (ticket) {
            setBody('');
            setErr('');
            setFormError('');
            setWorkClass(ticket.work_class ?? 'standard');
        }
    }, [ticket]);

    const currentClass = view?.work_class ?? 'standard';
    // Kind of work is for a case somebody reported that then has to go to a technician. A case
    // opened from a request already carries a target decided by what was asked for, and the
    // endpoint refuses the field on one — so the picker is not offered there at all.
    const fromRequest = !!view?.from_request;
    const offersWorkClass = canSetWorkClass && !fromRequest;
    const reclassifying = offersWorkClass && workClass !== currentClass;

    // "Field absent" and "this class has no dedicated rule" are different answers, and folding
    // the two into one message would let a case with genuinely UNKNOWN numbers read as one where
    // nothing changes, when confirming could move the deadline by weeks. When we cannot show
    // what is about to happen, we say so and the confirm button goes away.
    const forecastAvailable = view?.work_class_forecast != null;
    const forecast = forecastAvailable ? (view!.work_class_forecast!.find((f) => f.work_class === workClass) ?? null) : null;
    // The "after" figure is always forecast.due_at — the number TicketSla computed for this
    // class, whatever scope won it. Scope alone is not proof the deadline stays put, so the
    // "won't move" note only appears when the two dates actually agree.
    const currentDueAt = view?.sla?.resolve_due_at ?? null;
    const dueUnchanged = forecast !== null && currentDueAt !== null && new Date(forecast.due_at).getTime() === new Date(currentDueAt).getTime();

    const options = WORK_CLASSES.map((c) => ({ value: c, label: t(TICKET_WORK_CLASS_META[c].key), search: t(TICKET_WORK_CLASS_META[c].key) }));

    const submit = async () => {
        if (!ticket) return;
        if (body.trim().length < 5) {
            setErr(t('ticket_update_too_short'));
            return;
        }
        // Never let a reclassification through blind: if the forecast is missing we cannot show
        // what the deadline becomes, so the change is refused rather than guessed at.
        if (reclassifying && !forecastAvailable) return;
        setFormError('');
        try {
            await addUpdate.mutateAsync({
                id: ticket.id,
                body: body.trim(),
                // Sent only when it actually changes — otherwise this is an ordinary note and
                // the server writes one timeline entry without touching the deadline.
                ...(reclassifying ? { work_class: workClass } : {}),
            });
            onClose();
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
            setFormError(data?.message ?? t('ticket_update_err_failed'));
        }
    };

    const saving = addUpdate.isPending;
    const blocked = reclassifying && !forecastAvailable;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={MessageSquarePlus}
                    eyebrow="Progress"
                    title={t('ticket_update_title')}
                    code={view?.ticket_no}
                    srDescription={t('ticket_update_title')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    {formError && (
                        <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm">
                            {formError}
                        </div>
                    )}

                    <p className="text-muted-foreground text-sm">{t('ticket_update_hint')}</p>

                    <Field label={t('ticket_update_body')} required error={err}>
                        <Textarea
                            value={body}
                            onChange={(e) => {
                                setBody(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            className={cn(err && 'border-destructive')}
                            placeholder={t('ticket_update_placeholder')}
                        />
                    </Field>

                    {offersWorkClass && (
                        <Field label={t('ticket_work_class')} help={t('ticket_work_class_hint')}>
                            <SearchableSelect value={workClass} onChange={(v) => setWorkClass(v as TicketWorkClass)} options={options} />
                        </Field>
                    )}

                    {/* The guard rail, and only when something is actually about to change: what
                        the technician is granting themselves, spelled out before they confirm it. */}
                    {reclassifying &&
                        (forecastAvailable ? (
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
                                        <div className="truncate font-mono text-[13px] font-semibold">{forecast ? fmtTz(forecast.due_at) : '—'}</div>
                                        {dueUnchanged && (
                                            <div className="text-muted-foreground text-[11px] leading-snug">{t('ticket_work_class_no_rule')}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{t('ticket_work_class_forecast_unavailable')}</span>
                            </div>
                        ))}
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={saving || blocked}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('ticket_update_save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
