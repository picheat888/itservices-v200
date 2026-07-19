import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import type { ReactNode } from 'react';

/** First two initials of a name, for the avatar fallback. Shared so no page re-implements it. */
export function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/**
 * Person avatar with the app's canonical soft-brand fallback: the photo when one is
 * available, otherwise the name's initials on a `bg-brand/10 text-brand` chip. Reuse
 * this across member lists, pickers and detail views so every people avatar matches.
 *
 * `className` sizes the circle (default h-8 w-8); `textClassName` tunes the initials
 * size for smaller avatars (e.g. `text-[10px]` in dense table rows). `fallbackIcon`
 * renders instead of initials while the name is still empty (e.g. a blank create form).
 *
 * The Avatar is keyed by `photoUrl` so removing/changing the photo remounts Radix —
 * otherwise its stale "loaded" status keeps the fallback from reappearing.
 */
export function UserAvatar({
    name,
    photoUrl,
    className,
    textClassName,
    fallbackIcon,
}: {
    name: string | null | undefined;
    photoUrl?: string | null;
    className?: string;
    textClassName?: string;
    fallbackIcon?: ReactNode;
}) {
    const text = initials(name ?? '');
    return (
        <Avatar key={photoUrl ?? 'no-photo'} className={cn('h-8 w-8', className)}>
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className={cn('bg-brand/10 text-brand text-[11px] font-semibold', textClassName)}>
                {text || fallbackIcon || '?'}
            </AvatarFallback>
        </Avatar>
    );
}
