import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { AttachmentList, AttachmentRow, FileDropZone, mergeFiles } from '@/shared/components/file-drop-zone';
import { SectionLabel } from '@/shared/components/section-label';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketAttachment, TicketCategory } from '@/shared/types';
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

/** Hard cap enforced by the API (files.*|max:10) — mirrored here for the UI. */
const MAX_FILES = 10;
/** Allowed extensions — mirrors the API's mimes rule. */
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

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
    const [progress, setProgress] = useState<Record<number, number>>({});
    // Count of removed attachments already deleted during save (delete has no byte progress).
    const [deleted, setDeleted] = useState(0);
    // Owns the whole save lifecycle (incl. a brief 100% hold) so the progress bar stays
    // visible after the mutations' isPending flips back to false.
    const [saving, setSaving] = useState(false);

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
        setProgress({});
        setDeleted(0);
        setSaving(false);
    }, [ticket]);

    const keptExisting = existing.filter((a) => !removedIds.includes(a.id));
    const totalFiles = keptExisting.length + pending.length;

    // The cap counts the files already saved, so only the free slots are offered.
    // Files mirrored from the service request are left out of the count, and the
    // server counts them the same way — they are the request's, not this case's.
    const ownExisting = keptExisting.filter((a) => !a.from_request).length;
    const addFiles = (list: FileList | File[]) => setPending((prev) => mergeFiles(prev, list, ACCEPT_EXT, MAX_FILES - ownExisting));

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
    const overallPct = totalOps ? Math.round(((Object.values(progress).reduce((a, b) => a + b, 0) / 100 + deleted) / totalOps) * 100) : 0;

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

                            <FileDropZone accept={ACCEPT_EXT} hint={t('ticket_attach_types')} compact={totalFiles > 0} onPick={addFiles} />

                            {/* One scroll list under the dropzone: saved files first (✕ = mark for removal), then new files (✕ = drop). */}
                            {totalFiles > 0 && (
                                <AttachmentList count={totalFiles} max={MAX_FILES}>
                                    {keptExisting.map((a) => (
                                        <AttachmentRow
                                            key={`e-${a.id}`}
                                            name={a.name}
                                            size={a.size}
                                            mime={a.mime}
                                            // A file mirrored from the service request has no ✕: it belongs to
                                            // the request, shares its bytes, and the endpoint refuses the delete.
                                            onRemove={saving || a.from_request ? undefined : () => setRemovedIds((prev) => [...prev, a.id])}
                                        />
                                    ))}
                                    {pending.map((f, i) => (
                                        <AttachmentRow
                                            key={`p-${i}`}
                                            name={f.name}
                                            size={f.size}
                                            mime={f.type}
                                            onRemove={uploading ? undefined : () => setPending((prev) => prev.filter((_, j) => j !== i))}
                                        />
                                    ))}
                                </AttachmentList>
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
