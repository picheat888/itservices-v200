import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SectionLabel } from '@/shared/components/section-label';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketAttachment, TicketCategory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { FileImage, FileText, Loader2, Paperclip, Pencil, Save, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';

/** Hard cap enforced by the API (files.*|max:10) — mirrored here for the UI. */
const MAX_FILES = 10;
/** Allowed extensions — mirrors the API's mimes rule (browser MIME is unreliable for office/zip). */
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const ACCEPT_ATTR = ACCEPT_EXT.map((e) => `.${e}`).join(',');
/** Human-readable file size (KB/MB). */
const fmtSize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/**
 * Correct a ticket's descriptive fields (subject / description / category / callback
 * phone) and manage its attachments in the same centered focus dialog as "Open Ticket".
 * Stacks over the detail drawer and bounces back to it on save/close. Workflow fields
 * (priority / status / assignee) are not editable here.
 */
export function EditTicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { update, uploadAttachments, deleteAttachment } = useTicketMutations();

    const [category, setCategory] = useState<TicketCategory>('hardware');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Attachments: already-saved files (with pending removals) + newly picked files.
    // Both are applied on Save (upload new, delete removed).
    const [existing, setExisting] = useState<TicketAttachment[]>([]);
    const [removedIds, setRemovedIds] = useState<number[]>([]);
    const [pending, setPending] = useState<File[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState<Record<number, number>>({});
    // Count of removed attachments already deleted during save (delete has no byte progress).
    const [deleted, setDeleted] = useState(0);
    // Owns the whole save lifecycle (incl. a brief 100% hold) so the progress bar stays
    // visible after the mutations' isPending flips back to false.
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Preload the form + attachments from the ticket each time it opens.
    useEffect(() => {
        if (!ticket) return;
        setCategory(ticket.category);
        setSubject(ticket.subject);
        setDescription(ticket.description ?? '');
        setPhone(ticket.callback_phone ?? '');
        setErrors({});
        setExisting(ticket.attachments ?? []);
        setRemovedIds([]);
        setPending([]);
        setDragOver(false);
        setProgress({});
        setDeleted(0);
        setSaving(false);
    }, [ticket]);

    const keptExisting = existing.filter((a) => !removedIds.includes(a.id));
    const totalFiles = keptExisting.length + pending.length;

    // Keep only allowed extensions, respect the remaining slots, dedupe by name+size.
    const addFiles = (list: FileList | File[]) => {
        const incoming = Array.from(list).filter((f) => ACCEPT_EXT.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
        setPending((prev) => {
            const merged = [...prev];
            for (const f of incoming) {
                if (keptExisting.length + merged.length >= MAX_FILES) break;
                if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
            }
            return merged;
        });
    };

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

        setDeleted(0);
        setSaving(true);
        try {
            await update.mutateAsync({
                id: ticket.id,
                payload: { subject: subject.trim(), description: description.trim(), category, callback_phone: phone.trim() },
            });
            if (pending.length > 0) {
                await uploadAttachments.mutateAsync({
                    id: ticket.id,
                    files: pending,
                    onProgress: (index, percent) => setProgress((prev) => ({ ...prev, [index]: percent })),
                });
            }
            for (const attachmentId of removedIds) {
                await deleteAttachment.mutateAsync({ id: ticket.id, attachmentId });
                setDeleted((d) => d + 1);
            }
            // Hold the finished bar at 100% for a beat so it doesn't vanish mid-fill.
            if (totalOps > 0) {
                await new Promise((resolve) => setTimeout(resolve, 450));
            }
        } catch {
            // Mutation errors surface via the global handler; just re-enable the form.
            setSaving(false);
            return;
        }
        setSaving(false);
        onClose();
    };

    const uploading = uploadAttachments.isPending;
    // One overall bar for the whole save: each uploaded file contributes its byte fraction,
    // each deleted file counts as one done step (delete has no byte-level progress).
    const totalOps = pending.length + removedIds.length;
    const overallPct = totalOps
        ? Math.round(((Object.values(progress).reduce((a, b) => a + b, 0) / 100 + deleted) / totalOps) * 100)
        : 0;

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader icon={Pencil} eyebrow="Edit Ticket" title={t('ticket_edit_title')} srDescription={t('ticket_edit_sub')} />

                {/* Two equal columns mirroring Open Ticket: left = describe the issue, right = reach-back + evidence. */}
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

                            {/* Drag & drop OR click — on top like Open Ticket, shrinks once any file is present. */}
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
                                    totalFiles ? 'py-2.5' : 'py-9',
                                    dragOver
                                        ? 'border-brand bg-brand/10 text-brand'
                                        : 'border-input text-muted-foreground hover:border-brand/50 hover:text-brand hover:bg-[#c4c4c40f]',
                                )}
                            >
                                <UploadCloud className={cn('shrink-0', totalFiles ? 'h-5 w-5' : 'h-6 w-6')} />
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

                            {/* One scroll list under the dropzone: saved files first (✕ = mark for removal), then new files (✕ = drop). */}
                            {totalFiles > 0 && (
                                <div className="mt-3.5">
                                    <div className="text-brand mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold">
                                        <Paperclip className="h-3.5 w-3.5" />
                                        {t('ticket_attach_count').replace('{n}', String(totalFiles)).replace('{max}', String(MAX_FILES))}
                                    </div>
                                    <div className="max-h-[196px] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                                        {keptExisting.map((a) => (
                                            <div key={`e-${a.id}`} className="border-border/60 flex items-center gap-2.5 border-b px-1 py-2 last:border-b-0">
                                                <span className="text-muted-foreground shrink-0">
                                                    {a.mime?.startsWith('image/') ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.name}</span>
                                                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{fmtSize(a.size)}</span>
                                                {!saving && (
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-destructive hover:bg-accent grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                                        onClick={() => setRemovedIds((prev) => [...prev, a.id])}
                                                        aria-label={t('delete')}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {pending.map((f, i) => (
                                            <div key={`p-${i}`} className="border-border/60 flex items-center gap-2.5 border-b px-1 py-2 last:border-b-0">
                                                <span className="text-muted-foreground shrink-0">
                                                    {f.type.startsWith('image/') ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.name}</span>
                                                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{fmtSize(f.size)}</span>
                                                {!uploading && (
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-destructive hover:bg-accent grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                                        onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
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
                    {/* One save-progress bar covering upload (byte %) + delete (per-file step). */}
                    {saving && totalOps > 0 && (
                        <div className="mr-auto flex items-center gap-2">
                            <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                                <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${overallPct}%` }} />
                            </div>
                            <span className="text-muted-foreground font-mono text-xs">{overallPct}%</span>
                        </div>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
