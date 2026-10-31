// Seed a form once per record it opens on (key), never again when that record refreshes; a closed dialog (null) resets it.
import { needsSeed } from '@/shared/lib/form-rebase';
import { useEffect, useRef, useState } from 'react';

/** Returns true once the seed for `key` has rendered, so a rebase never runs against the base it replaced. */
export function useSeedOnce(key: string | number | null, seed: () => void): boolean {
    const seededFor = useRef<string | number | null>(null);
    const [seededKey, setSeededKey] = useState<string | number | null>(null);
    useEffect(() => {
        if (key === null) {
            seededFor.current = null;
            setSeededKey(null);
            return;
        }
        if (needsSeed(seededFor.current, key)) {
            seededFor.current = key;
            seed();
            setSeededKey(key);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return key !== null && seededKey === key;
}
