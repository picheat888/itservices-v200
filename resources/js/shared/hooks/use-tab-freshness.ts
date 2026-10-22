// One call per tab bar: refetch the opened tab's queries under the five-second rule, and a refresh mark for every tab.
import { sourceMayRefetch } from '@/shared/lib/freshness';
import {
    isBackgroundFetch,
    nextTabMark,
    REFRESH_DONE_MS,
    tabStamp,
    type RefreshMark,
    type TabMarkState,
    type TabSource,
} from '@/shared/lib/refresh-mark';
import { useEffect, useRef, useState } from 'react';

export type TabQuery = TabSource & { isEnabled?: boolean; refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown> };

/** `sources` maps every tab id to the queries its content shows; inactive tabs get 'idle' so the bar reserves room on all. */
export function useTabFreshness<T extends string>(active: T, sources: Record<T, readonly (TabQuery | undefined)[]>): Record<T, RefreshMark> {
    const activeSources = sources[active].filter((s): s is TabQuery => s !== undefined);
    const fetching = activeSources.some(isBackgroundFetch);
    const stamp = tabStamp(activeSources);

    const [state, setState] = useState<TabMarkState<T>>({ tab: active, mark: 'idle', since: stamp });
    const next = nextTabMark(state, active, fetching, stamp);
    if (next !== state) setState(next);

    useEffect(() => {
        if (state.mark !== 'done') return;
        const id = setTimeout(() => setState((s) => ({ ...s, mark: 'idle' })), REFRESH_DONE_MS);
        return () => clearTimeout(id);
    }, [state.mark]);

    // Tab switch: ask the opened tab's queries again when they are five seconds old
    const lastActive = useRef(active);
    useEffect(() => {
        if (lastActive.current === active) return;
        lastActive.current = active;
        const now = Date.now();
        for (const s of activeSources) {
            if (sourceMayRefetch(s, now)) void s.refetch({ cancelRefetch: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const marks = {} as Record<T, RefreshMark>;
    for (const id of Object.keys(sources) as T[]) {
        marks[id] = id === next.tab ? next.mark : 'idle';
    }
    return marks;
}
