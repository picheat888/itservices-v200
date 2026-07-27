import * as React from 'react';

import { cn, dateFieldClass } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

/**
 * Native `<input type="date">` with the shared date chrome (mono digits, right
 * padding for an overlaid <Calendar> icon, full-cover invisible picker trigger).
 *
 * The full-cover `::-webkit-calendar-picker-indicator` opens the native picker on
 * click but does NOT hand focus to the input, so the brand focus ring never
 * latched on click (it worked on Tab). Forcing `focus()` on pointer-down fixes
 * that while keeping the "click anywhere to open the picker" behavior. Any caller
 * `onPointerDown` still runs afterwards.
 */
export const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, onPointerDown, ...props }, ref) => (
        <Input
            ref={ref}
            type="date"
            className={cn(dateFieldClass, className)}
            onPointerDown={(e) => {
                e.currentTarget.focus();
                onPointerDown?.(e);
            }}
            {...props}
        />
    ),
);

DateInput.displayName = 'DateInput';
