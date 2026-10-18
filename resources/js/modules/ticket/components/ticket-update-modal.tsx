import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketWorkClass } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { AlertTriangle, ArrowRight, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_WORK_CLASS_META } from './ticket-meta';

// The assignee posts a progress note and, on a reported case, may send the repair to a technician.
// The new deadline comes from ticket.work_class_forecast (server TicketSla), never computed here.
export function TicketUpdateModal({
    ticket,
    canSetWorkClass = false,
    onClose,
}: {
    ticket: Ticket | null;
    /** tickets.set_work_class */
    canSetWorkClass?: boolean;
    onClose: () => void;
}) {
    const fmt = useDateFormat();
    const t = useT();
    const { addUpdate } = useTicketMutations();
    const [body, setBody] = useState('');
    const [err, setErr] = useState('');
    const [formError, setFormError] = useState('');
    const [workClass, setWorkClass] = useState<TicketWorkClass>('standard');

    const open = !!ticket;
    // Retained copy so the content doesn't blank during the exit animation
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
    // A request-born case already has its target; the endpoint refuses the field there
    const fromRequest = !!view?.from_request;
    const offersWorkClass = canSetWorkClass && !fromRequest;
    const reclassifying = offersWorkClass && workClass !== currentClass;

    // Missing forecast is not "no change": the confirm is blocked rather than guessed
    const forecastAvailable = view?.work_class_forecast != null;
    const forecast = forecastAvailable ? (view!.work_class_forecast!.find((f) => f.work_class === workClass) ?? null) : null;
    const currentDueAt = view?.sla?.resolve_due_at ?? null;
    const dueUnchanged = forecast !== null && currentDueAt !== null && new Date(forecast.due_at).getTime() === new Date(currentDueAt).getTime();

    // Only the classes an administrator has priced for this case; Standard is the unticked box
    const options = (view?.work_class_forecast ?? [])
        .filter((f) => f.work_class !== 'standard')
        .map((f) => ({
            value: f.work_class,
            label: t(TICKET_WORK_CLASS_META[f.work_class].key),
            search: t(TICKET_WORK_CLASS_META[f.work_class].key),
        }));
    // A case already with a technician keeps the box so it can be set back to Standard
    const showsWorkClass = offersWorkClass && (options.length > 0 || currentClass !== 'standard');
    const sendingToTechnician = workClass !== 'standard';
    // Re-ticking returns to the case's own class before offering the first priced one
    const tickedClass: TicketWorkClass = currentClass !== 'standard' ? currentClass : (options[0]?.value ?? 'standard');

    const submit = async () => {
        if (!ticket) return;
        if (body.trim().length < 5) {
            setErr(t('ticket_update_too_short'));
            return;
        }
        if (reclassifying && !forecastAvailable) return;
        setFormError('');
        try {
            await addUpdate.mutateAsync({
                id: ticket.id,
                body: body.trim(),
                // Sent only on a change; otherwise this is an ordinary note
                ...(reclassifying ? { work_class: workClass } : {}),
            });
            onClose();
        } catch (e: unknown) {
            setFormError(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const saving = addUpdate.isPending;
    const blocked = reclassifying && !forecastAvailable;
    const isDirty = body.trim() !== '' || reclassifying;
    const guardClose = useDiscardGuard(open && isDirty);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !saving && guardClose(onClose)}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={MessageSquarePlus}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_update_title')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    srDescription={t('ticket_update_title')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    {formError && (
                        <div
                            key={formError}
                            className="bg-destructive/10 dark:text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm text-red-700"
                        >
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
                            maxLength={5000}
                            className={cn(err && 'border-destructive')}
                            placeholder={t('ticket_update_placeholder')}
                        />
                    </Field>

                    {showsWorkClass && (
                        <Field label={t('ticket_work_class')} help={t('ticket_work_class_hint')}>
                            <div className="space-y-2.5">
                                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                                    <Checkbox
                                        checked={sendingToTechnician}
                                        disabled={!sendingToTechnician && tickedClass === 'standard'}
                                        onCheckedChange={(on) => setWorkClass(on ? tickedClass : 'standard')}
                                    />
                                    <span>{t('ticket_work_class_send')}</span>
                                </label>

                                {sendingToTechnician && (
                                    <SearchableSelect
                                        value={workClass}
                                        onChange={(v) => setWorkClass(v as TicketWorkClass)}
                                        options={options}
                                        selectedOption={{ value: workClass, label: t(TICKET_WORK_CLASS_META[workClass].key), search: '' }}
                                    />
                                )}
                            </div>
                        </Field>
                    )}

                    {/* Deadline before -> after, shown only when the class changes */}
                    {reclassifying &&
                        (forecastAvailable ? (
                            <div className="bg-muted/40 border-border/60 rounded-lg border px-3.5 py-3">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                    <div className="min-w-0">
                                        <div className="text-muted-foreground text-xs">{t('ticket_work_class_deadline_from')}</div>
                                        <div className="text-[13px] font-medium">{view?.sla ? fmt.dateTime(view.sla.resolve_due_at) : '—'}</div>
                                    </div>
                                    <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                                    <div className="min-w-0 text-right">
                                        <div className="text-muted-foreground text-xs">{t('ticket_work_class_deadline_to')}</div>
                                        <div className="text-[13px] font-semibold">{forecast ? fmt.dateTime(forecast.due_at) : '—'}</div>
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
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
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
