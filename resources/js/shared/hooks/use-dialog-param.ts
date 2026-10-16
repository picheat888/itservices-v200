// A dialog whose open state lives in the URL as `?dialog=<name>`: links and reloads open it, Back closes it.
// Opening pushes an entry (Back pops just the dialog); `{ over: true }` stacks on the open one; closing steps back
// over a pushed entry, else drops the param in place. URL writes elsewhere keep the entry's state (keepDialogState).
import { dialogCloseParams } from '@/shared/lib/dialog-search';
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const PARAM = 'dialog';

export interface SetDialogOptions {
    over?: boolean;
    inPlace?: boolean;
    /** Companion params written with `?dialog=` when opening. */
    with?: Record<string, string>;
}

interface DialogState {
    dialogPushed?: boolean;
    dialogUnder?: string;
}

/** The current history entry's state, for a replace write that must not drop an open dialog's stack. */
export function keepDialogState(): unknown {
    return (window.history.state as { usr?: unknown } | null)?.usr;
}

export function useDialogParam<T extends string>(
    names: readonly T[],
    companions: readonly string[] = [],
): [T | null, (name: T | null, options?: SetDialogOptions) => void, T | null] {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as DialogState | null;
    const known = (value: string | null | undefined): T | null =>
        value != null && (names as readonly string[]).includes(value) ? (value as T) : null;

    const open = known(params.get(PARAM));
    // The dialog left open beneath this one, kept in the history entry
    const under = open === null ? null : known(state?.dialogUnder);

    const setOpen = (name: T | null, options: SetDialogOptions = {}) => {
        if (name !== null) {
            if (name === open) return;
            setParams(
                (next) => {
                    next.set(PARAM, name);
                    Object.entries(options.with ?? {}).forEach(([key, value]) => next.set(key, value));
                    return next;
                },
                { state: { dialogPushed: true, dialogUnder: options.over ? (open ?? undefined) : undefined } satisfies DialogState },
            );
            return;
        }
        if (open === null) return;
        if (state?.dialogPushed && !options.inPlace) {
            navigate(-1);
            return;
        }
        setParams((next) => dialogCloseParams(next, companions), { replace: true });
    };

    return [open, setOpen, under];
}

/** Keeps `?dialog=<name>` in step with a dialog the app shows on its own (no history entry: Back cannot close it). */
export function useShownDialogParam(name: string, shown: boolean): void {
    const [params, setParams] = useSearchParams();
    const inUrl = params.get(PARAM) === name;

    useEffect(() => {
        if (shown === inUrl) return;
        setParams(
            (next) => {
                if (shown) next.set(PARAM, name);
                else next.delete(PARAM);
                return next;
            },
            { replace: true, state: keepDialogState() },
        );
    }, [name, shown, inUrl, setParams]);
}
