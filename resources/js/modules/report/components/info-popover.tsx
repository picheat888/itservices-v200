// A small note on a figure that opens on hover, tap (iPad) or Enter/Space — a tooltip that touch and keyboard can reach.
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useRef, useState } from 'react';

export function InfoPopover({
    label,
    content,
    children,
    className,
    contentClassName,
    side = 'top',
}: {
    /** What a screen reader hears for the trigger. */
    label: string;
    content: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    /** Where the note opens: above by default; beside a tall trigger such as a whole chart column. */
    side?: 'top' | 'right';
}) {
    const [open, setOpen] = useState(false);
    const closing = useRef<number | null>(null);
    const openedByHover = useRef(false);
    const hover = (next: boolean) => (event: React.PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        if (closing.current) window.clearTimeout(closing.current);
        if (next) {
            openedByHover.current = !open;
            setOpen(true);
        } else closing.current = window.setTimeout(() => setOpen(false), 80);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                type="button"
                aria-label={label}
                onPointerEnter={hover(true)}
                onPointerLeave={hover(false)}
                onClick={(event) => {
                    if (openedByHover.current) {
                        event.preventDefault();
                        openedByHover.current = false;
                    }
                }}
                className={cn('focus-visible:ring-ring cursor-help rounded-sm focus-visible:ring-2 focus-visible:outline-none', className)}
            >
                {children}
            </PopoverTrigger>
            <PopoverContent
                side={side}
                align="center"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onPointerEnter={hover(true)}
                onPointerLeave={hover(false)}
                className={cn('w-auto max-w-xs px-3 py-2 text-left font-sans text-xs font-normal whitespace-normal', contentClassName)}
            >
                {content}
            </PopoverContent>
        </Popover>
    );
}
