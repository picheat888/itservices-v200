// A small note on a figure that opens on hover, tap (iPad) or Enter/Space — a tooltip that touch and keyboard can reach.
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Side = 'top' | 'right' | 'left';

/** Space kept between a note and the top of the scrolling area. */
const VIEW_GAP = 8;

export function InfoPopover({
    label,
    content,
    children,
    className,
    contentClassName,
    style,
    side = 'top',
    anchor,
}: {
    /** What a screen reader hears for the trigger. */
    label: string;
    content: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    style?: React.CSSProperties;
    /** Where the note opens: above by default; beside a tall trigger such as a whole chart column. */
    side?: 'top' | 'right';
    /** A point to open from instead of the trigger (a chart bar's top); the note moves to its left when there is no room above. */
    anchor?: () => DOMRect | null;
}) {
    const [open, setOpen] = useState(false);
    const [place, setPlace] = useState<Side>(side);
    const closing = useRef<number | null>(null);
    const openedByHover = useRef(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const [note, setNote] = useState<HTMLDivElement | null>(null);
    // The page's scrolling area starts under the top bar; a bar top scrolled out of it is held at its edge
    const viewTop = useCallback(() => (trigger.current?.closest('main')?.getBoundingClientRect().top ?? 0) + VIEW_GAP, []);
    const anchorInView = useCallback(() => {
        const at = anchor?.();
        if (!at) return null;
        const top = Math.max(at.top, viewTop());
        return top === at.top ? at : new DOMRect(at.left, top, at.width, 0);
    }, [anchor, viewTop]);
    const virtualRef = useMemo(
        () => ({ current: { getBoundingClientRect: () => anchorInView() ?? trigger.current?.getBoundingClientRect() ?? new DOMRect() } }),
        [anchorInView],
    );

    // Above the bar while the note fits in view between it and the top of the trigger, else beside it on the left
    useLayoutEffect(() => {
        if (!open || !anchor || !note) return;
        const at = anchorInView();
        const box = trigger.current?.getBoundingClientRect();
        if (at && box) setPlace(at.top - Math.max(box.top, viewTop()) >= note.offsetHeight + 8 ? 'top' : 'left');
    }, [open, anchor, anchorInView, viewTop, note]);

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
            {anchor && <PopoverAnchor virtualRef={virtualRef} />}
            <PopoverTrigger
                ref={trigger}
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
                style={style}
            >
                {children}
            </PopoverTrigger>
            <PopoverContent
                ref={setNote}
                side={anchor ? place : side}
                align={anchor && place === 'left' ? 'start' : 'center'}
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
