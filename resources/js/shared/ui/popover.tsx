import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Floating panel anchored to its trigger. Pass `container` to control where it
 * portals: inside a modal dialog you MUST portal into the dialog content node
 * (which keeps `pointer-events: auto`) — a popover portaled to <body> sits under
 * the dialog's modal guard and its clicks are dead. Omit `container` (defaults to
 * <body>) when the trigger is not inside a modal dialog.
 */
const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { container?: HTMLElement | null }
>(({ className, align = 'start', sideOffset = 6, container, ...props }, ref) => (
    <PopoverPrimitive.Portal container={container ?? undefined}>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn(
                'border-border bg-background text-foreground z-50 rounded-lg border p-3 shadow-lg outline-hidden',
                'motion-pop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
                className,
            )}
            {...props}
        />
    </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
