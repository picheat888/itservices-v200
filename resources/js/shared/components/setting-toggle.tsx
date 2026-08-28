import { cn } from '@/shared/lib/utils';
import { Check } from 'lucide-react';

/**
 * The on/off pill used by the settings lists — a filled brand track with a tick in the knob
 * when on.
 *
 * Distinct from shared/ui/switch on purpose: this one carries the tick, and the Email and
 * Notification tabs of one page must not look like two different products. It lived inside
 * the email page until the Notification tab needed the same control.
 */
export function SettingToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
            </span>
        </button>
    );
}
