import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { cn } from '@/shared/lib/utils';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Check, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';

export type ResolveMode = 'complete' | 'cancel';

/** The assignee closes an in-progress case with a required resolution note. */
export function ResolveTicketModal({ ticket, mode, onClose }: { ticket: Ticket | null; mode: ResolveMode | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { resolve } = useTicketMutations();
    const [resolution, setResolution] = useState('');
    const [err, setErr] = useState('');

    const open = !!ticket && !!mode;
    const isComplete = mode === 'complete';

    useEffect(() => {
        if (open) {
            setResolution('');
            setErr('');
        }
    }, [open]);

    const submit = async () => {
        if (!ticket || !mode) return;
        if (resolution.trim().length < 10) {
            setErr(lang === 'th' ? 'กรุณาใส่รายละเอียดอย่างน้อย 10 ตัวอักษร' : 'Please provide at least 10 characters of detail');
            return;
        }
        await resolve.mutateAsync({ id: ticket.id, mode, resolution: resolution.trim() });
        onClose();
    };

    const pending = resolve.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={isComplete ? CheckCircle2 : XCircle}
                    eyebrow="Resolve"
                    title={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    code={ticket?.ticket_no}
                    accent={isComplete ? undefined : '#ef4444'}
                    srDescription={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    <p className="text-muted-foreground text-sm">{t('ticket_resolution_required')}</p>
                    <Field label={t('ticket_resolution_details')} required error={err}>
                        <Textarea
                            value={resolution}
                            onChange={(e) => {
                                setResolution(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            className={cn(err && 'border-destructive')}
                            placeholder={
                                isComplete
                                    ? lang === 'th'
                                        ? 'ระบุวิธีการแก้ไข ขั้นตอน และผลลัพธ์…'
                                        : 'Describe what you did to fix the issue, steps taken, and outcome…'
                                    : lang === 'th'
                                      ? 'ระบุเหตุผลในการยกเลิกเคสนี้…'
                                      : 'Explain why this case is being canceled…'
                            }
                        />
                    </Field>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button variant={isComplete ? 'default' : 'destructive'} onClick={submit} disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : isComplete ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        {isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
