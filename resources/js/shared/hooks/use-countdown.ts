// Counts whole seconds down to zero from a wall-clock end time, so a throttled background tab stays right.
import { secondsLeft } from '@/shared/lib/countdown';
import { useEffect, useState } from 'react';

const TICK_MS = 500;

export function useCountdown(totalSeconds: number | null): { left: number; done: boolean } {
    const [left, setLeft] = useState(totalSeconds ?? 0);

    useEffect(() => {
        if (totalSeconds === null) {
            setLeft(0);
            return;
        }
        const endsAt = Date.now() + totalSeconds * 1_000;
        setLeft(totalSeconds);
        const timer = setInterval(() => {
            const next = secondsLeft(endsAt, Date.now());
            setLeft(next);
            if (next === 0) clearInterval(timer);
        }, TICK_MS);
        return () => clearInterval(timer);
    }, [totalSeconds]);

    return { left, done: totalSeconds === null || left === 0 };
}
