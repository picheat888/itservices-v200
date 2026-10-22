// A dialog asks for its data again when it opens (five-second rule), including dialogs that stay mounted while closed.
import { refetchOnOpenRule } from '@/shared/lib/freshness';
import { useEffect, useRef } from 'react';

type OpenSource = {
    isEnabled?: boolean;
    isFetching: boolean;
    dataUpdatedAt: number;
    refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown>;
};

export function useRefetchOnOpen(open: boolean, ...sources: readonly (OpenSource | undefined)[]): void {
    const wasOpen = useRef(false);
    useEffect(() => {
        const now = Date.now();
        for (const s of sources) {
            if (s && s.isEnabled !== false && refetchOnOpenRule(wasOpen.current, open, s.isFetching, s.dataUpdatedAt, now))
                void s.refetch({ cancelRefetch: false });
        }
        wasOpen.current = open;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
}
