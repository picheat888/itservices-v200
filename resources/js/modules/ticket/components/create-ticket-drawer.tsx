import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { AttachmentList, AttachmentRow, FileDropZone, mergeFiles } from '@/shared/components/file-drop-zone';
import { SectionLabel } from '@/shared/components/section-label';
import { cn } from '@/shared/lib/utils';
import type { TicketCategory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';

/** Hard cap enforced by the API (files.*|max:10) — mirrored here for the UI. */
const MAX_FILES = 10;

/** Allowed extensions — mirrors the API's mimes rule. */
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

/** Employee-facing form to raise a ticket. Priority and assignee are set later by IT. */
export function CreateTicketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, uploadAttachments } = useTicketMutations();

    // No default — the employee must consciously pick an issue type (validated on submit).
    const [category, setCategory] = useState<TicketCategory | null>(null);
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Per-file upload progress (index → 0..100), populated while uploading after submit.
    const [progress, setProgress] = useState<Record<number, number>>({});

    /** Drop one field's validation error — typing/picking counts as fixing it. */
    const clearError = (key: string) =>
        setErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });

    const addFiles = (list: FileList | File[]) => setFiles((prev) => mergeFiles(prev, list, ACCEPT_EXT, MAX_FILES));

    useEffect(() => {
        if (open) {
            setCategory(null);
            setSubject('');
            setDescription('');
            setPhone('');
            setFiles([]);
            setErrors({});
            setProgress({});
        }
    }, [open]);

    const submit = async () => {
        const e: Record<string, string> = {};
        if (!category) e.category = lang === 'th' ? 'กรุณาเลือกประเภทปัญหา' : 'Please select an issue type';
        if (subject.trim().length < 5)
            e.subject = lang === 'th' ? 'กรุณาระบุหัวข้อ (อย่างน้อย 5 ตัวอักษร)' : 'Please describe the issue (min 5 characters)';
        if (description.trim().length < 10)
            e.description = lang === 'th' ? 'กรุณากรอกรายละเอียด (อย่างน้อย 10 ตัวอักษร)' : 'Please provide a description (min 10 characters)';
        // Internal extensions can be as short as 3 digits (e.g. 123).
        if (phone.replace(/\D/g, '').length < 3) e.phone = lang === 'th' ? 'เบอร์โทรไม่ถูกต้อง' : 'Please provide a callback phone number';
        setErrors(e);
        if (Object.keys(e).length || !category) return;

        const ticket = await create.mutateAsync({
            subject: subject.trim(),
            description: description.trim(),
            category,
            callback_phone: phone.trim(),
        });
        if (files.length > 0 && ticket?.id) {
            await uploadAttachments.mutateAsync({
                id: ticket.id,
                files,
                onProgress: (index, percent) => setProgress((prev) => ({ ...prev, [index]: percent })),
            });
        }
        onClose();
    };

    const uploading = uploadAttachments.isPending;
    const pending = create.isPending || uploading;
    const hasFiles = files.length > 0;
    // Overall upload progress = average of the per-file percents (missing = 0),
    // shown as one bar so it stays visible no matter how many files scroll off.
    const overallPct = files.length ? Math.round(Object.values(progress).reduce((a, b) => a + b, 0) / files.length) : 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={MessageSquarePlus}
                    eyebrow="Open Ticket"
                    title={t('ticket_form_title')}
                    srDescription={t('ticket_form_title')}
                />

                {/* Two equal columns: left = describe the issue, right = reach-back + evidence. */}
                <div className="grid flex-1 grid-cols-1 content-start gap-x-10 gap-y-6 overflow-y-auto border-t px-6 py-6 sm:grid-cols-2">
                    {/* LEFT: what's wrong */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>
                                {t('ticket_sec_type')} <span className="text-destructive">*</span>
                            </SectionLabel>
                            <div className="grid grid-cols-2 gap-2.5">
                                {TICKET_CATEGORIES.map((c) => (
                                    <ChoiceCard
                                        key={c}
                                        selected={category === c}
                                        invalid={!!errors.category}
                                        onClick={() => {
                                            setCategory(c);
                                            clearError('category');
                                        }}
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
                            {errors.category && (
                                <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    {errors.category}
                                </p>
                            )}
                        </section>

                        <section>
                            <SectionLabel>
                                {t('ticket_sec_detail')} <span className="text-destructive">*</span>
                            </SectionLabel>
                            <div className="space-y-4">
                                <Field label={t('ticket_subject')} required error={errors.subject}>
                                    <Input
                                        value={subject}
                                        onChange={(e) => {
                                            setSubject(e.target.value);
                                            clearError('subject');
                                        }}
                                        placeholder={lang === 'th' ? 'เช่น เชื่อมต่อ VPN ไม่ได้' : "e.g. Can't connect to VPN"}
                                    />
                                </Field>
                                <Field label={t('ticket_description')} required error={errors.description}>
                                    <Textarea
                                        value={description}
                                        onChange={(e) => {
                                            setDescription(e.target.value);
                                            clearError('description');
                                        }}
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

                    {/* RIGHT: how to reach you + evidence */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>
                                {t('ticket_sec_contact')} <span className="text-destructive">*</span>
                            </SectionLabel>
                            <Field label={t('ticket_callback_phone')} required error={errors.phone} help={t('ticket_callback_help')}>
                                <Input
                                    value={phone}
                                    onChange={(e) => {
                                        setPhone(e.target.value);
                                        clearError('phone');
                                    }}
                                    className="font-mono"
                                    placeholder="+66 81 234 5678 / ext. 1305"
                                />
                            </Field>
                        </section>

                        <section>
                            <SectionLabel>{t('ticket_attach')}</SectionLabel>
                            <p className="text-muted-foreground mb-3.5 text-xs">{t('ticket_attach_optional')}</p>

                            <FileDropZone accept={ACCEPT_EXT} hint={t('ticket_attach_types')} compact={hasFiles} onPick={addFiles} />

                            {hasFiles && (
                                <AttachmentList count={files.length} max={MAX_FILES} progressPct={uploading ? overallPct : undefined}>
                                    {files.map((f, i) => (
                                        <AttachmentRow
                                            key={i}
                                            name={f.name}
                                            size={f.size}
                                            mime={f.type}
                                            // Remove is only available before the upload starts.
                                            onRemove={uploading ? undefined : () => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                        />
                                    ))}
                                </AttachmentList>
                            )}
                        </section>
                    </div>
                </div>

                {/* Footer: actions */}
                <div className="border-border bg-muted/20 flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('submit_ticket')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
