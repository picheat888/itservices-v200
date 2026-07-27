import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/** Shared multi-line text field. Same rest/hover/focus language as <Input>. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={cn(
                'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground hover:border-brand/50 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
                className,
            )}
            {...props}
        />
    );
});

Textarea.displayName = 'Textarea';

export { Textarea };
