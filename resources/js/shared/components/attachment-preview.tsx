import { useT } from '@/lang';
import { formatFileSize } from '@/shared/components/file-drop-zone';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Download, File, FileArchive, FileSpreadsheet, FileText, Presentation, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

/**
 * The in-app viewer for a saved attachment: images open in a zoom/pan lightbox,
 * PDFs embed the browser's own viewer, and everything else shows a file card
 * with a download action instead of a broken frame.
 *
 * Kept here rather than in a module because Ticket and Request both hold files
 * of the same kinds and must not drift apart — the classification, the icons and
 * the three preview modes are one decision, made once.
 *
 * Every url here is an authenticated route on the private disk (FileController),
 * streamed inline — so <img> and <iframe> work on the session cookie alone.
 */

/** The shape each module's attachment resource already returns. */
export type PreviewFile = {
    id: number;
    name: string;
    size: number;
    mime?: string | null;
    url: string;
    created_at?: string | null;
};

/** Broad file category derived from mime + extension — drives the icon and the preview mode. */
export type FileKind = 'image' | 'pdf' | 'word' | 'excel' | 'ppt' | 'archive' | 'other';

/** Classify an attachment. Only image and pdf can be previewed inline; the rest show a file card. */
export function fileKind(file: { name: string; mime?: string | null }): FileKind {
    const mime = file.mime ?? '';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (ext === 'doc' || ext === 'docx') return 'word';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel';
    if (ext === 'ppt' || ext === 'pptx') return 'ppt';
    if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'archive';
    return 'other';
}

/** Icon + short format keyword per non-image file kind (keyword is a format name, not translated). */
export const KIND_META: Record<Exclude<FileKind, 'image'>, { Icon: typeof FileText; short: string }> = {
    pdf: { Icon: FileText, short: 'PDF' },
    word: { Icon: FileText, short: 'WORD' },
    excel: { Icon: FileSpreadsheet, short: 'EXCEL' },
    ppt: { Icon: Presentation, short: 'PPT' },
    archive: { Icon: FileArchive, short: 'ZIP' },
    other: { Icon: File, short: 'FILE' },
};

/** One solid muted tone for every file icon/badge — minimal, monochrome (not translucent); the kind reads from the keyword. */
export const FILE_TONE = 'text-muted-foreground';

/**
 * The lightbox itself. `file` is what the caller wants shown; null closes it.
 *
 * `shown` keeps the last file on screen through the dialog's exit animation, so
 * closing fades the picture out instead of blanking the frame first. The caller
 * therefore only has to hold one piece of state.
 *
 * `meta` adds a phrase after the size on the file card — a module that knows when
 * the file arrived can pass that in. It is a function of the file rather than a
 * string so it still reads during the exit animation, when `file` is already null.
 */
export function AttachmentPreview({ file, onClose, meta }: { file: PreviewFile | null; onClose: () => void; meta?: (file: PreviewFile) => string }) {
    const t = useT();

    const shownRef = useRef<PreviewFile | null>(null);
    if (file) shownRef.current = file;
    const pv = file ?? shownRef.current;

    // Imperative zoom controls for the image lightbox (react-zoom-pan-pinch).
    const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);

    const kind = pv ? fileKind(pv) : 'other';
    const isImage = kind === 'image';
    const isPdf = kind === 'pdf';
    const kindMeta = isImage ? null : KIND_META[kind];

    return (
        <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button]:hidden">
                <div className="border-border flex items-center gap-3 border-b px-4 py-2.5">
                    <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{pv?.name}</DialogTitle>
                    {pv && isImage && (
                        <div className="flex shrink-0 items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => zoomRef.current?.zoomOut(0.4, 250, 'easeOutCubic')}
                                aria-label={t('attachment_zoom_out')}
                                title={t('attachment_zoom_out')}
                                className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => zoomRef.current?.zoomIn(0.4, 250, 'easeOutCubic')}
                                aria-label={t('attachment_zoom_in')}
                                title={t('attachment_zoom_in')}
                                className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => zoomRef.current?.resetTransform(250, 'easeOutCubic')}
                                aria-label={t('attachment_zoom_reset')}
                                title={t('attachment_zoom_reset')}
                                className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                    <button type="button" onClick={onClose} aria-label={t('close')} className="text-muted-foreground hover:text-foreground shrink-0">
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
                        (isImage ? (
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
                                <TransformComponent wrapperClass="!h-[72vh] !w-full" contentClass="!flex !h-full !w-full items-center justify-center">
                                    <img src={pv.url} alt={pv.name} draggable={false} className="max-h-[70vh] w-auto object-contain select-none" />
                                </TransformComponent>
                            </TransformWrapper>
                        ) : isPdf ? (
                            <iframe src={pv.url} title={pv.name} className="h-[72vh] w-full border-0" />
                        ) : (
                            // Office / archive / other: no inline render — show a file card with a download action.
                            kindMeta && (
                                <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-5 p-8 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <kindMeta.Icon strokeWidth={1.5} className={cn('h-20 w-20', FILE_TONE)} />
                                        <span
                                            className={cn(
                                                'rounded-full border border-current px-2.5 py-0.5 text-[11px] font-bold tracking-widest',
                                                FILE_TONE,
                                            )}
                                        >
                                            {kindMeta.short}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-base font-semibold break-all">{pv.name}</div>
                                        <div className="text-muted-foreground font-mono text-xs">
                                            {formatFileSize(pv.size)}
                                            {meta?.(pv) ? ` · ${meta(pv)}` : ''}
                                        </div>
                                        <div className="text-muted-foreground pt-1 text-xs">{t('attachment_no_inline_preview')}</div>
                                    </div>
                                    <Button asChild>
                                        <a href={pv.url} download={pv.name}>
                                            <Download className="h-4 w-4" />
                                            {t('attachment_download')}
                                        </a>
                                    </Button>
                                </div>
                            )
                        ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
