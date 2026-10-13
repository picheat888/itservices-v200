/**
 * A dialog whose open state lives in the URL as `?dialog=<name>` — the common web convention
 * for a modal over a page, alongside the app's `?tab=`. A link or bookmark with it opens the
 * dialog; a reload keeps it open; the browser's Back button closes it rather than leaving the
 * page.
 *
 * - Opening pushes a history entry (marked in its state), so Back pops just the dialog.
 * - Closing from inside (✕, Cancel, done) steps back over that entry when this page pushed it;
 *   when the dialog came in on the URL itself (a shared link), it removes the param in place
 *   instead, so the reader is not sent off the page.
 * - Other params (filters, ?tab=) are left as they are. A value not in `names` reads as closed.
 * - `setOpen(name, { over: true })` stacks on the open dialog; the third value names the one beneath.
 *
 * Used by the report pages' Export and Schedule dialogs (modules/report) and the app shell's
 * My Profile / Change password; `useShownDialogParam` mirrors a dialog the app raises itself.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const PARAM = 'dialog';

interface DialogState {
    dialogPushed?: boolean;
    dialogUnder?: string;
}

export function useDialogParam<T extends string>(names: readonly T[]): [T | null, (name: T | null, options?: { over?: boolean }) => void, T | null] {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as DialogState | null;
    const known = (value: string | null | undefined): T | null =>
        value != null && (names as readonly string[]).includes(value) ? (value as T) : null;

    const open = known(params.get(PARAM));
    // The dialog left open beneath this one (setOpen(name, { over: true })), kept in the history entry.
    const under = open === null ? null : known(state?.dialogUnder);

    const setOpen = (name: T | null, options: { over?: boolean } = {}) => {
        if (name !== null) {
            if (name === open) return;
            setParams(
                (next) => {
                    next.set(PARAM, name);
                    return next;
                },
                { state: { dialogPushed: true, dialogUnder: options.over ? (open ?? undefined) : undefined } satisfies DialogState },
            );
            return;
        }
        if (open === null) return;
        if (state?.dialogPushed) {
            navigate(-1);
            return;
        }
        setParams(
            (next) => {
                next.delete(PARAM);
                return next;
            },
            { replace: true },
        );
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
            { replace: true },
        );
    }, [name, shown, inUrl, setParams]);
}
