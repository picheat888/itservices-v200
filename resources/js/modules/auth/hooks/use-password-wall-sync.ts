// While a password wall is up, reload the account when another tab saves its password or the reader comes back to this tab, so a finished wall closes.
import { SESSION_CHANNEL } from '@/shared/lib/login-redirect';
import { ME_KEY } from '@/shared/lib/query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { parseSessionMessage } from '../lib/session-warning';

export function usePasswordWallSync(userId: number | undefined, wallUp: boolean): void {
    const qc = useQueryClient();

    useEffect(() => {
        if (!wallUp || userId === undefined) return;
        const reload = () => void qc.invalidateQueries({ queryKey: ME_KEY });

        // Saved in another tab
        const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL);
        if (channel) {
            channel.onmessage = (event: MessageEvent) => {
                const message = parseSessionMessage(event.data);
                if (message?.type === 'password' && message.userId === userId) reload();
            };
        }

        // Back on this tab: catch a save whose message was missed
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') reload();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            channel?.close();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [qc, userId, wallUp]);
}
