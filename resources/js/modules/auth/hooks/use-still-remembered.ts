// Whether the signed-in account is still remembered; re-renders when the remember period ends, so the idle timeout starts then as the server's does.
import { stillRemembered } from '@/modules/auth/lib/session-warning';
import type { User } from '@/shared/types';
import { useEffect, useState } from 'react';

// setTimeout's longest delay; a remember period is 7 days, far below it
const MAX_TIMER_MS = 2_147_483_647;

export function useStillRemembered(user: Pick<User, 'remembered' | 'remember_expires_at'> | null): boolean {
    const remembered = user?.remembered ?? false;
    const expiresAt = user?.remember_expires_at ?? null;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const end = remembered && expiresAt ? Date.parse(expiresAt) : NaN;
        if (!Number.isFinite(end)) return;
        const id = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(end - Date.now() + 1000, MAX_TIMER_MS)));
        return () => clearTimeout(id);
    }, [remembered, expiresAt]);

    return stillRemembered(remembered, expiresAt, now);
}
