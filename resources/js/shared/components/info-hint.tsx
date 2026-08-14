import { cn } from '@/shared/lib/utils';
import { Info } from 'lucide-react';

/**
 * A small (i) icon that reveals a styled tooltip on hover/focus — a themed
 * replacement for the native `title` attribute. Used for permission hints etc.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
    return (
        <span className={cn('group/hint relative inline-flex', className)}>
            <button
                type="button"
                aria-label={text}
                className="text-muted-foreground/70 hover:text-brand focus-visible:text-brand inline-flex cursor-help rounded-full outline-none"
            >
                <Info className="h-3.5 w-3.5" />
            </button>
            <span
                role="tooltip"
                className={cn(
                    'border-border bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px]',
                    // Newlines in a hint are meant: a permission that grants three separate
                    // things reads as three lines, not one sentence with dashes in it.
                    '-translate-x-1/2 scale-95 rounded-lg border px-3 py-2 text-xs leading-relaxed font-normal whitespace-pre-line opacity-0 shadow-lg',
                    'transition-[opacity,transform] duration-150 group-hover/hint:scale-100 group-hover/hint:opacity-100',
                    'group-focus-within/hint:scale-100 group-focus-within/hint:opacity-100',
                )}
            >
                {text}
                {/* Arrow */}
                <span className="border-border bg-popover absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-r border-b" />
            </span>
        </span>
    );
}
