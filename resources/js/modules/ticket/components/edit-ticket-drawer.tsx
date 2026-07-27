import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SectionLabel } from '@/shared/components/section-label';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketCategory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Loader2, Pencil, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';

/**
 * Correct a ticket's descriptive fields (subject / description / category / callback
 * phone) in the same centered focus dialog as "Open Ticket". Stacks over the detail
 * drawer and bounces back to it on save/close. Workflow fields (priority / status /
 * assignee) are not editable here.
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

    const pending = update.isPending;

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader icon={Pencil} eyebrow="Edit Ticket" title={t('ticket_edit_title')} srDescription={t('ticket_edit_sub')} />

                {/* Two equal columns mirroring Open Ticket: left = describe the issue, right = reach-back. */}
                <div className="grid flex-1 grid-cols-1 content-start gap-x-10 gap-y-6 overflow-y-auto border-t px-6 py-6 sm:grid-cols-2">
                    {/* LEFT: what's wrong */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>{t('ticket_sec_type')}</SectionLabel>
                            <div className="grid grid-cols-2 gap-2.5">
                                {TICKET_CATEGORIES.map((c) => (
                                    <ChoiceCard
                                        key={c}
                                        selected={category === c}
                                        onClick={() => setCategory(c)}
                                        className="flex flex-col items-start gap-1 rounded-lg p-3 text-left"
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
                                    </ChoiceCard>
                                ))}
                            </div>
                        </section>

                        <section>
                            <SectionLabel>
                                {t('ticket_sec_detail')} <span className="text-destructive">*</span>
                            </SectionLabel>
                            <div className="space-y-4">
                                <Field label={t('ticket_subject')} required error={errors.subject}>
                                    <Input
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder={lang === 'th' ? 'เช่น เชื่อมต่อ VPN ไม่ได้' : "e.g. Can't connect to VPN"}
                                    />
                                </Field>
                                <Field label={t('ticket_description')} required error={errors.description}>
                                    <Textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={5}
                                        placeholder={
                                            lang === 'th'
                                                ? 'เกิดอะไรขึ้น ลองทำอะไรไปแล้วบ้าง เห็นข้อความ error อย่างไร'
                                                : 'What happened, what did you try, what error did you see?'
                                        }
                                    />
                                </Field>
                            </div>
                        </section>
                    </div>

                    {/* RIGHT: how to reach you */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>
                                {t('ticket_sec_contact')} <span className="text-destructive">*</span>
                            </SectionLabel>
                            <Field label={t('ticket_callback_phone')} required error={errors.phone} help={t('ticket_callback_help')}>
                                <Input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="font-mono"
                                    placeholder="+66 81 234 5678 / ext. 1305"
                                />
                            </Field>
                        </section>
                    </div>
                </div>

                {/* Footer: actions */}
                <div className="border-border bg-muted/20 flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
