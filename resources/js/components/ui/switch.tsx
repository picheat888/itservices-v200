import { cn } from '@/lib/utils';

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
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-muted')}
        >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[1.125rem]' : 'left-0.5')} />
        </button>
    );
}
