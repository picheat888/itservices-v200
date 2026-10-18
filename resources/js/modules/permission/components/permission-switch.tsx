// The switch every permission card uses (h-5 w-9): brand fill when on, a check on the knob, a lock when off and locked.
import { cn } from '@/shared/lib/utils';
import { Check, Lock } from 'lucide-react';

export function PermissionSwitch({ label, on, locked, onClick }: { label: string; on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={locked}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand' : 'bg-muted-foreground/75')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}
