// How many times a value has changed since it first showed: key an element on it to animate on news, not on load.
import { useState } from 'react';

export function useChangeCount<T>(value: T): number {
    const [seen, setSeen] = useState(value);
    const [changes, setChanges] = useState(0);
    if (!Object.is(value, seen)) {
        setSeen(value);
        setChanges(changes + 1);
    }
    return changes;
}
