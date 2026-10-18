// Colour bar of a role template (Role Templates list, Role Groups table and role select); grey when no colour is known.
import { cn } from '@/shared/lib/utils';

export function RoleBar({ color, className }: { color: string | null | undefined; className?: string }) {
    return (
        <span
            className={cn('h-4 w-1.5 shrink-0 rounded', !color && 'bg-muted-foreground/40', className)}
            style={color ? { background: color } : undefined}
            aria-hidden
        />
    );
}
