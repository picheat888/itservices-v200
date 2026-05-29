import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTicketMutations } from '@/hooks/use-tickets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Ticket } from '@/types';
import { Check, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>{isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}</SheetTitle>
                    <SheetDescription>{ticket?.ticket_no}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-4 overflow-y-auto px-1">
                    <p className="text-muted-foreground text-sm">{t('ticket_resolution_required')}</p>
                    <Field label={t('ticket_resolution_details')} required error={err}>
                        <textarea
                            value={resolution}
                            onChange={(e) => {
                                setResolution(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            className={cn(
                                'bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none',
                                err ? 'border-destructive' : 'border-input',
                            )}
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

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" variant={isComplete ? 'default' : 'destructive'} onClick={submit} disabled={resolve.isPending}>
                        {resolve.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isComplete ? (
                            <Check className="h-4 w-4" />
                        ) : (
                            <X className="h-4 w-4" />
                        )}
                        {isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
