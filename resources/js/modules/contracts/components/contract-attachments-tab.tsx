import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { type ContractAttachment } from '@/shared/types';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Split a filename into [head, tail] for middle-truncation, keeping the extension visible. */
function splitName(name: string): [string, string] {
    const TAIL = 9; // keep this many chars on the right (covers ".pdf" + a few)
    if (name.length <= TAIL + 4) return [name, ''];
    return [name.slice(0, name.length - TAIL), name.slice(-TAIL)];
}

/** A filename rendered with a middle ellipsis: head truncates, tail (incl. extension) stays. */
function TruncName({ name, className }: { name: string; className?: string }) {
    const [head, tail] = splitName(name);
    return (
        <span className={cn('flex min-w-0', className)} title={name}>
            <span className="truncate">{head}</span>
            <span className="shrink-0 whitespace-nowrap">{tail}</span>
        </span>
    );
}

/** Attachments tab: file list on the left, an in-dialog PDF preview filling the frame on the right. */
export function ContractAttachmentsTab({ attachments }: { attachments: ContractAttachment[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [selected, setSelected] = useState(0);

    if (attachments.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <FileText className="text-muted-foreground/50 h-8 w-8" />
                {t('attachment_none')}
            </div>
        );
    }

    const active = attachments[Math.min(selected, attachments.length - 1)];

    return (
        <div className="grid h-full grid-cols-[280px_1fr] gap-4">
            {/* File list — own scroll; contracts cap attachments at 5 so it stays short. */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                {attachments.map((a, i) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelected(i)}
                        className={cn(
                            'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            i === selected ? 'border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--brand)]' : 'border-border hover:bg-accent/50',
                        )}
                    >
                        <span className="bg-destructive/10 text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-extrabold">
                            PDF
                        </span>
                        <span className="min-w-0 flex-1">
                            <TruncName name={a.name} className="text-[13px] font-semibold" />
                            <span className="text-muted-foreground block font-mono text-[11.5px]">{formatSize(a.size)}</span>
                        </span>
                    </button>
                ))}
            </div>

            {/* Preview — iframe fills the frame. */}
            <div className="border-border flex min-h-0 flex-col overflow-hidden rounded-xl border">
                <div className="border-border/60 bg-card flex items-center gap-2 border-b px-3 py-2">
                    <TruncName name={active.name} className="flex-1 text-[12.5px] font-semibold" />
                    <a
                        href={active.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {lang === 'th' ? 'เปิดแท็บใหม่' : 'Open in new tab'}
                    </a>
                    <a
                        href={active.url}
                        download
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {lang === 'th' ? 'ดาวน์โหลด' : 'Download'}
                    </a>
                </div>
                <iframe key={active.id} src={active.url} title={active.name} className="min-h-0 flex-1 bg-[#525659]" />
            </div>
        </div>
    );
}
