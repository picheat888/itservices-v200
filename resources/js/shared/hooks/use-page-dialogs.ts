// Page modals held in the URL (?view=<id>, ?edit=<id>, ?add=1, ?count=<id>): opening pushes a history entry so Back closes it;
// closing steps back over the entry it pushed, else drops the params in place (a link or a reload opened it).
import { passNextBack } from '@/shared/hooks/use-navigation-guard';
import { pageDialogClose } from '@/shared/lib/dialog-search';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

interface PageDialogState {
    /** The params this history entry was pushed to open. */
    pageDialog?: string[];
}

export function usePageDialogs() {
    const [, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const pushed = (location.state as PageDialogState | null)?.pageDialog ?? [];

    /** Opens a modal by setting `values` in a new history entry. */
    const open = (values: Record<string, string>) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                Object.entries(values).forEach(([key, value]) => next.set(key, value));
                return next;
            },
            { state: { pageDialog: Object.keys(values) } satisfies PageDialogState },
        );

    /** Closes the modal held in `keys`. */
    const close = (keys: readonly string[]) => {
        if (pageDialogClose(pushed, keys) === 'back') {
            // Already confirmed or saved: the dirty-form guard must not ask again
            passNextBack();
            navigate(-1);
            return;
        }
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                keys.forEach((key) => next.delete(key));
                return next;
            },
            { replace: true, state: location.state },
        );
    };

    /** Rewrites this entry in place (a saved edit landing on its detail); `nowPushed` says what the entry now holds open. */
    const replace = (change: (params: URLSearchParams) => void, nowPushed: readonly string[] = pushed) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                change(next);
                return next;
            },
            { replace: true, state: { pageDialog: [...nowPushed] } satisfies PageDialogState },
        );

    return { open, close, replace };
}
