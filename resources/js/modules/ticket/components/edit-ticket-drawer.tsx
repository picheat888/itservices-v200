import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { AttachmentList, AttachmentRow, FileDropZone, mergeFiles } from '@/shared/components/file-drop-zone';
import { SaveButton } from '@/shared/components/save-button';
import { SectionLabel } from '@/shared/components/section-label';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { hasFieldError, refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketAttachment, TicketCategory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooterBar, largeDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Pencil, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_CATEGORIES, TicketCategoryIcon } from './ticket-meta';

// The fields a refresh of the ticket may update while the user has not touched them
type EditForm = { category: TicketCategory; subject: string; description: string; phone: string; existing: TicketAttachment[] };
const EMPTY_FORM: EditForm = { category: 'hardware', subject: '', description: '', phone: '', existing: [] };
const toForm = (tk: Ticket): EditForm => ({
    category: tk.category,
    subject: tk.subject,
    description: tk.description ?? '',
    phone: tk.callback_phone ?? '',
    existing: tk.attachments ?? [],
});

/** Hard cap enforced by the API (files.*|max:10) — mirrored here for the UI. */
const MAX_FILES = 10;
/** Allowed extensions — mirrors the API's mimes rule. */
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

/** Edit a ticket's descriptive fields and attachments over the detail drawer; workflow fields are not editable here. */
export function EditTicketDrawer({
    ticket,
    fresh,
    onClose,
    onSaved,
}: {
    ticket: Ticket | null;
    /** The live copy of `ticket`; fields the user has not touched follow it. */
    fresh: Ticket | null;
    onClose: () => void;
    /** Called instead of onClose once the edit is saved. */
    onSaved?: () => void;
}) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const { update, uploadAttachments, deleteAttachment } = useTicketMutations();

    // `base` is what the form opened with, moved along by refreshes of the ticket
    const [form, setForm] = useState<EditForm>(EMPTY_FORM);
    const [base, setBase] = useState<EditForm>(EMPTY_FORM);
    const { category, subject, description, phone, existing } = form;
    const setCategory = (value: TicketCategory) => setForm((f) => ({ ...f, category: value }));
    const setSubject = (value: string) => setForm((f) => ({ ...f, subject: value }));
    const setDescription = (value: string) => setForm((f) => ({ ...f, description: value }));
    const setPhone = (value: string) => setForm((f) => ({ ...f, phone: value }));
    const setExisting = (update: (prev: TicketAttachment[]) => TicketAttachment[]) => setForm((f) => ({ ...f, existing: update(f.existing) }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Why the server refused, shown as the banner over the form.
    const formError = useFormError();
    const clearFormError = formError.clear;

    // Attachments: saved files (with pending removals) + new picks, both applied on Save
    const [removedIds, setRemovedIds] = useState<number[]>([]);
    const [pending, setPending] = useState<File[]>([]);
    // New files (from the top) a failed save already put on the ticket; Save again sends only the rest
    const [savedFiles, setSavedFiles] = useState(0);
    const [progress, setProgress] = useState<Record<number, number>>({});
    // Count of removed attachments already deleted during save (delete has no byte progress).
    const [deleted, setDeleted] = useState(0);
    // Owns the save lifecycle (incl. the 100% hold) so the bar outlives the mutations' isPending
    const [saving, setSaving] = useState(false);

    // Retain a "shown" copy so the header doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;
    // Opening focuses the picked type
    const cardRefs = useRef<Partial<Record<TicketCategory, HTMLButtonElement | null>>>({});

    // Preload the form once per ticket it opens on, from the live copy when it is already here
    const live = ticket && fresh && fresh.id === ticket.id ? fresh : null;
    const seeded = useSeedOnce(ticket?.id ?? null, () => {
        if (!ticket) return;
        const opened = toForm(live ?? ticket);
        setForm(opened);
        setBase(opened);
        setErrors({});
        clearFormError();
        setRemovedIds([]);
        setPending([]);
        setSavedFiles(0);
        setProgress({});
        setDeleted(0);
        setSaving(false);
    });
    useFormRebase({ fresh: live && seeded ? toForm(live) : null, base, setBase, setForm, skip: ['existing'] });

    const keptExisting = existing.filter((a) => !removedIds.includes(a.id));
    const totalFiles = keptExisting.length + pending.length;

    // Only free slots are offered; files mirrored from the service request don't count, as on the server
    const ownExisting = keptExisting.filter((a) => !a.from_request).length;
    const addFiles = (list: FileList | File[]) => setPending((prev) => mergeFiles(prev, list, ACCEPT_EXT, MAX_FILES - ownExisting));

    const submit = async () => {
        if (!ticket) return;
        const e: Record<string, string> = {};
        if (subject.trim().length < 5) e.subject = t('ticket_err_subject');
        if (description.trim().length < 10) e.description = t('ticket_err_description');
        if (phone.replace(/\D/g, '').length < 3) e.phone = t('ticket_err_phone');
        setErrors(e);
        if (Object.keys(e).length) return;
        if (isDirty && !(await confirmEdit({ name: ticket.subject, sub: ticket.ticket_no }))) return;

        setDeleted(0);
        formError.clear();
        // The files already on the ticket stay full; the rest start again from empty.
        setProgress(Object.fromEntries(pending.slice(0, savedFiles).map((_, i) => [i, 100])));
        setSaving(true);
        let saved = savedFiles;
        const removedNow: number[] = [];
        try {
            await update.mutateAsync({
                id: ticket.id,
                payload: { subject: subject.trim(), description: description.trim(), category, callback_phone: phone.trim() },
            });
            // Removals first: on a full ticket the server refuses uploads (too_many_files) until slots are freed
            for (const attachmentId of removedIds) {
                await deleteAttachment.mutateAsync({ id: ticket.id, attachmentId });
                removedNow.push(attachmentId);
                setDeleted((d) => d + 1);
            }
            if (pending.length > saved) {
                const offset = saved;
                await uploadAttachments.mutateAsync({
                    id: ticket.id,
                    files: pending.slice(offset),
                    onProgress: (index, percent) => setProgress((prev) => ({ ...prev, [offset + index]: percent })),
                    onSaved: (index) => {
                        saved = offset + index + 1;
                    },
                });
            }
            // Hold the finished bar at 100% for a beat so it doesn't vanish mid-fill.
            if (totalOps > 0) {
                await new Promise((resolve) => setTimeout(resolve, 450));
            }
        } catch (err: unknown) {
            // Explain the refusal here; what did save is never sent twice (a repeat removal is refused as missing)
            setSavedFiles(saved);
            setExisting((prev) => prev.filter((a) => !removedNow.includes(a.id)));
            setRemovedIds((prev) => prev.filter((id) => !removedNow.includes(id)));
            // One file per request, so a file the upload rules turn down comes back as `files.0`.
            formError.show(
                hasFieldError(err, 'files.0')
                    ? t('ticket_refusal_file_rejected').replace('{name}', pending[saved]?.name ?? '')
                    : refusalText(err, t, 'ticket_refusal_'),
            );
            setSaving(false);
            return;
        }
        setSaving(false);
        (onSaved ?? onClose)();
    };

    const uploading = uploadAttachments.isPending;
    // One bar for the whole save: uploads add their byte fraction, each delete counts as one step
    const totalOps = pending.length + removedIds.length;
    const overallPct = totalOps ? Math.round(((Object.values(progress).reduce((a, b) => a + b, 0) / 100 + deleted) / totalOps) * 100) : 0;
    const isDirty =
        !!ticket &&
        (category !== base.category ||
            subject !== base.subject ||
            description !== base.description ||
            phone !== base.phone ||
            removedIds.length > 0 ||
            pending.length > 0);
    const guardClose = useDiscardGuard(isDirty);

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !saving && guardClose(onClose)}>
            <DialogContent
                className={largeDialogContentClass}
                onOpenAutoFocus={(e) => {
                    const card = ticket ? cardRefs.current[ticket.category] : null;
                    if (card) {
                        e.preventDefault();
                        card.focus();
                    }
                }}
            >
                <FocusDialogHeader
                    icon={Pencil}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_edit_title')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    srDescription={t('ticket_edit_sub')}
                />

                {/* Two equal columns mirroring Open Ticket: left = describe the issue, right = reach-back + evidence. */}
                <div className="grid flex-1 grid-cols-1 content-start gap-x-10 gap-y-6 overflow-y-auto border-t px-6 py-6 sm:grid-cols-2">
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} className="sm:col-span-2" />

                    {/* LEFT: what's wrong */}
                    <div className="space-y-6">
                        <section>
                            <SectionLabel>{t('ticket_sec_type')}</SectionLabel>
                            <div className="grid grid-cols-2 gap-2.5">
                                {TICKET_CATEGORIES.map((c) => (
                                    <ChoiceCard
                                        key={c}
                                        ref={(el) => {
                                            cardRefs.current[c] = el;
                                        }}
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
                                        maxLength={200}
                                        autoComplete="off"
                                        placeholder={t('ticket_subject_ph')}
                                    />
                                </Field>
                                <Field label={t('ticket_description')} required error={errors.description}>
                                    <Textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={5}
                                        maxLength={5000}
                                        placeholder={t('ticket_description_ph')}
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
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    name="callback_phone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    maxLength={60}
                                    placeholder={t('emp_phone_ph')}
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
                                            // No ✕ for a file mirrored from the service request; the endpoint refuses the delete
                                            onRemove={saving || a.from_request ? undefined : () => setRemovedIds((prev) => [...prev, a.id])}
                                        />
                                    ))}
                                    {pending.map((f, i) => (
                                        <AttachmentRow
                                            key={`p-${i}`}
                                            name={f.name}
                                            size={f.size}
                                            mime={f.type}
                                            // Not for a file a failed save already put on the ticket.
                                            onRemove={
                                                uploading || i < savedFiles ? undefined : () => setPending((prev) => prev.filter((_, j) => j !== i))
                                            }
                                        />
                                    ))}
                                </AttachmentList>
                            )}
                        </section>
                    </div>
                </div>

                {/* Footer: actions */}
                <DialogFooterBar className="flex-wrap">
                    {/* One save-progress bar covering upload (byte %) + delete (per-file step). */}
                    {saving && totalOps > 0 && (
                        <div className="mr-auto flex items-center gap-2">
                            <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                                <div
                                    className="bg-brand h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                                    style={{ width: `${overallPct}%` }}
                                />
                            </div>
                            <span className="text-muted-foreground text-xs">{overallPct}%</span>
                        </div>
                    )}
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={saving} disabled={!isDirty}>
                        <Save className="h-4 w-4" />
                        {t('save')}
                    </SaveButton>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}
