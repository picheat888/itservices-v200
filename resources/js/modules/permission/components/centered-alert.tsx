// Permission-module face of the shared centred alert: the same props as before, with a failed save worded by the server's refusal code.
import { useT } from '@/lang';
import { CenteredAlert as SharedCenteredAlert } from '@/shared/ui/confirm-dialog';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { permissionRefusalText } from '../lib/refusal';

export function CenteredAlert({
    open,
    icon,
    title,
    children,
    actions,
    busy,
    error,
    returnFocus,
    onClose,
}: {
    open: boolean;
    icon: LucideIcon;
    title: ReactNode;
    children: ReactNode;
    /** Buttons share the row equally; one fills it. */
    actions: ReactNode;
    /** While true the alert cannot be dismissed (a save is running). */
    busy?: boolean;
    /** A failed save, worded by the server's refusal code. */
    error?: unknown;
    /** Where focus goes on close when the control that opened the alert is gone or disabled. */
    returnFocus?: () => HTMLElement | null | undefined;
    onClose: () => void;
}) {
    const t = useT();

    return (
        <SharedCenteredAlert
            open={open}
            icon={icon}
            title={title}
            actions={actions}
            busy={busy}
            errorText={error != null ? permissionRefusalText(error, t) : undefined}
            returnFocus={returnFocus}
            onClose={onClose}
        >
            {children}
        </SharedCenteredAlert>
    );
}
