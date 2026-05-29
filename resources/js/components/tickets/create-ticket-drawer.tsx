import { Field } from '@/components/shared/field';
import { TICKET_CATEGORIES, TicketCategoryIcon } from '@/components/tickets/ticket-meta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTicketMutations } from '@/hooks/use-tickets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { TicketCategory } from '@/types';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Employee-facing form to raise a ticket. Priority and assignee are set later by IT. */
export function CreateTicketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create } = useTicketMutations();

    const [category, setCategory] = useState<TicketCategory>('hardware');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            setCategory('hardware');
            setSubject('');
            setDescription('');
            setPhone('');
            setErrors({});
        }
    }, [open]);

    const submit = async () => {
        const e: Record<string, string> = {};
        if (subject.trim().length < 5)
            e.subject = lang === 'th' ? 'กรุณาระบุหัวข้อ (อย่างน้อย 5 ตัวอักษร)' : 'Please describe the issue (min 5 characters)';
        if (description.trim().length < 10)
            e.description = lang === 'th' ? 'กรุณากรอกรายละเอียด (อย่างน้อย 10 ตัวอักษร)' : 'Please provide a description (min 10 characters)';
        if (phone.replace(/\D/g, '').length < 6) e.phone = lang === 'th' ? 'เบอร์โทรไม่ถูกต้อง' : 'Please provide a callback phone number';
        setErrors(e);
        if (Object.keys(e).length) return;

        await create.mutateAsync({
            subject: subject.trim(),
            subject_th: lang === 'th' ? subject.trim() : null,
            description: description.trim(),
            category,
            callback_phone: phone.trim(),
        });
        onClose();
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[560px] flex-col sm:max-w-[560px]">
                <SheetHeader>
                    <SheetTitle>{t('new_ticket')}</SheetTitle>
                    <SheetDescription>
                        {lang === 'th'
                            ? 'บอกเราว่ามีปัญหาอะไร เจ้าหน้าที่ไอทีจะรับเรื่องและกำหนดความสำคัญต่อไป'
                            : "Tell us what's not working — IT staff will pick it up and set priority."}
                    </SheetDescription>
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
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={lang === 'th' ? 'เช่น เชื่อมต่อ VPN ไม่ได้' : "e.g. Can't connect to VPN"}
                        />
                    </Field>

                    <Field label={t('ticket_description')} required error={errors.description}>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                            placeholder={
                                lang === 'th'
                                    ? 'เกิดอะไรขึ้น ลองทำอะไรไปแล้วบ้าง เห็นข้อความ error อย่างไร'
                                    : 'What happened, what did you try, what error did you see?'
                            }
                        />
                    </Field>

                    <Field label={t('ticket_callback_phone')} required error={errors.phone} help={t('ticket_callback_help')}>
                        <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="font-mono"
                            placeholder="+66 81 234 5678 / ext. 1305"
                        />
                    </Field>

                    <Field label={t('ticket_attach')} help={t('ticket_attach_help')}>
                        <div className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-5 text-center text-sm">
                            <Paperclip className="mx-auto h-5 w-5" />
                            <div className="mt-1.5 opacity-70">
                                {lang === 'th' ? 'แนบไฟล์ได้ในเฟสถัดไป' : 'File attachments coming in a later phase'}
                            </div>
                        </div>
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={create.isPending}>
                        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('submit_ticket')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
