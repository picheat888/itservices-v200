import { Field } from '@/shared/components/field';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useTicketMutations } from '../hooks/use-tickets';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Ticket, TicketCategory } from '@/shared/types';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Correct a ticket's descriptive fields (subject / description / category / callback
 * phone). Stacks over the detail drawer and bounces back to it on save/close.
 * Workflow fields (priority / status / assignee) are not editable here.
 */
export function EditTicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { update } = useTicketMutations();

    const [category, setCategory] = useState<TicketCategory>('hardware');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Preload the form from the ticket each time it opens (subject is single-language).
    useEffect(() => {
        if (!ticket) return;
        setCategory(ticket.category);
        setSubject(ticket.subject);
        setDescription(ticket.description ?? '');
        setPhone(ticket.callback_phone ?? '');
        setErrors({});
    }, [ticket]);

    const submit = async () => {
        if (!ticket) return;
        const e: Record<string, string> = {};
        if (subject.trim().length < 5)
            e.subject = lang === 'th' ? 'กรุณาระบุหัวข้อ (อย่างน้อย 5 ตัวอักษร)' : 'Please describe the issue (min 5 characters)';
        if (description.trim().length < 10)
            e.description = lang === 'th' ? 'กรุณากรอกรายละเอียด (อย่างน้อย 10 ตัวอักษร)' : 'Please provide a description (min 10 characters)';
        if (phone.replace(/\D/g, '').length < 3) e.phone = lang === 'th' ? 'เบอร์โทรไม่ถูกต้อง' : 'Please provide a callback phone number';
        setErrors(e);
        if (Object.keys(e).length) return;

        await update.mutateAsync({
            id: ticket.id,
            payload: {
                subject: subject.trim(),
                description: description.trim(),
                category,
                callback_phone: phone.trim(),
            },
        });
        onClose();
    };

    return (
        <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[560px] flex-col sm:max-w-[560px]">
                <SheetHeader>
                    <SheetTitle>{t('ticket_edit_title')}</SheetTitle>
                    <SheetDescription>{t('ticket_edit_sub')}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    <div>
                        <div className="text-muted-foreground mb-2.5 text-xs font-semibold">{t('ticket_category')}</div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {TICKET_CATEGORIES.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCategory(c)}
                                    className={cn(
                                        'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                                        category === c ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/50',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-md',
                                            category === c ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        <TicketCategoryIcon category={c} className="h-4 w-4" />
                                    </span>
                                    <span className="text-sm font-semibold">{t(`ticket_cat_${c}`)}</span>
                                    <span className="text-muted-foreground text-xs">{t(`ticket_cat_${c}_sub`)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <Field label={t('ticket_subject')} required error={errors.subject}>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </Field>

                    <Field label={t('ticket_description')} required error={errors.description}>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                        />
                    </Field>

                    <Field label={t('ticket_callback_phone')} required error={errors.phone} help={t('ticket_callback_help')}>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="font-mono" placeholder="+66 81 234 5678 / ext. 1305" />
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={update.isPending}>
                        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('save')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
