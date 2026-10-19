// How many times a live count has gone up since it first loaded: key a badge on it to pop on news, not on load.
import { useState } from 'react';
import { countRose } from './count-rise';

/** `count` is null while it is still loading. */
export function useCountRises(count: number | null): number {
    const [seen, setSeen] = useState<number | null>(null);
    const [rises, setRises] = useState(0);
    if (count !== null && count !== seen) {
        if (countRose(seen, count)) setRises(rises + 1);
        setSeen(count);
    }
    return rises;
}
