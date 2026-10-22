// Seed a form once per record it opens on (key), never again when that record refreshes; a closed dialog (null) resets it.
import { needsSeed } from '@/shared/lib/form-rebase';
import { useEffect, useRef } from 'react';

export function useSeedOnce(key: string | number | null, seed: () => void): void {
    const seededFor = useRef<string | number | null>(null);
    useEffect(() => {
        if (key === null) {
            seededFor.current = null;
            return;
        }
        if (needsSeed(seededFor.current, key)) {
            seededFor.current = key;
            seed();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
}
