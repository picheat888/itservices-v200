import { UserAvatar } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';

/** Member shape accepted by the stack — mirrors the API previews (snake_case photo field). */
export type AvatarStackMember = { id?: number; name: string | null; photo_url?: string | null };

/**
 * Overlapping circle of member avatars built on the shared UserAvatar, so each
 * circle shows the member's photo when available and the canonical brand-chip
 * initials fallback otherwise. Shows up to `max` avatars (each ringed against
 * the card so the overlap reads cleanly) plus a "+N" bubble when there are more.
 */
export function AvatarStack({ members, max = 5 }: { members: AvatarStackMember[]; max?: number }) {
    if (!members || members.length === 0) {
        return <span className="text-muted-foreground text-sm">—</span>;
    }
    const shown = members.slice(0, max);
    const more = members.length - shown.length;

    return (
        <div className="flex items-center">
            {shown.map((m, i) => (
                <UserAvatar
                    key={m.id ?? i}
                    name={m.name}
                    photoUrl={m.photo_url}
                    className={cn('ring-card h-7 w-7 ring-2', i > 0 && '-ml-2')}
                    // Opaque brand chip: the default `bg-brand/10` is translucent, so in an
                    // overlapping stack the circle behind shows through. color-mix bakes the
                    // same 10% tint onto the card colour instead, hiding whatever is beneath.
                    textClassName="text-[10px] bg-[color-mix(in_oklch,var(--brand)_10%,var(--card))]"
                />
            ))}
            {more > 0 && (
                // `relative` lifts the bubble above the (positioned) Radix avatars so it shows as
                // a full circle; `min-w-7` + padding lets big counts (+100…) grow into a pill
                // instead of clipping inside the fixed circle.
                <div className="ring-card bg-muted text-muted-foreground relative -ml-2 grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ring-2">
                    +{more}
                </div>
            )}
        </div>
    );
}
