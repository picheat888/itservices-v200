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
 *
 * Used by the report pages' Export and Schedule dialogs (modules/report).
 */
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const PARAM = 'dialog';

export function useDialogParam<T extends string>(names: readonly T[]): [T | null, (name: T | null) => void] {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    const value = params.get(PARAM);
    const open = value !== null && (names as readonly string[]).includes(value) ? (value as T) : null;

    const setOpen = (name: T | null) => {
        if (name !== null) {
            if (name === open) return;
            setParams(
                (next) => {
                    next.set(PARAM, name);
                    return next;
                },
                { state: { dialogPushed: true } },
            );
            return;
        }
        if (open === null) return;
        if ((location.state as { dialogPushed?: boolean } | null)?.dialogPushed) {
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

    return [open, setOpen];
}
