import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { FileImage, FileText, Paperclip, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

/**
 * The file picker every upload form in the app shares: a drag-and-drop box, the
 * "N / max files attached" header under it, and one row per file.
 *
 * Kept here rather than in a module because three screens draw the same control
 * (Open Ticket, Edit Ticket, New Request) and they must not drift apart — the box
 * that shrinks once a file is present, the extension gate, the dedupe rule. What
 * genuinely differs between them (how many files, how large, and the sentence
 * that says so) is passed in.
 */

/** Human-readable file size (KB/MB). */
export const formatFileSize = (bytes: number) =>
    bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * Merge newly picked files into the ones already held: anything outside `accept`
 * is dropped, the same name+size is never added twice, and the cap is respected.
 * Browser MIME types are unreliable for office/zip files, so the gate is by
 * extension — the server checks the bytes.
 */
export function mergeFiles(current: File[], incoming: FileList | File[], accept: string[], max: number): File[] {
    const allowed = Array.from(incoming).filter((f) => accept.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
    const merged = [...current];
    for (const file of allowed) {
        if (merged.length >= max) break;
        if (!merged.some((m) => m.name === file.name && m.size === file.size)) merged.push(file);
    }
    return merged;
}

/** Drag & drop OR click. Shrinks to a compact bar once any file is present. */
export function FileDropZone({
    accept,
    hint,
    compact = false,
    disabled = false,
    onPick,
}: {
    /** Allowed extensions without the dot — mirrors the endpoint's `mimes` rule. */
    accept: string[];
    /** The line under the prompt spelling out types and limits — they differ per screen. */
    hint: string;
    /** Shrink the box, because the file list below it now carries the weight. */
    compact?: boolean;
    disabled?: boolean;
    onPick: (files: FileList | File[]) => void;
}) {
    const t = useT();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    const open = () => {
        if (!disabled) inputRef.current?.click();
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
            onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDragOver(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!disabled) onPick(e.dataTransfer.files);
            }}
            className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 text-center text-sm transition-colors',
                compact ? 'py-2.5' : 'py-9',
                dragOver
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-input text-muted-foreground hover:border-brand/50 hover:text-brand hover:bg-[#c4c4c40f]',
                disabled && 'pointer-events-none opacity-55',
            )}
        >
            <UploadCloud className={cn('shrink-0', compact ? 'h-5 w-5' : 'h-6 w-6')} />
            <span className="text-foreground font-medium">{t('attachment_drop')}</span>
            <span className="text-muted-foreground text-[11px]">{hint}</span>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={accept.map((e) => `.${e}`).join(',')}
                className="hidden"
                disabled={disabled}
                onChange={(e) => {
                    onPick(e.target.files ?? []);
                    e.target.value = '';
                }}
            />
        </div>
    );
}

/**
 * The count line, an optional progress bar, and the scrolling list of rows.
 *
 * Caps at ~5 rows and scrolls internally so a full set never stretches the
 * dialog. `scrollbar-gutter: stable` reserves the scrollbar's width at all times,
 * so rows (and their ✕) don't shift when it appears.
 */
export function AttachmentList({ count, max, progressPct, children }: { count: number; max: number; progressPct?: number; children: ReactNode }) {
    const t = useT();

    return (
        <div className="mt-3.5">
            <div className="text-brand mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold">
                <Paperclip className="h-3.5 w-3.5" />
                {t('attachment_count').replace('{n}', String(count)).replace('{max}', String(max))}
                {progressPct != null && <span className="ml-auto font-mono">{progressPct}%</span>}
            </div>
            {/* One overall bar, outside the scroll area, so progress stays visible
                however many files have scrolled off. */}
            {progressPct != null && (
                <div className="bg-muted mb-2.5 h-1.5 overflow-hidden rounded-full">
                    <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
            )}
            <div className="max-h-[196px] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">{children}</div>
        </div>
    );
}

/** One file: kind icon, name, size, and a ✕ when it may still be taken back. */
export function AttachmentRow({
    name,
    size,
    mime,
    href,
    onRemove,
}: {
    name: string;
    size: number;
    mime?: string | null;
    /** A saved file's authenticated download URL — the name becomes a link to it. */
    href?: string;
    onRemove?: () => void;
}) {
    const t = useT();

    return (
        <div className="border-border/60 flex items-center gap-2.5 border-b px-1 py-2 last:border-b-0">
            <span className="text-muted-foreground shrink-0">
                {mime?.startsWith('image/') ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            {href ? (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-brand min-w-0 flex-1 truncate text-[13px] font-medium hover:underline"
                >
                    {name}
                </a>
            ) : (
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
            )}
            <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{formatFileSize(size)}</span>
            {onRemove && (
                <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive hover:bg-accent grid h-6 w-6 shrink-0 place-items-center rounded-md"
                    onClick={onRemove}
                    aria-label={t('delete')}
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
