// Shared note on a figure: opens on hover, tap (iPad) or Enter/Space, so touch and keyboard reach it too.
// A click can run onActivate instead (e.g. open the record) while a tap still shows the note.
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { claimOpenNote, releaseOpenNote } from '@/shared/lib/one-open-note';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Side = 'top' | 'right' | 'left';

/** Space kept between a note and the top of the scrolling area. */
const VIEW_GAP = 8;

/** A second tap within this time is a double tap. */
const DOUBLE_TAP_MS = 300;

export function InfoPopover({
    label,
    content,
    children,
    className,
    contentClassName,
    style,
    side = 'top',
    anchor,
    onActivate,
    as = 'button',
    tabbable = true,
    isolate = false,
    openOnFocus = false,
    inactive = false,
    disabled = false,
    doubleTapInRow = false,
    shown = false,
    hideFromReaders = false,
}: {
    /** What a screen reader hears for the trigger. */
    label: string;
    /** The note; a function gets `close` for a button inside it. */
    content: React.ReactNode | ((close: () => void) => React.ReactNode);
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    style?: React.CSSProperties;
    /** Where the note opens: above by default; beside a tall trigger such as a whole chart column. */
    side?: 'top' | 'right';
    /** A point to open from instead of the trigger (a chart bar's top); the note moves to its left when there is no room above. */
    anchor?: () => DOMRect | null;
    /** A mouse click or Enter runs this instead of pinning the note; a tap still opens the note. */
    onActivate?: () => void;
    /** 'span' wraps another control (a disabled button) instead of being the button itself. */
    as?: 'button' | 'span';
    /** False keeps a chart's many bars out of the Tab order (the chart carries its own summary). */
    tabbable?: boolean;
    /** Keep clicks and Enter/Space on the trigger or the note from reaching a clickable row around it. */
    isolate?: boolean;
    /** Keyboard focus opens the note and leaving closes it, like a tooltip. */
    openOnFocus?: boolean;
    /** Span mode only: render the plain wrapper with no note, so its child is not rebuilt when a note comes and goes. */
    inactive?: boolean;
    /** Span mode only: tell assistive tech the wrapped control is unavailable. */
    disabled?: boolean;
    /** Inside a clickable row ([data-row-click]): a tap shows the note, a double tap opens the row. */
    doubleTapInRow?: boolean;
    /** Keeps the note open while true, e.g. while the control it describes has keyboard focus. */
    shown?: boolean;
    /** Button mode: hide the trigger from assistive tech, for a note a control already reads. */
    hideFromReaders?: boolean;
}) {
    const [openState, setOpen] = useState(false);
    const open = (openState || shown) && !inactive;
    const close = useCallback(() => setOpen(false), []);
    // One note at a time: opening this one closes the last
    useEffect(() => {
        if (!open) return;
        claimOpenNote(close);
        return () => releaseOpenNote(close);
    }, [open, close]);
    const [place, setPlace] = useState<Side>(side);
    const closing = useRef<number | null>(null);
    const openedByHover = useRef(false);
    const pressedBy = useRef<string | null>(null);
    const tapTimer = useRef<number | null>(null);
    const trigger = useRef<HTMLElement>(null);
    useEffect(
        () => () => {
            if (tapTimer.current) window.clearTimeout(tapTimer.current);
        },
        [],
    );
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

    const triggerProps = {
        onPointerEnter: hover(true),
        onPointerLeave: hover(false),
        onPointerDown: (event: React.PointerEvent) => (pressedBy.current = event.pointerType),
        onFocus: (event: React.FocusEvent<HTMLElement>) => openOnFocus && event.currentTarget.matches(':focus-visible') && setOpen(true),
        onBlur: () => openOnFocus && setOpen(false),
        onClick: (event: React.MouseEvent) => {
            if (isolate) event.stopPropagation();
            const by = pressedBy.current;
            pressedBy.current = null;
            const row = doubleTapInRow && by === 'touch' ? trigger.current?.closest<HTMLElement>('[data-row-click]') : null;
            if (row) {
                // First tap shows the note; a second one within DOUBLE_TAP_MS opens the row
                event.preventDefault();
                if (tapTimer.current) {
                    window.clearTimeout(tapTimer.current);
                    tapTimer.current = null;
                    setOpen(false);
                    row.click();
                    return;
                }
                setOpen(true);
                tapTimer.current = window.setTimeout(() => (tapTimer.current = null), DOUBLE_TAP_MS);
                return;
            }
            if (onActivate && by !== 'touch') {
                event.preventDefault();
                openedByHover.current = false;
                setOpen(false);
                onActivate();
                return;
            }
            if (openedByHover.current) {
                event.preventDefault();
                openedByHover.current = false;
            }
        },
        className: cn('focus-visible:ring-ring cursor-help rounded-sm focus-visible:ring-2 focus-visible:outline-none', className),
        style,
    };

    return (
        <Popover open={open} onOpenChange={(next) => !inactive && setOpen(next)}>
            {anchor && <PopoverAnchor virtualRef={virtualRef} />}
            <PopoverTrigger asChild>
                {as === 'span' && inactive ? (
                    // Same element as the live wrapper, minus every trigger attribute
                    <span
                        ref={trigger}
                        className={className}
                        style={style}
                        aria-haspopup={undefined}
                        aria-expanded={undefined}
                        aria-controls={undefined}
                        data-state={undefined}
                    >
                        {children}
                    </span>
                ) : as === 'span' ? (
                    <span
                        ref={trigger}
                        role="button"
                        tabIndex={tabbable ? 0 : -1}
                        aria-label={label}
                        aria-disabled={disabled || undefined}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            if (isolate) event.stopPropagation();
                            event.preventDefault();
                            setOpen((now) => !now);
                        }}
                        {...triggerProps}
                    >
                        {children}
                    </span>
                ) : (
                    <button
                        ref={trigger as React.RefObject<HTMLButtonElement>}
                        type="button"
                        tabIndex={tabbable ? undefined : -1}
                        aria-hidden={hideFromReaders || undefined}
                        aria-label={label}
                        {...triggerProps}
                    >
                        {children}
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent
                ref={setNote}
                side={anchor ? place : side}
                align={anchor && place === 'left' ? 'start' : 'center'}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onPointerEnter={hover(true)}
                onPointerLeave={hover(false)}
                // The note is portalled, but React still bubbles its clicks to the row around the trigger
                onClick={isolate ? (event) => event.stopPropagation() : undefined}
                className={cn('w-auto max-w-xs px-3 py-2 text-left text-xs font-normal whitespace-normal', contentClassName)}
            >
                {typeof content === 'function' ? content(() => setOpen(false)) : content}
            </PopoverContent>
        </Popover>
    );
}

/** One row of a chart's note: a mark, the words, the number on the right (same shape as the report's). */
export function NoteRow({ mark, text, value, muted }: { mark?: React.ReactNode; text: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
    const fmtN = useNumberFormat();
    return (
        <div className={cn('flex items-center justify-between gap-4', muted && 'text-muted-foreground')}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
                {mark}
                <span className="truncate">{text}</span>
            </span>
            <b className={cn('tabular-nums', muted && 'font-normal')}>{typeof value === 'number' ? fmtN(value) : value}</b>
        </div>
    );
}
