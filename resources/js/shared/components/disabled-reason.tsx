// Says why a control is disabled: hover, tap (iPad), or Tab onto it opens the reason in the shared InfoPopover note.
// The wrapper stays put without a reason, so the control is not rebuilt (and keeps focus) when it turns on or off.
import { InfoPopover } from '@/shared/components/info-popover';
import { cn } from '@/shared/lib/utils';

export function DisabledReason({
    reason,
    label,
    children,
    className,
}: {
    /** Why the control is off; empty when it is on. */
    reason?: string | null;
    /** The control's own name, read before the reason (an icon button has no text of its own). */
    label?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <InfoPopover
            as="span"
            inactive={!reason}
            disabled
            isolate
            openOnFocus
            label={label ? `${label}: ${reason}` : (reason ?? '')}
            content={<span className="whitespace-pre-line">{reason}</span>}
            contentClassName="max-w-[260px]"
            // The disabled control lets the pointer through to this wrapper
            className={cn('inline-flex rounded-md [&>:disabled]:pointer-events-none', reason && 'cursor-not-allowed', className)}
        >
            {children}
        </InfoPopover>
    );
}
