import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** First two initials of a name, used for the avatar fallback. */
function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

type StackMember = { id?: number; name: string | null };

/**
 * Overlapping circle of member avatars. Shows up to `max` avatars (each ringed
 * against the card so the overlap reads cleanly) plus a "+N" bubble when there
 * are more members than fit.
 */
export function AvatarStack({ members, max = 5 }: { members: StackMember[]; max?: number }) {
    if (!members || members.length === 0) {
        return <span className="text-muted-foreground text-sm">—</span>;
    }
    const shown = members.slice(0, max);
    const more = members.length - shown.length;

    return (
        <div className="flex items-center">
            {shown.map((m, i) => (
                <Avatar key={m.id ?? i} className={cn('ring-card h-7 w-7 ring-2', i > 0 && '-ml-2')}>
                    <AvatarFallback className="text-[10px] font-semibold">{initials(m.name ?? '?')}</AvatarFallback>
                </Avatar>
            ))}
            {more > 0 && (
                <div className="ring-card bg-muted text-muted-foreground -ml-2 grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2">
                    +{more}
                </div>
            )}
        </div>
    );
}
