import * as React from 'react';

import { cn } from '@/shared/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
    // Neither id nor name: give it an id (set after the spread) so the browser can autofill it
    const autoId = React.useId();
    return (
        <input
            type={type}
            className={cn(
                // Brand-tinted border on hover; brand border and soft glow on focus
                'border-input bg-background file:text-foreground placeholder:text-muted-foreground hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 disabled:hover:border-input flex h-10 w-full rounded-md border px-3 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className,
            )}
            ref={ref}
            {...props}
            id={props.id ?? (props.name ? undefined : autoId)}
        />
    );
});

Input.displayName = 'Input';

export { Input };
