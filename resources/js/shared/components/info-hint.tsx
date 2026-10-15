// Small (i) icon whose hint opens on hover, tap (iPad) or Enter, through the shared InfoPopover note.
import { InfoPopover } from '@/shared/components/info-popover';
import { cn } from '@/shared/lib/utils';
import { Info } from 'lucide-react';

export function InfoHint({ text, className }: { text: string; className?: string }) {
    return (
        <InfoPopover
            openOnFocus
            label={text}
            // Newlines in a hint are meant: one line per thing a permission grants
            content={<span className="leading-relaxed whitespace-pre-line">{text}</span>}
            contentClassName="max-w-[240px]"
            className={cn(
                'text-muted-foreground/70 hover:text-brand focus-visible:text-brand relative inline-flex rounded-full before:absolute before:-inset-1.5 before:content-[""]',
                className,
            )}
        >
            <Info className="h-3.5 w-3.5" aria-hidden />
        </InfoPopover>
    );
}
