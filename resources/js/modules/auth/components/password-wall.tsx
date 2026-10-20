// The password dialogs an account must finish before using the app: set its own password, or change an expired one.
// Stays mounted through the close animation after the password is saved.
import { SHEET_CLOSE_MS, usePresence } from '@/shared/hooks/use-presence';
import type { User } from '@/shared/types';
import { useState } from 'react';
import { ChangePasswordDialog } from './change-password-dialog';
import { SetPasswordDialog } from './set-password-dialog';

type Wall = 'set' | 'expired';

export function PasswordWall({ user }: { user: User | null | undefined }) {
    const wall: Wall | null = user?.must_change_password ? 'set' : user?.password_expired ? 'expired' : null;
    const { mounted } = usePresence(wall !== null, SHEET_CLOSE_MS);

    // The dialog on screen, kept once the flag clears so the closing one is the one that was open
    const [shown, setShown] = useState(wall);
    if (wall && wall !== shown) setShown(wall);

    if (!mounted || !shown) return null;
    return shown === 'set' ? <SetPasswordDialog open={wall !== null} /> : <ChangePasswordDialog open={wall !== null} />;
}
