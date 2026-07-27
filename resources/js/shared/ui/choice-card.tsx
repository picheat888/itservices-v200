import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Selectable card button used by "pick one" grids (Ticket issue type, Asset
 * property type, Contract type). Owns only the interactive states — resting
 * border, brand hover, keyboard focus ring, latched selected glow, and the
 * invalid (red) border. Layout, radius and padding stay with the caller via
 * className/children, the same way Input centralises text-field states.
 */
const ChoiceCard = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> & {
        /** Marks this card as the picked option — latches the brand border + soft glow. */
        selected?: boolean;
        /** Validation failed (nothing picked yet) — tints the resting border red. */
        invalid?: boolean;
    }
>(({ className, selected, invalid, type = 'button', ...props }, ref) => (
    <button
        ref={ref}
        type={type}
        className={cn(
            'focus-visible:border-brand focus-visible:ring-brand/15 border transition-colors focus:outline-hidden focus-visible:ring-[3px]',
            selected
                ? 'border-brand bg-brand/5 ring-brand/15 ring-[3px]'
                : invalid
                  ? 'border-destructive hover:border-brand/50'
                  : 'border-border hover:border-brand/50',
            className,
        )}
        {...props}
    />
));
ChoiceCard.displayName = 'ChoiceCard';

export { ChoiceCard };
