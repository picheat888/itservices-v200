import { useT } from '@/lang';
import { EmptyPane } from '@/shared/components/empty-pane';
import { formatFileSize } from '@/shared/components/file-drop-zone';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { type ContractAttachment } from '@/shared/types';
import { Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';

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
    const [selected, setSelected] = useState(0);

    if (attachments.length === 0) {
        return <EmptyPane kind="empty" title={t('contract_empty_drawer_attachments')} hint={t('contract_empty_drawer_attachments_hint')} />;
    }

    const active = attachments[Math.min(selected, attachments.length - 1)];

    return (
        <div className="flex h-full flex-col gap-4 lg:grid lg:grid-cols-[280px_1fr]">
            {/* File list — own scroll; contracts cap attachments at 5 so it stays short. */}
            <div className="flex max-h-40 shrink-0 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none">
                {attachments.map((a, i) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelected(i)}
                        aria-pressed={i === selected}
                        className={cn(
                            'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            i === selected ? 'border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--brand)]' : 'border-border hover:bg-accent/50',
                        )}
                    >
                        <span className="bg-destructive/10 dark:text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold text-red-700">
                            PDF
                        </span>
                        <span className="min-w-0 flex-1">
                            <TruncName name={a.name} className="text-[13px] font-semibold" />
                            <span className="text-muted-foreground block text-[11.5px]">{formatFileSize(a.size)}</span>
                        </span>
                    </button>
                ))}
            </div>

            {/* Preview — iframe fills the frame. */}
            <div className="border-border flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border lg:min-h-0">
                <div className={cn(CARD_HEADING, 'border-border/60 flex items-center gap-2 border-b px-3 py-2')}>
                    <TruncName name={active.name} className="flex-1 text-[12.5px] font-semibold" />
                    <a
                        href={active.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('contract_open_new_tab')}
                    </a>
                    <a
                        href={active.url}
                        download
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {t('contract_download')}
                    </a>
                </div>
                <iframe key={active.id} src={active.url} title={active.name} className="min-h-0 flex-1 bg-[#525659]" />
            </div>
        </div>
    );
}
