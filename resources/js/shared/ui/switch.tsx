import { cn } from '@/shared/lib/utils';

/**
 * Small on/off toggle (h-5 w-9) matching the permission-matrix / stock-tree switches.
 * Controlled: pass `checked` and handle `onChange`.
 */
export function Switch({
    checked,
    onChange,
    disabled,
    'aria-label': ariaLabel,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    'aria-label'?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'focus-visible:ring-brand/40 relative h-5 w-9 shrink-0 rounded-full transition-[background-color,filter] focus-visible:ring-[3px] focus-visible:outline-hidden enabled:hover:brightness-95 disabled:opacity-50 dark:enabled:hover:brightness-125',
                // Off track kept at 3:1 against card and muted surfaces in both themes
                checked ? 'bg-brand' : 'bg-muted-foreground/80 dark:bg-muted-foreground/60',
            )}
        >
            <span
                className={cn(
                    'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none',
                    checked && 'translate-x-4',
                )}
            />
        </button>
    );
}
