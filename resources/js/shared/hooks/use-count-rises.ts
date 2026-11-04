// How many times a live count has risen or changed since it first loaded: key a badge on it to pop on news, not on load.
import { countChanged, countRose } from '@/shared/lib/count-rise';
import { useState } from 'react';

/** `count` is null while it is still loading. */
export function useCountChanges(count: number | null): { rises: number; changes: number } {
    const [seen, setSeen] = useState<number | null>(null);
    const [rises, setRises] = useState(0);
    const [changes, setChanges] = useState(0);
    if (count !== null && count !== seen) {
        if (countRose(seen, count)) setRises(rises + 1);
        if (countChanged(seen, count)) setChanges(changes + 1);
        setSeen(count);
    }
    return { rises, changes };
}

export function useCountRises(count: number | null): number {
    return useCountChanges(count).rises;
}
