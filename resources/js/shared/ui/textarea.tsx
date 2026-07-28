import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/** Shared multi-line text field. Same rest/hover/focus language as <Input>. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={cn(
                'border-input bg-background placeholder:text-muted-foreground hover:border-brand/50 focus-visible:border-brand focus-visible:ring-brand/15 disabled:hover:border-input flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className,
            )}
            {...props}
        />
    );
});

Textarea.displayName = 'Textarea';

export { Textarea };
