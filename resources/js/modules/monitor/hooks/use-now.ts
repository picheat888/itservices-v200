// The current time, re-rendering every `everyMs` (the monitor's countdowns tick once a second).
import { useEffect, useState } from 'react';

export function useNow(everyMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), everyMs);
        return () => window.clearInterval(id);
    }, [everyMs]);

    return now;
}
