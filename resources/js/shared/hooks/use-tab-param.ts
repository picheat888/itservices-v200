/**
 * The active tab of a page, kept in the URL as `?tab=<slug>` and nowhere else.
 *
 * - Read on every render from the URL (through `readTabParam`, so renamed tabs still land),
 *   checked with the page's own type guard; anything else (or no `?tab=`) is `fallback`.
 *   A reload, a shared link and the browser's Back / Forward therefore always show the tab
 *   the URL names.
 * - A tab press is its own history entry, so Back steps back through the tabs pressed
 *   (and only then leaves the page). Pressing the open tab again adds nothing.
 * - `{ replace: true }` is for moves the reader did not make — a redirect off a tab they may
 *   not open — so Back never bounces into it again.
 * - `extra` adjusts the other params in the same write (e.g. close a drawer on switch).
 *
 * Used by every module page with tabs (Settings, Tickets, Assets, …).
 */
import { readTabParam } from '@/shared/lib/tab-param';
import { useSearchParams } from 'react-router-dom';

export interface SetTabOptions {
    replace?: boolean;
    /** Edits the rest of the query string in the same navigation. */
    extra?: (params: URLSearchParams) => void;
    /** Leave `?tab=` out when the next tab is this one (a page whose default reads as the bare URL). */
    omitWhen?: string;
}

export function useTabParam<T extends string>(isTab: (value: string | null) => value is T, fallback: T): [T, (next: T, options?: SetTabOptions) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const fromUrl = readTabParam(searchParams.get('tab'));
    const tab: T = isTab(fromUrl) ? fromUrl : fallback;

    const setTab = (next: T, options: SetTabOptions = {}) => {
        if (next === tab && !options.extra) return;
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (options.omitWhen !== undefined && next === options.omitWhen) {
                    params.delete('tab');
                } else {
                    params.set('tab', next);
                }
                options.extra?.(params);
                return params;
            },
            { replace: options.replace ?? false },
        );
    };

    return [tab, setTab];
}
