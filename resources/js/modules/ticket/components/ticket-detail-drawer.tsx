import { TicketPriorityBadge, TicketStatusBadge, ticketCategoryIcon } from './ticket-meta';
import { AssetTypeIcon } from '@/modules/asset';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle, focusDialogContentClass } from '@/shared/ui/dialog';
import { DialogTabs } from '@/shared/components/dialog-tabs';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SectionLabel } from '@/shared/components/section-label';
import { useDateTime } from '@/modules/settings';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketAttachment, TicketStatus } from '@/shared/types';
import { Check, Download, File, FileArchive, FileSpreadsheet, FileText, Pencil, Presentation, RefreshCcw, RotateCcw, Users, X, Zap, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { ResolveMode } from './resolve-ticket-modal';

/** Human-readable file size (KB/MB) for the attachment list. */
function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Broad file category derived from mime + extension — drives the icon and the preview mode. */
type FileKind = 'image' | 'pdf' | 'word' | 'excel' | 'ppt' | 'archive' | 'other';

/** Classify an attachment. Only image and pdf can be previewed inline; the rest show a file card. */
function fileKind(a: TicketAttachment): FileKind {
    const mime = a.mime ?? '';
    const ext = a.name.split('.').pop()?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (ext === 'doc' || ext === 'docx') return 'word';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel';
    if (ext === 'ppt' || ext === 'pptx') return 'ppt';
    if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'archive';
    return 'other';
}

/** Icon + short format keyword per non-image file kind (keyword is a format name, not translated). */
const KIND_META: Record<Exclude<FileKind, 'image'>, { Icon: typeof FileText; short: string }> = {
    pdf: { Icon: FileText, short: 'PDF' },
    word: { Icon: FileText, short: 'WORD' },
    excel: { Icon: FileSpreadsheet, short: 'EXCEL' },
    ppt: { Icon: Presentation, short: 'PPT' },
    archive: { Icon: FileArchive, short: 'ZIP' },
    other: { Icon: File, short: 'FILE' },
};

/** One solid muted tone for every file icon/badge — minimal, monochrome (not translucent); the kind reads from the keyword. */
const FILE_TONE = 'text-muted-foreground';

/** Small label/value pair used in the details grid and the rail. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

/** Visual tone of a spine step: done (brand check), ok (green), canceled (gray ✕, matches the status badge), current/working (pulsing), future (hollow gray). */
type SpineTone = 'done' | 'ok' | 'canceled' | 'current' | 'working' | 'future';

/** Maps the ticket status onto the three spine steps: created → taken → closed. */
function spineTones(status: TicketStatus): [SpineTone, SpineTone, SpineTone] {
    switch (status) {
        case 'open':
            return ['done', 'current', 'future'];
        case 'in_progress':
            return ['done', 'working', 'future'];
        case 'completed':
            return ['done', 'done', 'ok'];
        case 'canceled':
            return ['done', 'done', 'canceled'];
    }
}

/** One node of the case-status spine in the rail: dot + connector line + title/meta. */
function SpineStep({
    tone,
    index,
    last = false,
    title,
    meta,
    when,
}: {
    tone: SpineTone;
    index: number;
    last?: boolean;
    title: React.ReactNode;
    meta?: React.ReactNode;
    when?: string;
}) {
    const done = tone === 'done' || tone === 'ok' || tone === 'canceled';
    return (
        <li className="flex gap-3">
            <div className="flex flex-col items-center">
                <span
                    className={cn(
                        'relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        tone === 'done' && 'bg-brand text-brand-foreground',
                        tone === 'ok' && 'bg-emerald-500 text-white',
                        tone === 'canceled' && 'bg-muted-foreground text-background',
                        tone === 'current' && 'border-brand text-brand bg-background border-2',
                        tone === 'working' && 'bg-background border-2 border-violet-500 text-violet-600 dark:text-violet-400',
                        tone === 'future' && 'border-border text-muted-foreground bg-background border-2',
                    )}
                >
                    {(tone === 'current' || tone === 'working') && (
                        <span
                            className={cn(
                                'absolute inset-0 animate-ping rounded-full motion-reduce:hidden',
                                tone === 'current' ? 'bg-brand/30' : 'bg-violet-500/30',
                            )}
                        />
                    )}
                    {done ? tone === 'canceled' ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" /> : index}
                </span>
                {!last && <div className={cn('my-1 w-0.5 flex-1 rounded-full', tone === 'done' ? 'bg-brand' : 'bg-border')} />}
            </div>
            <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
                <div className={cn('text-sm leading-tight font-medium', tone === 'future' && 'text-muted-foreground')}>{title}</div>
                {(meta || when) && (
                    <div className="text-muted-foreground text-xs leading-relaxed">
                        {meta}
                        {when && <div className="font-mono text-[11px]">{when}</div>}
                    </div>
                )}
            </div>
        </li>
    );
}

/** Read-only ticket view — centered focus dialog with a tabbed body (details / files) and a case-status rail. */
export function TicketDetailDrawer({
    ticket,
    onClose,
    isIT,
    isSuper,
    meId,
    canEdit,
    onEdit,
    onTake,
    onAssign,
    onResolve,
}: {
    ticket: Ticket | null;
    onClose: () => void;
    isIT: boolean;
    isSuper: boolean;
    meId: number | undefined;
    canEdit: boolean;
    onEdit: (t: Ticket) => void;
    onTake: (t: Ticket) => void;
    onAssign: (t: Ticket) => void;
    onResolve: (t: Ticket, mode: ResolveMode) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { format: fmtTz } = useDateTime();
    // System-timezone timestamp; '' (not '—') when missing — timeline steps hide their timestamp row entirely.
    const fmtWhen = (iso: string | null | undefined): string => (iso ? fmtTz(iso) : '');

    // Retain a "shown" copy so the content doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    const [tab, setTab] = useState<'details' | 'files'>('details');
    // In-app preview (lightbox) for image and PDF attachments instead of opening a new tab.
    const [preview, setPreview] = useState<TicketAttachment | null>(null);
    // Same retention trick for the lightbox — render from the last shown file so it
    // doesn't blank while its own exit animation plays.
    const [shownPreview, setShownPreview] = useState<TicketAttachment | null>(null);
    useEffect(() => {
        if (preview) setShownPreview(preview);
    }, [preview]);
    const pv = preview ?? shownPreview;
    // Imperative zoom controls for the image lightbox (react-zoom-pan-pinch).
    const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);
    useEffect(() => {
        setPreview(null);
        setTab('details');
    }, [view?.id]);

    if (!view) return null;

    const isMine = view.assignee_id != null && view.assignee_id === meId;
    const isOpenUnassigned = view.status === 'open' && view.assignee_id == null;
    const files = view.attachments ?? [];
    const [s1, s2, s3] = spineTones(view.status);
    // Preview mode: images zoom/pan, PDFs embed via <iframe>, everything else shows a file card.
    const pvKind = pv ? fileKind(pv) : null;
    const isImagePreview = pvKind === 'image';
    const isPdfPreview = pvKind === 'pdf';
    // Icon/label metadata for the file card (non-image kinds; pdf is embedded, not carded).
    const pvMeta = pvKind && pvKind !== 'image' ? KIND_META[pvKind] : null;
    // A ticket canceled before anyone took it never reached step 2.
    const wasTaken = view.responded_at != null || view.assignee_name != null;

    return (
        <>
            <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className={focusDialogContentClass}>
                    {/* ---- header: shared focus-dialog header (icon tile + eyebrow + title + code chip) ---- */}
                    <FocusDialogHeader
                        icon={ticketCategoryIcon(view.category)}
                        eyebrow={
                            <span className="flex flex-wrap items-center gap-2">
                                Ticket no.
                                <span className="text-foreground text-[13.5px] font-extrabold tracking-tight">{view.ticket_no}</span>
                                <span className="bg-accent text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case">
                                    {t(`ticket_cat_${view.category}`)}
                                </span>
                            </span>
                        }
                        title={view.subject}
                        srDescription={view.ticket_no}
                        headerRight={
                            <div className="flex items-center gap-2">
                                <TicketStatusBadge status={view.status} t={t} />
                                {view.priority && <TicketPriorityBadge priority={view.priority} t={t} />}
                            </div>
                        }
                    />

                    {/* ---- full-width status banner under the header ---- */}
                    {isOpenUnassigned && isIT && (
                        <div className="bg-brand/10 text-brand border-border/60 flex items-center gap-2.5 border-b px-6 py-2 text-[12.5px]">
                            <Zap className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1">{t('ticket_unassigned_hint')}</span>
                            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => onTake(view)}>
                                {t('ticket_take_case')}
                            </Button>
                        </div>
                    )}
                    {view.status === 'in_progress' && isMine && (
                        <div className="border-border/60 flex items-center gap-2.5 border-b bg-violet-500/10 px-6 py-2 text-[12.5px] text-violet-600 dark:text-violet-400">
                            <RefreshCcw className="h-3.5 w-3.5 shrink-0" />
                            <span>{t('ticket_working_hint')}</span>
                        </div>
                    )}

                    {/* ---- body: tabbed main column | case-status rail ---- */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
                        <div className="flex min-w-0 flex-1 flex-col sm:min-h-0">
                            <DialogTabs
                                className="shrink-0 px-6"
                                active={tab}
                                onChange={setTab}
                                tabs={[
                                    { id: 'details', label: t('ticket_tab_details') },
                                    { id: 'files', label: t('ticket_attach'), count: files.length },
                                ]}
                            />

                            {/* Only the pane content scrolls — the tab bar above stays put. */}
                            <div className="min-h-0 flex-1 px-6 py-4 sm:overflow-y-auto">
                            {tab === 'details' && (
                                <div className="space-y-5">
                                    <section>
                                        <SectionLabel>{t('ticket_subject')}</SectionLabel>
                                        <p className="text-[15px] leading-snug font-bold tracking-tight">{view.subject}</p>
                                    </section>

                                    <section>
                                        <SectionLabel>{t('ticket_description')}</SectionLabel>
                                        <p className="bg-muted/50 rounded-md px-3 py-2.5 text-sm leading-relaxed">{view.description}</p>
                                    </section>

                                    {view.take_note && (
                                        <section>
                                            <SectionLabel>{t('ticket_take_note')}</SectionLabel>
                                            <p className="bg-muted/50 rounded-md px-3 py-2 text-sm leading-relaxed">{view.take_note}</p>
                                        </section>
                                    )}

                                    {view.resolution && (
                                        <section>
                                            <SectionLabel>{t('ticket_resolution')}</SectionLabel>
                                            <p
                                                className={
                                                    view.status === 'completed'
                                                        ? 'rounded-md bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-700 dark:text-emerald-400'
                                                        : // Canceled is a neutral outcome, not an error — gray like its status badge.
                                                          'bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm leading-relaxed'
                                                }
                                            >
                                                {view.resolution}
                                            </p>
                                        </section>
                                    )}

                                    {view.related_asset_tag && (
                                        <section>
                                            <SectionLabel>{t('ticket_related_asset')}</SectionLabel>
                                            {/* Plain info block (not a card) — this view has no asset navigation. */}
                                            <div className="space-y-3">
                                                {/* Device kind: the ASSET's type icon + category name (not the ticket category). */}
                                                <div className="flex items-center gap-2.5">
                                                    <span className="bg-muted text-muted-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md">
                                                        <AssetTypeIcon type={view.related_asset_type ?? ''} className="h-4 w-4" />
                                                    </span>
                                                    <span className="text-sm font-semibold">
                                                        {(lang === 'th' ? view.related_asset_type_th : null) ?? view.related_asset_type ?? '—'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    <KV label={t('ticket_asset_no')} value={view.related_asset_tag} mono />
                                                    <KV label={t('ticket_asset_tag')} value={view.related_asset_tag_name} mono />
                                                    <KV
                                                        label={t('ticket_asset_brand_model')}
                                                        value={[view.related_asset_brand, view.related_asset_model].filter(Boolean).join(' ')}
                                                    />
                                                    <KV label={t('ticket_asset_serial')} value={view.related_asset_serial} mono />
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )}

                            {tab === 'files' && (
                                <div>
                                    {files.length === 0 ? (
                                        <p className="text-muted-foreground py-8 text-center text-sm">{t('ticket_no_attachments')}</p>
                                    ) : (
                                        <ul className="grid gap-3 sm:grid-cols-2">
                                            {files.map((a) => {
                                                const kind = fileKind(a);
                                                const isImage = kind === 'image';
                                                const meta = isImage ? null : KIND_META[kind];
                                                return (
                                                    <li
                                                        key={a.id}
                                                        className="border-border group hover:border-brand overflow-hidden rounded-xl border transition-colors"
                                                    >
                                                        {/* Big thumbnail → opens the in-app preview (image lightbox / PDF viewer). */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreview(a)}
                                                            aria-label={a.name}
                                                            className="bg-muted border-border/60 block h-36 w-full overflow-hidden border-b p-2"
                                                        >
                                                            {isImage ? (
                                                                // object-contain: screenshots/documents show whole, letterboxed on the muted bg.
                                                                <img
                                                                    src={a.url}
                                                                    alt=""
                                                                    className="h-full w-full rounded-sm object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                                                                />
                                                            ) : (
                                                                meta && (
                                                                    <span className="flex h-full w-full flex-col items-center justify-center gap-2">
                                                                        <meta.Icon strokeWidth={1.5} className={cn('h-14 w-14', FILE_TONE)} />
                                                                        <span
                                                                            className={cn(
                                                                                'rounded-full border border-current px-2 py-0.5 text-[10px] font-bold tracking-widest',
                                                                                FILE_TONE,
                                                                            )}
                                                                        >
                                                                            {meta.short}
                                                                        </span>
                                                                    </span>
                                                                )
                                                            )}
                                                        </button>
                                                        <div className="flex items-center gap-2 px-3 py-2.5">
                                                            <div className="min-w-0 flex-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreview(a)}
                                                                    className="hover:text-brand block w-full truncate text-left text-sm font-semibold"
                                                                >
                                                                    {a.name}
                                                                </button>
                                                                <div className="text-muted-foreground truncate font-mono text-[11px]">
                                                                    {formatSize(a.size)}
                                                                    {a.created_at ? ` · ${fmtWhen(a.created_at)}` : ''}
                                                                </div>
                                                            </div>
                                                            <a
                                                                href={a.url}
                                                                download={a.name}
                                                                aria-label={t('ticket_download')}
                                                                title={t('ticket_download')}
                                                                className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md"
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </a>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}
                            </div>
                        </div>

                        {/* ---- rail: case-status spine + dates ---- */}
                        <aside className="border-border bg-muted/30 shrink-0 border-t px-5 py-4 sm:w-[300px] sm:overflow-y-auto sm:border-t-0 sm:border-l">
                            <SectionLabel>{t('ticket_case_status')}</SectionLabel>
                            <ol className="mt-3">
                                <SpineStep
                                    tone={s1}
                                    index={1}
                                    title={t('ticket_created_event')}
                                    meta={view.requester_name ?? view.requester_code}
                                    when={fmtWhen(view.created_at)}
                                />
                                <SpineStep
                                    tone={view.status !== 'open' && !wasTaken ? 'future' : s2}
                                    index={2}
                                    title={
                                        view.status !== 'open' && wasTaken
                                            ? `${t('ticket_taken_by')} ${view.assignee_name ?? ''}`
                                            : t('ticket_waiting')
                                    }
                                    when={fmtWhen(view.responded_at)}
                                />
                                <SpineStep
                                    tone={s3}
                                    index={3}
                                    last
                                    title={
                                        view.status === 'completed'
                                            ? t('ticket_completed_event')
                                            : view.status === 'canceled'
                                              ? t('ticket_canceled_event')
                                              : t('ticket_step_closed')
                                    }
                                    when={fmtWhen(view.resolved_at)}
                                />
                            </ol>

                            <div className="bg-border/60 my-5 h-px" />
                            <SectionLabel>{t('ticket_open_by')}</SectionLabel>
                            <div className="space-y-3 pl-1">
                                <KV
                                    label={t('ticket_full_name')}
                                    value={view.requester_name ?? view.requester_code}
                                    mono={!view.requester_name}
                                />
                                <KV
                                    label={t('ticket_callback_phone')}
                                    value={
                                        view.callback_phone ? (
                                            // Click-to-call: strip the label text ("ต่อ 218" etc.) down to dialable characters.
                                            <a
                                                href={`tel:${view.callback_phone.replace(/[^\d+#*]/g, '')}`}
                                                className="hover:text-brand hover:underline"
                                            >
                                                {view.callback_phone}
                                            </a>
                                        ) : null
                                    }
                                    mono
                                />
                            </div>

                            <div className="bg-border/60 my-5 h-px" />
                            <SectionLabel>{t('ticket_responsible_by')}</SectionLabel>
                            <div className="pl-1 text-sm">
                                {view.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>}
                            </div>

                            <div className="bg-border/60 my-5 h-px" />
                            <SectionLabel>{t('ticket_section_other')}</SectionLabel>
                            <div className="space-y-3 pl-1">
                                <KV label={t('ticket_created')} value={fmtWhen(view.created_at)} mono />
                                <KV label={t('ticket_updated')} value={fmtWhen(view.updated_at)} mono />
                            </div>
                        </aside>
                    </div>

                    {/* ---- footer: role-/status-aware actions (hidden when there are none —
                         closing is covered by the ✕ / Esc / backdrop) ---- */}
                    {(canEdit || (isIT && isOpenUnassigned) || (view.status === 'in_progress' && isMine)) && (
                    <div className="border-border bg-muted/20 flex flex-row flex-wrap items-center gap-2 border-t px-6 py-3.5">
                        {canEdit && (
                            <Button variant="outline" onClick={() => onEdit(view)}>
                                <Pencil className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                        <span className="flex-1" />
                        {isIT && isOpenUnassigned && (
                            <>
                                {isSuper && (
                                    <Button variant="outline" onClick={() => onAssign(view)}>
                                        <Users className="h-4 w-4" />
                                        {t('ticket_assign_to_staff')}
                                    </Button>
                                )}
                                <Button onClick={() => onTake(view)}>
                                    <Zap className="h-4 w-4" />
                                    {t('ticket_take_case')}
                                </Button>
                            </>
                        )}
                        {view.status === 'in_progress' && isMine && (
                            <>
                                <Button variant="destructive" onClick={() => onResolve(view, 'cancel')}>
                                    <X className="h-4 w-4" />
                                    {t('ticket_mark_canceled')}
                                </Button>
                                <Button onClick={() => onResolve(view, 'complete')}>
                                    <Check className="h-4 w-4" />
                                    {t('ticket_mark_complete')}
                                </Button>
                            </>
                        )}
                    </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Attachment lightbox — images render inline, PDFs embed the browser's viewer via <iframe>. */}
            <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
                <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button]:hidden">
                    <div className="border-border flex items-center gap-3 border-b px-4 py-2.5">
                        <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{pv?.name}</DialogTitle>
                        {pv && isImagePreview && (
                            <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => zoomRef.current?.zoomOut(0.4, 250, 'easeOutCubic')}
                                    aria-label={t('ticket_zoom_out')}
                                    title={t('ticket_zoom_out')}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                                >
                                    <ZoomOut className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => zoomRef.current?.zoomIn(0.4, 250, 'easeOutCubic')}
                                    aria-label={t('ticket_zoom_in')}
                                    title={t('ticket_zoom_in')}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                                >
                                    <ZoomIn className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => zoomRef.current?.resetTransform(250, 'easeOutCubic')}
                                    aria-label={t('ticket_zoom_reset')}
                                    title={t('ticket_zoom_reset')}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setPreview(null)}
                            aria-label={t('close')}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div
                        className="bg-muted/30 flex items-center justify-center overflow-hidden"
                        onWheelCapture={(e) => {
                            const inst = zoomRef.current?.instance;
                            if (!inst) return;
                            // Smooth mode zooms by step × |deltaY| per event. A mouse notch sends ~100,
                            // a touchpad tick ~1-10 — so derive step per event: touchpads keep the fast
                            // fine-grained 0.1 feel, while the zoom per mouse notch is capped at ~0.35.
                            inst.setup.wheel.step = Math.min(0.1, 0.35 / Math.max(1, Math.abs(e.deltaY)));
                        }}
                    >
                        {pv &&
                            (isImagePreview ? (
                                // Zoom (wheel / double-click / +− buttons) and drag-to-pan via react-zoom-pan-pinch.
                                // wheel.step is only the initial value — onWheelCapture above retunes it per event.
                                <TransformWrapper
                                    key={pv.id}
                                    ref={zoomRef}
                                    minScale={1}
                                    maxScale={8}
                                    smooth
                                    wheel={{ step: 0.002 }}
                                    doubleClick={{ mode: 'toggle', animationTime: 250, animationType: 'easeOutCubic' }}
                                    zoomAnimation={{ animationTime: 250, animationType: 'easeOutCubic' }}
                                    centerOnInit
                                >
                                    <TransformComponent
                                        wrapperClass="!h-[72vh] !w-full"
                                        contentClass="!flex !h-full !w-full items-center justify-center"
                                    >
                                        <img
                                            src={pv.url}
                                            alt={pv.name}
                                            draggable={false}
                                            className="max-h-[70vh] w-auto object-contain select-none"
                                        />
                                    </TransformComponent>
                                </TransformWrapper>
                            ) : isPdfPreview ? (
                                <iframe src={pv.url} title={pv.name} className="h-[72vh] w-full border-0" />
                            ) : (
                                // Office / archive / other: no inline render — show a file card with a download action.
                                pvMeta && (
                                    <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-5 p-8 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <pvMeta.Icon strokeWidth={1.5} className={cn('h-20 w-20', FILE_TONE)} />
                                            <span
                                                className={cn(
                                                    'rounded-full border border-current px-2.5 py-0.5 text-[11px] font-bold tracking-widest',
                                                    FILE_TONE,
                                                )}
                                            >
                                                {pvMeta.short}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-base font-semibold break-all">{pv.name}</div>
                                            <div className="text-muted-foreground font-mono text-xs">
                                                {formatSize(pv.size)}
                                                {pv.created_at ? ` · ${fmtWhen(pv.created_at)}` : ''}
                                            </div>
                                            <div className="text-muted-foreground pt-1 text-xs">{t('ticket_no_inline_preview')}</div>
                                        </div>
                                        <Button asChild>
                                            <a href={pv.url} download={pv.name}>
                                                <Download className="h-4 w-4" />
                                                {t('ticket_download')}
                                            </a>
                                        </Button>
                                    </div>
                                )
                            ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
