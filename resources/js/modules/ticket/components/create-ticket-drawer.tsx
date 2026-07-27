import { Field } from '@/shared/components/field';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SectionLabel } from '@/shared/components/section-label';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useTicketMutations } from '../hooks/use-tickets';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { TicketCategory } from '@/shared/types';
import { FileImage, FileText, Loader2, MessageSquarePlus, Paperclip, Send, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Hard cap enforced by the API (files.*|max:10) — mirrored here for the UI. */
const MAX_FILES = 10;

/** Allowed extensions — mirrors the API's mimes rule. Browser MIME is unreliable
 *  for office/zip files, so we gate the picker/drop by extension. */
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const ACCEPT_ATTR = ACCEPT_EXT.map((e) => `.${e}`).join(',');

/** Human-readable file size (KB/MB). */
const fmtSize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** Employee-facing form to raise a ticket. Priority and assignee are set later by IT. */
export function CreateTicketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, uploadAttachments } = useTicketMutations();

    const [category, setCategory] = useState<TicketCategory>('hardware');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Per-file upload progress (index → 0..100), populated while uploading after submit.
    const [progress, setProgress] = useState<Record<number, number>>({});

    // Keep only allowed extensions, cap at MAX_FILES, dedupe by name+size.
    const addFiles = (list: FileList | File[]) => {
        const incoming = Array.from(list).filter((f) => ACCEPT_EXT.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
        setFiles((prev) => {
            const merged = [...prev];
            for (const f of incoming) {
                if (merged.length >= MAX_FILES) break;
                if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
            }
            return merged;
        });
    };

    useEffect(() => {
        if (open) {
            setCategory('hardware');
            setSubject('');
            setDescription('');
            setPhone('');
            setFiles([]);
            setDragOver(false);
            setErrors({});
            setProgress({});
        }
    }, [open]);

    const submit = async () => {
        const e: Record<string, string> = {};
        if (subject.trim().length < 5)
            e.subject = lang === 'th' ? 'กรุณาระบุหัวข้อ (อย่างน้อย 5 ตัวอักษร)' : 'Please describe the issue (min 5 characters)';
        if (description.trim().length < 10)
            e.description = lang === 'th' ? 'กรุณากรอกรายละเอียด (อย่างน้อย 10 ตัวอักษร)' : 'Please provide a description (min 10 characters)';
        // Internal extensions can be as short as 3 digits (e.g. 123).
        if (phone.replace(/\D/g, '').length < 3) e.phone = lang === 'th' ? 'เบอร์โทรไม่ถูกต้อง' : 'Please provide a callback phone number';
        setErrors(e);
        if (Object.keys(e).length) return;

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
                    eyebrow="New Ticket"
                    title={t('ticket_form_title')}
                    srDescription={t('ticket_form_title')}
                />

                {/* Two equal columns: left = describe the issue, right = reach-back + evidence. */}
                <div className="grid flex-1 grid-cols-1 content-start gap-x-10 gap-y-6 overflow-y-auto border-t px-6 py-6 sm:grid-cols-2">
                    {/* LEFT: what's wrong */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>{t('ticket_sec_type')}</SectionLabel>
                            <div className="grid grid-cols-2 gap-2.5">
                                {TICKET_CATEGORIES.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setCategory(c)}
                                        className={cn(
                                            'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/15 focus:outline-hidden',
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
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={5}
                                        className="border-input bg-background hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-[3px]"
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
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="font-mono"
                                    placeholder="+66 81 234 5678 / ext. 1305"
                                />
                            </Field>
                        </section>

                        <section>
                            <SectionLabel>{t('ticket_attach')}</SectionLabel>
                            <p className="text-muted-foreground mb-3.5 text-xs">{t('ticket_attach_optional')}</p>

                            {/* Drag & drop OR click. Shrinks to a compact bar once files exist. */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => inputRef.current?.click()}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOver(true);
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    setDragOver(false);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOver(false);
                                    addFiles(e.dataTransfer.files);
                                }}
                                className={cn(
                                    'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 text-center text-sm transition-colors',
                                    hasFiles ? 'py-2.5' : 'py-9',
                                    dragOver
                                        ? 'border-brand bg-brand/10 text-brand'
                                        : 'border-input text-muted-foreground hover:border-brand/50 hover:text-brand',
                                )}
                            >
                                <UploadCloud className={cn('shrink-0', hasFiles ? 'h-5 w-5' : 'h-6 w-6')} />
                                <span className="text-foreground font-medium">{t('ticket_attach_drop')}</span>
                                <span className="text-muted-foreground text-[11px]">{t('ticket_attach_types')}</span>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    multiple
                                    accept={ACCEPT_ATTR}
                                    className="hidden"
                                    onChange={(e) => {
                                        addFiles(e.target.files ?? []);
                                        e.target.value = '';
                                    }}
                                />
                            </div>

                            {hasFiles && (
                                <div className="mt-3.5">
                                    <div className="text-brand mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold">
                                        <Paperclip className="h-3.5 w-3.5" />
                                        {t('ticket_attach_count').replace('{n}', String(files.length)).replace('{max}', String(MAX_FILES))}
                                        {uploading && <span className="ml-auto font-mono">{overallPct}%</span>}
                                    </div>
                                    {/* One overall bar (outside the scroll area) so progress stays visible for all files. */}
                                    {uploading && (
                                        <div className="bg-muted mb-2.5 h-1.5 overflow-hidden rounded-full">
                                            <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${overallPct}%` }} />
                                        </div>
                                    )}
                                    {/* Caps at ~5 rows and scrolls internally so 10 files never stretch the dialog.
                                        scrollbar-gutter:stable reserves the scrollbar space at all times, so rows
                                        (and the ✕) don't shift when the scrollbar appears/disappears past 5 files. */}
                                    <div className="max-h-[196px] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                                        {files.map((f, i) => (
                                            <div key={i} className="border-border/60 flex items-center gap-2.5 border-b px-1 py-2 last:border-b-0">
                                                <span className="text-muted-foreground shrink-0">
                                                    {f.type.startsWith('image/') ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.name}</span>
                                                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{fmtSize(f.size)}</span>
                                                {/* Remove is only available before the upload starts. */}
                                                {!uploading && (
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-destructive hover:bg-accent grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                                        aria-label={t('delete')}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
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
